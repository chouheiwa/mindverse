package store

import (
	"path/filepath"
	"testing"
)

func openTemp(t *testing.T) *DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestOpenRejectsEmptyPath(t *testing.T) {
	if _, err := Open("  "); err == nil {
		t.Fatal("空路径应报错")
	}
}

func TestPutAndReadPublicAnswers(t *testing.T) {
	db := openTemp(t)
	state := FetchState{QuestionID: "q1", Title: "问题一", FetchedAt: 100, IsEnd: false, NextOffset: 30}
	answers := []PublicAnswer{
		{AnswerToken: "a2", ContentType: "answer", URL: "u2", Summary: "s2"},
		{AnswerToken: "a1", ContentType: "answer", URL: "u1", Summary: "s1"},
	}
	if err := db.PutQuestionAnswers(state, answers); err != nil {
		t.Fatal(err)
	}
	got, err := db.PublicAnswers([]string{"q1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got["q1"]) != 2 {
		t.Fatalf("应有 2 条，实际 %d", len(got["q1"]))
	}
	// 读取顺序必须稳定，否则宇宙快照每次生成都不一样。
	if got["q1"][0].AnswerToken != "a1" || got["q1"][1].AnswerToken != "a2" {
		t.Errorf("顺序不稳定: %v", got["q1"])
	}
	if got["q1"][0].FetchedAt != 100 {
		t.Errorf("FetchedAt = %d，应取自抓取簿记", got["q1"][0].FetchedAt)
	}
	states, err := db.FetchStates()
	if err != nil {
		t.Fatal(err)
	}
	s := states["q1"]
	if s.AnswerCount != 2 || s.IsEnd || s.NextOffset != 30 || s.Title != "问题一" {
		t.Errorf("簿记不对: %+v", s)
	}
}

// 接口返回的是该问题当前的回答列表；增量合并会把已删除的回答永远留在库里。
func TestPutReplacesInsteadOfMerging(t *testing.T) {
	db := openTemp(t)
	first := FetchState{QuestionID: "q1", Title: "问题一", FetchedAt: 100, IsEnd: true, NextOffset: -1}
	if err := db.PutQuestionAnswers(first, []PublicAnswer{
		{AnswerToken: "a1", URL: "u1", Summary: "旧"},
		{AnswerToken: "gone", URL: "ug", Summary: "会被删掉的回答"},
	}); err != nil {
		t.Fatal(err)
	}
	second := FetchState{QuestionID: "q1", Title: "问题一", FetchedAt: 200, IsEnd: true, NextOffset: -1}
	if err := db.PutQuestionAnswers(second, []PublicAnswer{
		{AnswerToken: "a1", URL: "u1", Summary: "新"},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := db.PublicAnswers([]string{"q1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got["q1"]) != 1 {
		t.Fatalf("应只剩 1 条，实际 %d：旧回答没有被替换掉", len(got["q1"]))
	}
	if got["q1"][0].Summary != "新" {
		t.Errorf("Summary = %q，应为新值", got["q1"][0].Summary)
	}
}

func TestPublicAnswersEmptyRequestReturnsEmpty(t *testing.T) {
	db := openTemp(t)
	if err := db.PutQuestionAnswers(
		FetchState{QuestionID: "q1", Title: "t", FetchedAt: 1, IsEnd: true, NextOffset: -1},
		[]PublicAnswer{{AnswerToken: "a1"}}); err != nil {
		t.Fatal(err)
	}
	// 传空不该退化成「查全库」—— 那会把无关问题的回答塞进宇宙。
	got, err := db.PublicAnswers(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("空请求应返回空表，实际 %d 项", len(got))
	}
}

func TestPublicAnswersBatchesBeyondVariableLimit(t *testing.T) {
	db := openTemp(t)
	// 实测 SQLITE_MAX_VARIABLE_NUMBER = 32766：一次性拼这么多占位符会直接报
	// "too many SQL variables"。查询不需要行存在，所以空库就能钉住分批逻辑。
	const n = 40000
	ids := make([]string, 0, n)
	for i := 0; i < n; i++ {
		ids = append(ids, "q"+itoa(i))
	}
	got, err := db.PublicAnswers(ids)
	if err != nil {
		t.Fatalf("%d 个 ID 应分批查询: %v", n, err)
	}
	if len(got) != 0 {
		t.Fatalf("空库应返回空表，实际 %d 项", len(got))
	}
}

func TestStats(t *testing.T) {
	db := openTemp(t)
	for _, q := range []string{"q1", "q2"} {
		if err := db.PutQuestionAnswers(
			FetchState{QuestionID: q, Title: "t", FetchedAt: 1, IsEnd: true, NextOffset: -1},
			[]PublicAnswer{{AnswerToken: "a1"}, {AnswerToken: "a2"}}); err != nil {
			t.Fatal(err)
		}
	}
	questions, answers, err := db.Stats()
	if err != nil {
		t.Fatal(err)
	}
	if questions != 2 || answers != 4 {
		t.Fatalf("Stats = %d 问题 %d 回答，want 2 和 4", questions, answers)
	}
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var buf []byte
	for v > 0 {
		buf = append([]byte{byte('0' + v%10)}, buf...)
		v /= 10
	}
	return string(buf)
}
