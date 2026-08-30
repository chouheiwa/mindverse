package zhihu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
)

func TestMockProviderLoadsRealSample(t *testing.T) {
	p := &MockProvider{Path: "../../testdata/corpus_sample.json"}
	c, err := p.Fetch(context.Background())
	if err != nil {
		t.Fatalf("加载样本失败: %v", err)
	}
	total, own, fav := c.Stats()
	if total < 400 {
		t.Fatalf("样本条目过少: %d", total)
	}
	if own == 0 || fav == 0 {
		t.Fatalf("样本必须同时含创作与收藏，实际 own=%d fav=%d", own, fav)
	}
	if len(c.Favlists) == 0 {
		t.Fatal("样本缺少收藏夹，概念抽取的先验会失效")
	}
	// 收藏夹名是概念抽取的先验，必须能落到条目上。
	withFolder := 0
	for _, it := range c.Items {
		if len(it.Folders) > 0 {
			withFolder++
		}
	}
	if withFolder == 0 {
		t.Fatal("没有任何条目带收藏夹归属")
	}
	t.Logf("样本 %d 条（创作 %d / 收藏 %d），带收藏夹归属 %d 条", total, own, fav, withFolder)
}

func TestMergerWritesBindingsAndTimes(t *testing.T) {
	m := newMerger()
	m.addCollections([]CollectionItem{{
		ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456",
		Title: "标题", CreatedAt: 100, FavTime: 200,
	}}, "收藏夹")
	m.addContents([]ContentItem{{
		ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456",
		Title: "标题", CreatedAt: 100,
	}})

	got := m.result()
	if len(got) != 1 {
		t.Fatalf("合并后应有 1 条，实际 %d", len(got))
	}
	it := got[0]
	if it.PublishedAt != 100 {
		t.Fatalf("内容创建时间应写入 PublishedAt，实际 %d", it.PublishedAt)
	}
	if len(it.Bindings) != 2 || it.Bindings[0].Relation != RelationCollected || it.Bindings[1].Relation != RelationCreated {
		t.Fatalf("用户关系应分别保留 collected/created，实际 %#v", it.Bindings)
	}
	if len(it.DiscoverySources) != 2 || it.DiscoverySources[0] != DiscoveryFavoriteList || it.DiscoverySources[1] != DiscoveryOwnContent {
		t.Fatalf("发现来源应分别保留 favorite_list/own_content，实际 %#v", it.DiscoverySources)
	}
}

// 服务端会在列表中间谎报 IsEnd=true（丢弃失效条目后用「实收 < 请求」反推）。
// 这里复现该行为：第 2 页只回 1 条并置 IsEnd=true，但后面还有数据。
// 信 IsEnd 会停在 51 条；正确实现必须硬翻到空页，拿满 3 页。
func TestCollectIgnoresLyingIsEnd(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		off, _ := strconv.Atoi(r.URL.Query().Get("Offset"))
		var items []map[string]any
		switch {
		case off == 0:
			for i := 0; i < 50; i++ {
				items = append(items, map[string]any{"Url": fmt.Sprintf("u%d", off+i)})
			}
		case off == 50:
			items = append(items, map[string]any{"Url": "u50"}) // 少给一条并谎报到底
		case off == 100:
			for i := 0; i < 10; i++ {
				items = append(items, map[string]any{"Url": fmt.Sprintf("u%d", off+i)})
			}
		}
		lying := off == 50 || off >= 150
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Code": 0, "Message": "success",
			"Data": map[string]any{"Items": items, "Paging": map[string]any{"IsEnd": lying, "Totals": len(items)}},
		})
	}))
	defer srv.Close()

	c := &Client{AccessSecret: "x", BaseURL: srv.URL, HTTP: srv.Client()}
	got, err := c.Contents(context.Background(), TypeAll, 10)
	if err != nil {
		t.Fatalf("翻页失败: %v", err)
	}
	if len(got) != 61 {
		t.Fatalf("应硬翻到空页拿满 61 条，实际 %d 条（信 IsEnd 会停在 51）", len(got))
	}
	if hits != 4 {
		t.Fatalf("应请求 4 页（含终止用的空页），实际 %d", hits)
	}
}

// 失效条目会让 offset 与实收错位造成页间重叠，去重必须生效。
func TestCollectDedupesOverlap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		off, _ := strconv.Atoi(r.URL.Query().Get("Offset"))
		var items []map[string]any
		if off < 100 {
			for i := 0; i < 50; i++ {
				// 第二页刻意与第一页尾部重叠 10 条
				items = append(items, map[string]any{"Url": fmt.Sprintf("u%d", off+i-boolToInt(off > 0)*10)})
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Code": 0, "Message": "success",
			"Data": map[string]any{"Items": items, "Paging": map[string]any{}},
		})
	}))
	defer srv.Close()

	c := &Client{AccessSecret: "x", BaseURL: srv.URL, HTTP: srv.Client()}
	got, err := c.Contents(context.Background(), TypeAll, 10)
	if err != nil {
		t.Fatalf("翻页失败: %v", err)
	}
	if len(got) != 90 {
		t.Fatalf("重叠 10 条应被去重为 90 条，实际 %d", len(got))
	}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func TestCodeFromCallbackPrefersAuthorizationCode(t *testing.T) {
	// 实测回调参数名是 authorization_code；同时兼容 code。
	q := url.Values{"authorization_code": {"AAA"}, "code": {"BBB"}}
	if got := CodeFromCallback(q); got != "AAA" {
		t.Fatalf("应优先取 authorization_code，实际 %q", got)
	}
	if got := CodeFromCallback(url.Values{"code": {"BBB"}}); got != "BBB" {
		t.Fatalf("应回退到 code，实际 %q", got)
	}
}

func TestVerifyStateHandlesMissingState(t *testing.T) {
	// 实测回调可能完全不返回 state：此时放行但标记未校验。
	ok, checked := VerifyState("", "expected")
	if !ok || checked {
		t.Fatalf("缺失 state 应放行且标记未校验，实际 ok=%v checked=%v", ok, checked)
	}
	if ok, checked := VerifyState("wrong", "expected"); ok || !checked {
		t.Fatalf("state 不匹配必须拒绝，实际 ok=%v checked=%v", ok, checked)
	}
}

func TestDiagnoseCatchesCredentialSwaps(t *testing.T) {
	_, _, warns := Diagnose("12345", "12345", "secret-value-long-enough")
	if len(warns) == 0 {
		t.Fatal("App ID 被当成 App Key 时必须告警")
	}
	_, _, warns = Diagnose("12345", "same-value", "same-value")
	found := false
	for _, w := range warns {
		if w.Code == "APP_KEY_USED_AS_ACCESS_SECRET" {
			found = true
		}
	}
	if !found {
		t.Fatal("App Key 与 Access Secret 相同时必须告警")
	}
	// 诊断不得泄露原值。
	d, _, _ := Diagnose("1", "super-secret-app-key", "s")
	if len(d.SHA256Prefix) != 12 {
		t.Fatalf("哈希前缀长度应为 12，实际 %d", len(d.SHA256Prefix))
	}
}
