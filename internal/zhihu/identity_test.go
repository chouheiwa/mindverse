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

func TestResolveIdentityRejectsNonCanonicalQuestionURLs(t *testing.T) {
	tests := []struct {
		contentType ContentType
		rawID       string
		rawURL      string
	}{
		{TypeAnswer, "456", "http://www.zhihu.com/question/123/answer/456"},
		{TypeAnswer, "456", "https://user@www.zhihu.com/question/123/answer/456"},
		{TypeAnswer, "456", "https://www.zhihu.com:443/question/123/answer/456"},
		{TypeAnswer, "456", "https://www.zhihu.com/question/123/answer/456?utm_source=test"},
		{TypeAnswer, "456", "https://www.zhihu.com/question/123/answer/456?"},
		{TypeAnswer, "456", "https://www.zhihu.com/question/123/answer/456#section"},
		{TypeAnswer, "456", "https://www.zhihu.com/question/123/answer/456/"},
		{TypeAnswer, "456", "https://www.zhihu.com/question/123/answer/456/extra"},
		{TypeQuestion, "123", "https://www.zhihu.com/question/123/"},
	}
	for _, tt := range tests {
		t.Run(tt.rawURL, func(t *testing.T) {
			got := ResolveIdentity(tt.contentType, tt.rawID, tt.rawURL, "真实问题")
			if got.ContentID == "" || got.URL != tt.rawURL {
				t.Fatalf("非规范 URL 仍应保留稳定内容实体和原 URL：%+v", got)
			}
			if got.Admitted || got.QuestionID != "" || got.QuestionURL != "" {
				t.Fatalf("非规范 URL 不得准入问题行星：%+v", got)
			}
		})
	}
}

func TestResolveIdentityAcceptsCaseInsensitiveCanonicalHostname(t *testing.T) {
	got := ResolveIdentity(TypeQuestion, "123", "https://WWW.ZHIHU.COM/question/123", "真实问题")
	if !got.Admitted || got.QuestionID != "123" {
		t.Fatalf("主机名应按 URL 规则大小写不敏感：%+v", got)
	}
}

func TestResolveIdentityPreservesCanonicalArticleID(t *testing.T) {
	got := ResolveIdentity(TypeArticle, "", "https://zhuanlan.zhihu.com/p/789", "文章")
	if got.ContentID != "article:789" || got.Admitted {
		t.Fatalf("文章应保留稳定内容 ID 但不作为问题准入：%+v", got)
	}
}

func TestResolveIdentityRejectsRawAndURLIDMismatch(t *testing.T) {
	got := ResolveIdentity(TypeAnswer, "999", "https://www.zhihu.com/question/123/answer/456", "真实问题")

	if got.ContentID != "answer:999" {
		t.Fatalf("冲突时应保留 raw ID 作为稳定内容身份，实际 %q", got.ContentID)
	}
	if got.Admitted || got.QuestionID != "" || got.QuestionURL != "" {
		t.Fatalf("raw ID 与 URL ID 冲突时不得准入：%+v", got)
	}
}
