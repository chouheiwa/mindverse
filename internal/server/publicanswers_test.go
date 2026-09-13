package server

import (
	"path/filepath"
	"testing"

	"github.com/chouheiwa/mindverse/internal/store"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

func serverWithDB(t *testing.T) (*Server, *store.DB) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &Server{db: db}, db
}

func mineAnswer(rawID, questionID, title string) zhihu.Item {
	url := "https://www.zhihu.com/question/" + questionID + "/answer/" + rawID
	return zhihu.Item{
		Identity: zhihu.ResolveIdentity(zhihu.TypeAnswer, rawID, url, title),
		Type:     zhihu.TypeAnswer, URL: url, Title: title,
	}
}

func TestPublicAnswersForReadsOnlyCorpusQuestions(t *testing.T) {
	s, db := serverWithDB(t)
	put := func(qid, title string, tokens ...string) {
		answers := make([]store.PublicAnswer, 0, len(tokens))
		for _, tok := range tokens {
			answers = append(answers, store.PublicAnswer{
				AnswerToken: tok, ContentType: "answer",
				URL:     "https://www.zhihu.com/question/" + qid + "/answer/" + tok,
				Summary: "摘要 " + tok,
			})
		}
		if err := db.PutQuestionAnswers(
			store.FetchState{QuestionID: qid, Title: title, FetchedAt: 900, IsEnd: true, NextOffset: -1},
			answers); err != nil {
			t.Fatal(err)
		}
	}
	put("7", "我回答过的问题", "81", "82")
	put("99", "我从没碰过的问题", "991")

	items := []zhihu.Item{mineAnswer("8", "7", "我回答过的问题")}
	got := s.publicAnswersFor(items)
	if len(got) != 2 {
		t.Fatalf("应只带回问题 7 的 2 条，实际 %d: %+v", len(got), got)
	}
	for _, item := range got {
		if item.Identity.QuestionID != "7" {
			t.Errorf("不该带入问题 %s 的回答", item.Identity.QuestionID)
		}
		// 标题取自我的语料，不能是占位串。
		if item.Title != "我回答过的问题" {
			t.Errorf("Title = %q，应取自语料", item.Title)
		}
		// 接口没给作者、时间和赞数，这里必须留空而不是补。
		if item.PublishedAt != 0 || item.LikeCount != 0 || item.Author != "" {
			t.Errorf("缺失字段被补上了: %+v", item)
		}
		if item.ObservedAt != 900 {
			t.Errorf("ObservedAt = %d，应记录抓取时刻", item.ObservedAt)
		}
		if len(item.Bindings) != 0 {
			t.Errorf("别人的回答不该带绑定: %+v", item.Bindings)
		}
	}
}

func TestPublicAnswersForWithoutDBOrItems(t *testing.T) {
	s, _ := serverWithDB(t)
	if got := s.publicAnswersFor(nil); got != nil {
		t.Errorf("空语料应返回 nil，实际 %+v", got)
	}
	none := &Server{}
	if got := none.publicAnswersFor([]zhihu.Item{mineAnswer("8", "7", "标题")}); got != nil {
		t.Errorf("没有库时应返回 nil，实际 %+v", got)
	}
}

func TestPublicAnswerItemRejectsUnusable(t *testing.T) {
	cases := []struct {
		name   string
		title  string
		answer store.PublicAnswer
	}{
		{"没有 token", "标题", store.PublicAnswer{ContentType: "answer", URL: "u"}},
		{"没有问题标题", "", store.PublicAnswer{AnswerToken: "81", ContentType: "answer"}},
		{"不是回答", "标题", store.PublicAnswer{AnswerToken: "81", ContentType: "article"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, ok := publicAnswerItem("7", tc.title, tc.answer); ok {
				t.Error("应被拒绝")
			}
		})
	}
	// URL 缺失时按问题与 token 补全，这是拼装不是猜测。
	item, ok := publicAnswerItem("7", "标题", store.PublicAnswer{AnswerToken: "81", ContentType: "answer"})
	if !ok {
		t.Fatal("缺 URL 应能补全")
	}
	if item.URL != "https://www.zhihu.com/question/7/answer/81" {
		t.Errorf("URL = %q", item.URL)
	}
}
