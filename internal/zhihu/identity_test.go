package zhihu

import "testing"

func TestResolveAnswerIdentity(t *testing.T) {
	got := ResolveIdentity(TypeAnswer, "", "https://www.zhihu.com/question/123/answer/456", "真实问题")

	if got.ContentID != "answer:456" {
		t.Fatalf("内容 ID 应为 answer:456，实际 %q", got.ContentID)
	}
	if got.QuestionID != "123" {
		t.Fatalf("问题 ID 应为 123，实际 %q", got.QuestionID)
	}
	if got.QuestionURL != "https://www.zhihu.com/question/123" {
		t.Fatalf("问题 URL 应规范化，实际 %q", got.QuestionURL)
	}
	if !got.Admitted {
		t.Fatal("真实问题 ID、标题和规范 URL 齐全时应准入问题行星")
	}
}

func TestResolveIdentityRejectsSyntheticQuestion(t *testing.T) {
	tests := []struct {
		name  string
		url   string
		title string
	}{
		{name: "missing real question id", url: "https://www.zhihu.com/answer/456", title: "标题"},
		{name: "missing title", url: "https://www.zhihu.com/question/123/answer/456"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveIdentity(TypeAnswer, "456", tt.url, tt.title)
			if got.ContentID == "" || got.URL != tt.url {
				t.Fatalf("解析失败仍必须保留稳定内容实体和原 URL：%+v", got)
			}
			if got.Admitted || got.QuestionID != "" || got.QuestionURL != "" {
				t.Fatalf("不得合成问题身份：%+v", got)
			}
		})
	}
}
