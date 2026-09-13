package server

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/chouheiwa/mindverse/internal/store"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// publicAnswersFor 读取语料里这些问题下别人的回答。
//
// 只查语料中已经出现的问题：行星是你留下痕迹的地方，没有痕迹的问题不该被带进来。
// 库读不到不算失败 —— 少一层别人的回答，宇宙照样成立。
func (s *Server) publicAnswersFor(items []zhihu.Item) []zhihu.Item {
	if s.db == nil || len(items) == 0 {
		return nil
	}
	titles := questionTitles(items)
	if len(titles) == 0 {
		return nil
	}
	ids := make([]string, 0, len(titles))
	for id := range titles {
		ids = append(ids, id)
	}
	byQuestion, err := s.db.PublicAnswers(ids)
	if err != nil {
		log.Printf("读取公共回答失败，本次不带别人的回答: %v", err)
		return nil
	}
	out := make([]zhihu.Item, 0, len(byQuestion))
	for questionID, answers := range byQuestion {
		for _, a := range answers {
			if item, ok := publicAnswerItem(questionID, titles[questionID], a); ok {
				out = append(out, item)
			}
		}
	}
	return out
}

// questionTitles 收集语料里出现过的问题 ID 及其标题。
//
// 标题取自我的语料而不是库里的抓取簿记：卫星的 Title 是问题标题，
// 用占位串会把假标题漏到界面上。
func questionTitles(items []zhihu.Item) map[string]string {
	titles := map[string]string{}
	for i := range items {
		id := strings.TrimSpace(items[i].Identity.QuestionID)
		title := strings.TrimSpace(items[i].Title)
		if id == "" || title == "" {
			continue
		}
		if _, seen := titles[id]; !seen {
			titles[id] = title
		}
	}
	return titles
}

// publicAnswerItem 把一条公共回答摘要变成引擎认得的 Item。
//
// 接口只给 ContentType、token、URL 和 Summary：没有作者、没有时间、没有赞数。
// 这里如实留空，不猜也不补 —— 缺时间的回答会落到地层的「未定年」一栏，
// 那一栏本来就是为数据不足准备的。
func publicAnswerItem(questionID, questionTitle string, a store.PublicAnswer) (zhihu.Item, bool) {
	token := strings.TrimSpace(a.AnswerToken)
	if token == "" || questionTitle == "" || !strings.EqualFold(strings.TrimSpace(a.ContentType), "answer") {
		return zhihu.Item{}, false
	}
	url := strings.TrimSpace(a.URL)
	if url == "" {
		url = "https://www.zhihu.com/question/" + questionID + "/answer/" + token
	}
	// 标题必须和该问题一致，否则 ResolveIdentity 不会承认这条回答。
	identity := zhihu.ResolveIdentity(zhihu.TypeAnswer, token, url, questionTitle)
	if !identity.Admitted || identity.QuestionID != questionID {
		return zhihu.Item{}, false
	}
	return zhihu.Item{
		Identity:   identity,
		Type:       zhihu.TypeAnswer,
		URL:        url,
		Title:      questionTitle,
		Summary:    a.Summary,
		ObservedAt: a.FetchedAt,
	}, true
}

// openLocalDB 打开本地 SQLite。
//
// 路径为空视为「这次不带公共回答」，而不是报错：mock 演示和单测都不需要库，
// 少一层别人的回答宇宙照样成立。
func openLocalDB(path string) (*store.DB, error) {
	if strings.TrimSpace(path) == "" {
		return nil, nil
	}
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("创建数据库目录 %s: %w", dir, err)
		}
	}
	db, err := store.Open(path)
	if err != nil {
		return nil, err
	}
	questions, answers, err := db.Stats()
	if err != nil {
		db.Close()
		return nil, err
	}
	log.Printf("本地库 %s：%d 个问题、%d 条公共回答", path, questions, answers)
	return db, nil
}
