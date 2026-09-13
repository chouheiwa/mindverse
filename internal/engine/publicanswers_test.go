package engine

import (
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// 公共回答挂到已有行星上：那颗行星下面不再只有我自己的回答。
func TestPublicAnswersAttachToExistingQuestion(t *testing.T) {
	mine := admittedAnswer("8", "7", "Question title")
	mine.Summary = "我写的"
	mine.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 100}}

	theirs := admittedAnswer("9", "7", "Question title")
	theirs.Summary = "别人写的"

	u, err := Run(Input{
		Items:         []zhihu.Item{mine},
		Concepts:      [][]string{{"Concept"}},
		PublicAnswers: []zhihu.Item{theirs},
	}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Questions) != 1 {
		t.Fatalf("应只有 1 颗行星，实际 %d", len(u.Questions))
	}
	if got := len(u.Questions[0].AnswerIDs); got != 2 {
		t.Fatalf("行星下应有 2 条回答，实际 %d: %v", got, u.Questions[0].AnswerIDs)
	}
	if len(u.Answers) != 2 {
		t.Fatalf("应有 2 条卫星，实际 %d", len(u.Answers))
	}
	var public *AnswerSatellite
	for i := range u.Answers {
		if u.Answers[i].ID == "answer:9" {
			public = &u.Answers[i]
		}
	}
	if public == nil {
		t.Fatal("别人的回答没有进入宇宙")
	}
	if len(public.Bindings) != 0 {
		t.Errorf("别人的回答不该带我的绑定: %+v", public.Bindings)
	}
	if public.Summary != "别人写的" {
		t.Errorf("Summary = %q", public.Summary)
	}
}

// 别人的回答不能凭空造出一颗行星：行星存在的理由是我在那儿留过痕迹。
func TestPublicAnswersNeverCreateQuestions(t *testing.T) {
	mine := admittedAnswer("8", "7", "Question title")
	mine.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 100}}
	// 问题 99 我从没碰过。
	stranger := admittedAnswer("100", "99", "陌生问题")

	u, err := Run(Input{
		Items:         []zhihu.Item{mine},
		Concepts:      [][]string{{"Concept"}},
		PublicAnswers: []zhihu.Item{stranger},
	}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Questions) != 1 || u.Questions[0].QuestionID != "7" {
		t.Fatalf("只该有问题 7 这一颗行星，实际 %+v", u.Questions)
	}
	for _, a := range u.Answers {
		if a.ID == "answer:100" {
			t.Fatal("陌生问题下的回答不该进入宇宙")
		}
	}
}

// 恒星是我的私有概念：公共回答不参与概念、聚类和证据。
func TestPublicAnswersDoNotAffectStars(t *testing.T) {
	mine := admittedAnswer("8", "7", "Question title")
	mine.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 100}}
	base, err := Run(Input{Items: []zhihu.Item{mine}, Concepts: [][]string{{"Concept"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}

	loud := admittedAnswer("9", "7", "Question title")
	loud.Summary = "别人反复提到某个完全不同的概念"
	withPublic, err := Run(Input{
		Items:         []zhihu.Item{mine},
		Concepts:      [][]string{{"Concept"}},
		PublicAnswers: []zhihu.Item{loud},
	}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(base.Stars) != len(withPublic.Stars) {
		t.Fatalf("恒星数变了: %d -> %d", len(base.Stars), len(withPublic.Stars))
	}
	for i := range base.Stars {
		if base.Stars[i].ID != withPublic.Stars[i].ID {
			t.Fatalf("恒星变了: %s -> %s", base.Stars[i].ID, withPublic.Stars[i].ID)
		}
		if len(base.Stars[i].Evidence) != len(withPublic.Stars[i].Evidence) {
			t.Fatalf("恒星 %s 的证据条数变了: %d -> %d", base.Stars[i].ID,
				len(base.Stars[i].Evidence), len(withPublic.Stars[i].Evidence))
		}
	}
	if len(base.Clusters) != len(withPublic.Clusters) {
		t.Fatalf("星群数变了: %d -> %d", len(base.Clusters), len(withPublic.Clusters))
	}
}

// 接口会把我自己那条也返回回来；我的语料更完整，不能被摘要覆盖。
func TestPublicAnswersNeverOverwriteMine(t *testing.T) {
	mine := admittedAnswer("8", "7", "Question title")
	mine.Summary = "我写的完整摘要"
	mine.LikeCount = 42
	mine.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 100}}

	same := admittedAnswer("8", "7", "Question title")
	same.Summary = "接口返回的截断摘要"

	u, err := Run(Input{
		Items:         []zhihu.Item{mine},
		Concepts:      [][]string{{"Concept"}},
		PublicAnswers: []zhihu.Item{same},
	}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Answers) != 1 {
		t.Fatalf("同一条回答应去重成 1 条，实际 %d", len(u.Answers))
	}
	if u.Answers[0].Summary != "我写的完整摘要" {
		t.Errorf("Summary = %q，我的语料应当优先", u.Answers[0].Summary)
	}
	if u.Answers[0].LikeCount != 42 {
		t.Errorf("LikeCount = %d，应保留 42", u.Answers[0].LikeCount)
	}
	if len(u.Answers[0].Bindings) != 1 {
		t.Errorf("我的绑定被抹掉了: %+v", u.Answers[0].Bindings)
	}
}
