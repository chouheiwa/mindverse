// Package store 是 mindverse 的本地持久层。
//
// 这里只放「抓回来就不该再抓一次」的公共数据：问题下的回答摘要。
// 开放平台的 question_answers 每天只有 100 次额度，而一份语料有三百多个问题 ——
// 不落盘就意味着每次演示都要重新烧额度，而且一天也抓不完。
//
// 私人数据不进这里：OAuth token 和私人宇宙仍然只存内存。
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite" // 纯 Go 驱动，CGO_ENABLED=0 也能编，便于进 scratch 镜像
)

// PublicAnswer 是问题下的一条公共回答。
//
// 字段就是开放平台 question_answers 返回的全部内容：没有作者、没有发布时间、
// 没有赞数。缺的字段不在这里补，也不在这里猜。
type PublicAnswer struct {
	QuestionID  string
	AnswerToken string
	ContentType string
	URL         string
	Summary     string
	FetchedAt   int64
}

// FetchState 是一个问题的抓取簿记，用于续跑。
type FetchState struct {
	QuestionID  string
	Title       string
	FetchedAt   int64
	AnswerCount int
	IsEnd       bool
	// NextOffset 为负表示服务端没给下一页偏移。
	NextOffset int64
}

// DB 是打开的本地库。
type DB struct{ sql *sql.DB }

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS question_fetch (
  question_id  TEXT    PRIMARY KEY,
  title        TEXT    NOT NULL,
  fetched_at   INTEGER NOT NULL,
  answer_count INTEGER NOT NULL,
  is_end       INTEGER NOT NULL,
  next_offset  INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS question_answer (
  question_id  TEXT    NOT NULL,
  answer_token TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  summary      TEXT    NOT NULL,
  fetched_at   INTEGER NOT NULL,
  PRIMARY KEY (question_id, answer_token),
  FOREIGN KEY (question_id) REFERENCES question_fetch(question_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_question_answer_question ON question_answer(question_id);
`

// Open 打开或创建本地库并建表。
func Open(path string) (*DB, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("store: 数据库路径为空")
	}
	handle, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("store: 打开 %s: %w", path, err)
	}
	// SQLite 单写者：并发写会拿不到锁，这里限成一条连接，让排队发生在进程内。
	handle.SetMaxOpenConns(1)
	if _, err := handle.Exec(schema); err != nil {
		handle.Close()
		return nil, fmt.Errorf("store: 建表: %w", err)
	}
	return &DB{sql: handle}, nil
}

// Close 关闭库。
func (d *DB) Close() error {
	if d == nil || d.sql == nil {
		return nil
	}
	return d.sql.Close()
}

// PutQuestionAnswers 覆盖写入一个问题的抓取结果。
//
// 整个问题作为一个事务替换：接口返回的是该问题当前的回答列表，
// 增量合并只会把已删除的回答永久留在库里。
func (d *DB) PutQuestionAnswers(state FetchState, answers []PublicAnswer) error {
	if strings.TrimSpace(state.QuestionID) == "" {
		return errors.New("store: questionID 为空")
	}
	tx, err := d.sql.Begin()
	if err != nil {
		return fmt.Errorf("store: 开启事务: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`INSERT INTO question_fetch (question_id, title, fetched_at, answer_count, is_end, next_offset)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(question_id) DO UPDATE SET
		   title = excluded.title, fetched_at = excluded.fetched_at,
		   answer_count = excluded.answer_count, is_end = excluded.is_end,
		   next_offset = excluded.next_offset`,
		state.QuestionID, state.Title, state.FetchedAt, len(answers), boolToInt(state.IsEnd), state.NextOffset,
	); err != nil {
		return fmt.Errorf("store: 写入抓取簿记: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM question_answer WHERE question_id = ?`, state.QuestionID); err != nil {
		return fmt.Errorf("store: 清理旧回答: %w", err)
	}
	stmt, err := tx.Prepare(
		`INSERT INTO question_answer (question_id, answer_token, content_type, url, summary, fetched_at)
		 VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("store: 准备插入: %w", err)
	}
	defer stmt.Close()
	for _, a := range answers {
		if strings.TrimSpace(a.AnswerToken) == "" {
			continue
		}
		if _, err := stmt.Exec(state.QuestionID, a.AnswerToken, a.ContentType, a.URL, a.Summary, state.FetchedAt); err != nil {
			return fmt.Errorf("store: 插入回答 %s: %w", a.AnswerToken, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("store: 提交: %w", err)
	}
	return nil
}

// PublicAnswers 按问题读取公共回答；questionIDs 为空时返回空表而不是全库。
func (d *DB) PublicAnswers(questionIDs []string) (map[string][]PublicAnswer, error) {
	out := map[string][]PublicAnswer{}
	wanted := make([]any, 0, len(questionIDs))
	seen := map[string]bool{}
	for _, id := range questionIDs {
		if id = strings.TrimSpace(id); id != "" && !seen[id] {
			seen[id] = true
			wanted = append(wanted, id)
		}
	}
	if len(wanted) == 0 {
		return out, nil
	}
	// SQLite 的 SQLITE_MAX_VARIABLE_NUMBER 实测为 32766（modernc.org/sqlite v1.58.0，
	// 超出即 "too many SQL variables"）。留足余量分批，问题数再多也不会撞上。
	const batch = 500
	for start := 0; start < len(wanted); start += batch {
		end := min(start+batch, len(wanted))
		chunk := wanted[start:end]
		query := `SELECT question_id, answer_token, content_type, url, summary, fetched_at
		          FROM question_answer WHERE question_id IN (` +
			strings.TrimSuffix(strings.Repeat("?,", len(chunk)), ",") +
			`) ORDER BY question_id, answer_token`
		rows, err := d.sql.Query(query, chunk...)
		if err != nil {
			return nil, fmt.Errorf("store: 查询公共回答: %w", err)
		}
		for rows.Next() {
			var a PublicAnswer
			if err := rows.Scan(&a.QuestionID, &a.AnswerToken, &a.ContentType, &a.URL, &a.Summary, &a.FetchedAt); err != nil {
				rows.Close()
				return nil, fmt.Errorf("store: 读取公共回答: %w", err)
			}
			out[a.QuestionID] = append(out[a.QuestionID], a)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fmt.Errorf("store: 遍历公共回答: %w", err)
		}
	}
	return out, nil
}

// FetchStates 返回全部抓取簿记，用于续跑时跳过已抓问题。
func (d *DB) FetchStates() (map[string]FetchState, error) {
	rows, err := d.sql.Query(
		`SELECT question_id, title, fetched_at, answer_count, is_end, next_offset FROM question_fetch`)
	if err != nil {
		return nil, fmt.Errorf("store: 查询抓取簿记: %w", err)
	}
	defer rows.Close()
	out := map[string]FetchState{}
	for rows.Next() {
		var s FetchState
		var isEnd int
		if err := rows.Scan(&s.QuestionID, &s.Title, &s.FetchedAt, &s.AnswerCount, &isEnd, &s.NextOffset); err != nil {
			return nil, fmt.Errorf("store: 读取抓取簿记: %w", err)
		}
		s.IsEnd = isEnd != 0
		out[s.QuestionID] = s
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: 遍历抓取簿记: %w", err)
	}
	return out, nil
}

// Stats 返回库里有多少问题和多少条回答。
func (d *DB) Stats() (questions, answers int, err error) {
	if err := d.sql.QueryRow(`SELECT COUNT(*) FROM question_fetch`).Scan(&questions); err != nil {
		return 0, 0, fmt.Errorf("store: 统计问题: %w", err)
	}
	if err := d.sql.QueryRow(`SELECT COUNT(*) FROM question_answer`).Scan(&answers); err != nil {
		return 0, 0, fmt.Errorf("store: 统计回答: %w", err)
	}
	return questions, answers, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

// Now 是写入时间戳的取值口，测试可替换。
var Now = func() int64 { return time.Now().Unix() }
