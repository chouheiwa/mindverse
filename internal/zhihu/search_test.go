package zhihu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// 无法在测试里使用真实凭证，因此对着假服务器验证请求形态与解析。
// 请求契约来自官方 HTTP API 文档：Query 必填，Count 最大 10。
func TestSearchZhihuRequestShape(t *testing.T) {
	var got *http.Request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Clone(r.Context())
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Code": 0, "Message": "success",
			"Data": map[string]any{
				"HasMore": false,
				"Items": []map[string]any{{
					"Title": "为什么你总是抓不到狼", "ContentType": "Article",
					"ContentText": "桌游里藏着的分布式系统难题", "Url": "https://zhuanlan.zhihu.com/p/1",
					"VoteUpCount": 42, "AuthorName": "某人", "EditTime": 1700000000,
				}},
			},
		})
	}))
	defer srv.Close()

	c := NewClient("secret", "")
	c.BaseURL = srv.URL

	items, err := c.SearchZhihu(context.Background(), "桌游 分布式", 99) // 超上限
	if err != nil {
		t.Fatalf("搜索失败: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("应解析出 1 条，实际 %d", len(items))
	}
	q := got.URL.Query()
	if q.Get("Query") != "桌游 分布式" {
		t.Errorf("Query 参数不对: %q", q.Get("Query"))
	}
	if q.Get("Count") != "10" {
		t.Errorf("Count 超过 10 必须收敛到 10，实际 %q", q.Get("Count"))
	}
	if got.Header.Get("Authorization") != "Bearer secret" {
		t.Error("缺少或写错 Authorization 头")
	}
	if got.Header.Get("X-Request-Timestamp") == "" {
		t.Error("缺少 X-Request-Timestamp")
	}
	if got.Header.Get("X-OAuth-Token") != "" {
		t.Error("公共内容搜索不应带 X-OAuth-Token —— 游客模式没有用户令牌")
	}
}

func TestSearchZhihuMapsAuthError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"Code": CodeAuth, "Message": "Authorization failed"})
	}))
	defer srv.Close()
	c := NewClient("bad", "")
	c.BaseURL = srv.URL
	_, err := c.SearchZhihu(context.Background(), "x", 5)
	var ae *APIError
	if !asAPIError(err, &ae) || ae.Code != CodeAuth {
		t.Fatalf("鉴权失败必须映射成 APIError(20001)，实际 %v", err)
	}
	if ae.Retryable() {
		t.Error("鉴权失败不该被判为可重试")
	}
}

func TestSearchItemToItem(t *testing.T) {
	s := SearchItem{
		Title: "标题", ContentText: "摘要", ContentType: "Article",
		URL: "https://zhuanlan.zhihu.com/p/1", EditTime: 1700000000, VoteUpCount: 7,
	}
	it := s.ToItem("游戏与博弈", func() time.Time { return time.Unix(1800000000, 0) })
	if it.Own {
		t.Error("种子星是「你想看的」，不是「你写过的」—— Own 必须为 false，否则暗物质判据会失效")
	}
	if it.Type != TypeArticle {
		t.Errorf("类型应归一化为小写 article，实际 %q", it.Type)
	}
	if len(it.ConceptHints) != 1 || it.ConceptHints[0] != "游戏与博弈" {
		t.Error("方向名要作为公共搜索先验注入概念抽取")
	}
	if len(it.Folders) != 0 {
		t.Fatal("公共搜索方向不得写入 legacy 收藏夹")
	}
}

func TestSearchResultHasDiscoveryWithoutUserBinding(t *testing.T) {
	s := SearchItem{ContentType: "Answer", ContentID: "456", URL: "https://www.zhihu.com/question/123/answer/456", Title: "标题"}
	it := s.ToItem("", func() time.Time { return time.Unix(1800000000, 0) })

	if len(it.DiscoverySources) != 1 || it.DiscoverySources[0] != DiscoveryPublicSearch {
		t.Fatalf("公共搜索应只记录 public_search 发现来源，实际 %#v", it.DiscoverySources)
	}
	if len(it.Bindings) != 0 {
		t.Fatalf("公共搜索不是用户关系，实际 %#v", it.Bindings)
	}
	if it.FavTime != 0 {
		t.Fatalf("公共搜索不得伪造收藏时间，实际 %d", it.FavTime)
	}
	_, own, fav := (&Corpus{Items: []Item{it}}).Stats()
	if own != 0 || fav != 0 {
		t.Fatalf("公共发现不得计入用户创作或收藏，实际 own=%d fav=%d", own, fav)
	}
}

func TestSearchEditTimeIsNeverPublishedTime(t *testing.T) {
	const edited = int64(1700000000)
	const observed = int64(1800000000)
	s := SearchItem{ContentType: "Article", ContentID: "1", URL: "https://zhuanlan.zhihu.com/p/1", Title: "标题", EditTime: edited}
	it := s.ToItem("", func() time.Time { return time.Unix(observed, 0) })

	if it.PublishedAt != 0 || it.CreatedAt != 0 {
		t.Fatalf("EditTime 不得冒充发表时间：PublishedAt=%d CreatedAt=%d", it.PublishedAt, it.CreatedAt)
	}
	if it.UpdatedAt != edited {
		t.Fatalf("EditTime 应只映射到 UpdatedAt，实际 %d", it.UpdatedAt)
	}
	if it.ObservedAt != observed {
		t.Fatalf("观测时间应由注入时钟决定，实际 %d", it.ObservedAt)
	}
}

func TestSearchUnknownTypeIsNeverTreatedAsAnswer(t *testing.T) {
	s := SearchItem{ContentType: "Mystery", ContentID: "456", URL: "https://www.zhihu.com/question/123/answer/456", Title: "标题"}
	it := s.ToItem("", func() time.Time { return time.Unix(1800000000, 0) })
	if it.Type != TypeUnknown || it.Identity.Type != TypeUnknown {
		t.Fatalf("未知搜索类型必须保留为 unknown：Item=%q Identity=%q", it.Type, it.Identity.Type)
	}
	if it.Identity.Admitted || it.Identity.QuestionID != "" {
		t.Fatalf("未知类型不得因 answer 形状 URL 而准入：%+v", it.Identity)
	}
}
