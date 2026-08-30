package zhihu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestItemTruthHelpersPreferBindingsAndNewTimes(t *testing.T) {
	it := Item{
		Bindings:    []UserContentBinding{{Relation: RelationCreated, At: 100}, {Relation: RelationCollected, At: 200}},
		PublishedAt: 110,
		Own:         false, CreatedAt: 10, FavTime: 20,
	}
	if !it.IsCreated() || !it.IsCollected() {
		t.Fatalf("新用户关系应优先于 legacy Own：%+v", it)
	}
	if it.EffectivePublishedAt() != 110 || it.EffectiveCollectedAt() != 200 || it.EffectiveTime() != 200 {
		t.Fatalf("新时间字段应优先于 legacy 时间：published=%d collected=%d effective=%d",
			it.EffectivePublishedAt(), it.EffectiveCollectedAt(), it.EffectiveTime())
	}
	public := Item{Identity: ContentIdentity{ContentID: "answer:1"}, DiscoverySources: []DiscoverySource{DiscoveryPublicSearch}, Own: false}
	if public.IsCreated() || public.IsCollected() {
		t.Fatal("公共发现不得通过 legacy Own=false 回退成收藏")
	}
}

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
	if it.Own || it.CreatedAt != 0 || it.FavTime != 0 {
		t.Fatalf("新采集路径不得双写 legacy 关系/时间：%+v", it)
	}
}

func TestMergerDedupesCanonicalHostnameCaseAndSortsBindingFolders(t *testing.T) {
	m := newMerger()
	m.addCollections([]CollectionItem{{
		ContentType: TypeAnswer, URL: "https://WWW.ZHIHU.COM/question/123/answer/456", Title: "标题", FavTime: 200,
		Favlists: []ContentFavlistItem{{Title: "Zeta"}, {Title: "Alpha"}},
	}}, "Middle")
	m.addContents([]ContentItem{{
		ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456", Title: "标题", CreatedAt: 100,
	}})

	got := m.result()
	if len(got) != 1 {
		t.Fatalf("同一稳定 ContentID 的主机名大小写变体应合并，实际 %d 条", len(got))
	}
	if !got[0].IsCreated() || !got[0].IsCollected() {
		t.Fatalf("合并后应保留创作和收藏关系：%#v", got[0].Bindings)
	}
	if len(got[0].Folders) != 0 {
		t.Fatal("新 merger 不得双写 legacy 收藏夹")
	}
	want := []string{"Alpha", "Middle", "Zeta"}
	if folders := got[0].EffectiveFolders(); fmt.Sprint(folders) != fmt.Sprint(want) {
		t.Fatalf("绑定收藏夹应确定性排序：got=%v want=%v", folders, want)
	}
}

func TestMergerKeepsDistinctEmptyURLFallbackIdentities(t *testing.T) {
	m := newMerger()
	m.addContents([]ContentItem{
		{ContentType: TypeAnswer, Title: "相同标题"},
		{ContentType: TypeAnswer, Title: "相同标题"},
	})
	got := m.result()
	if len(got) != 2 {
		t.Fatalf("空 URL 但稳定内容不同时不得折叠，实际 %d 条", len(got))
	}
	for _, it := range got {
		if it.Identity.Resolved || it.Identity.ContentID != "" || !strings.HasPrefix(it.Identity.EvidenceKey, "evidence:unresolved:") {
			t.Fatalf("空身份必须作为 unresolved 证据保留：%+v", it.Identity)
		}
	}
	if got[0].Identity.EvidenceKey == got[1].Identity.EvidenceKey {
		t.Fatal("无稳定身份的两条输入不得全局去重")
	}
}

func TestMergerPreservesIncompatibleIdentityConflicts(t *testing.T) {
	items := []CollectionItem{
		{ContentID: "456", ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456", Title: "A"},
		{ContentID: "456", ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/999/answer/456", Title: "B"},
	}
	m := newMerger()
	m.addCollections(items, "")
	got := m.result()
	if len(got) != 2 {
		t.Fatalf("同 ID 但不兼容的不可变身份必须分开保留，实际 %d 条", len(got))
	}
	for _, it := range got {
		if it.Identity.Resolved || it.Identity.Admitted || it.Identity.QuestionID != "" || it.Identity.QuestionURL != "" {
			t.Fatalf("同 ContentID 的问题归属冲突必须被隔离为未准入证据：%+v", it.Identity)
		}
		if !strings.HasPrefix(it.Identity.EvidenceKey, "evidence:conflict:") {
			t.Fatalf("冲突证据必须有可观测键：%+v", it.Identity)
		}
	}
	if got[0].Identity.EvidenceKey == got[1].Identity.EvidenceKey {
		t.Fatal("冲突证据键必须互异")
	}
	mReverse := newMerger()
	mReverse.addCollections([]CollectionItem{items[1], items[0]}, "")
	reversed := mReverse.result()
	gotIDs := []string{got[0].Identity.EvidenceKey, got[1].Identity.EvidenceKey}
	reversedIDs := []string{reversed[0].Identity.EvidenceKey, reversed[1].Identity.EvidenceKey}
	sort.Strings(gotIDs)
	sort.Strings(reversedIDs)
	if fmt.Sprint(gotIDs) != fmt.Sprint(reversedIDs) {
		t.Fatalf("冲突 ID 不得受输入顺序影响：got=%v reversed=%v", gotIDs, reversedIDs)
	}
}

func TestMergerTimestampsAreOrderIndependent(t *testing.T) {
	items := []CollectionItem{
		{ContentID: "456", ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456", Title: "A", CreatedAt: 200, FavTime: 400},
		{ContentID: "456", ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456", Title: "A", CreatedAt: 100, FavTime: 300},
	}
	merge := func(items []CollectionItem) Item {
		m := newMerger(500)
		m.addCollections(items, "folder")
		return m.result()[0]
	}
	forward := merge(items)
	reverse := merge([]CollectionItem{items[1], items[0]})
	if !reflect.DeepEqual(forward, reverse) {
		t.Fatalf("时间合并不得受输入顺序影响：forward=%+v reverse=%+v", forward, reverse)
	}
	if forward.PublishedAt != 100 || forward.ObservedAt != 500 || forward.EffectiveCollectedAt() != 300 {
		t.Fatalf("应保留最早首发/观测/收藏时间：%+v", forward)
	}
}

func TestMergerResultDeepCopiesNestedSlices(t *testing.T) {
	m := newMerger()
	m.addCollections([]CollectionItem{{
		ContentID: "456", ContentType: TypeAnswer, URL: "https://www.zhihu.com/question/123/answer/456", Title: "A",
		Favlists: []ContentFavlistItem{{Title: "folder"}},
	}}, "")
	first := m.result()
	first[0].Bindings[0].Folders[0] = "mutated"
	first[0].Bindings[0].Relation = RelationCreated
	first[0].DiscoverySources[0] = DiscoveryPublicSearch
	second := m.result()
	if second[0].Bindings[0].Folders[0] != "folder" || second[0].Bindings[0].Relation != RelationCollected || second[0].DiscoverySources[0] != DiscoveryFavoriteList {
		t.Fatalf("result 必须深拷贝嵌套 slice：%+v", second[0])
	}
}

func TestLiveProviderUsesSingleInjectedObservationTime(t *testing.T) {
	const observed = int64(1800000000)
	var clockCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		items := []map[string]any{}
		switch r.URL.Path {
		case "/api/v1/user/collections":
			items = append(items, map[string]any{"ContentType": "answer", "ContentID": "456", "Url": "https://www.zhihu.com/question/123/answer/456", "Title": "收藏"})
		case "/api/v1/user/contents":
			items = append(items, map[string]any{"ContentType": "answer", "ContentID": "457", "Url": "https://www.zhihu.com/question/123/answer/457", "Title": "创作"})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"Code": 0, "Data": map[string]any{"Items": items}})
	}))
	defer srv.Close()
	c := NewClient("secret", "")
	c.BaseURL, c.HTTP = srv.URL, srv.Client()
	p := &LiveProvider{Client: c, Plan: FetchPlan{ContentPages: 1, FolloweePages: 1}, Now: func() time.Time {
		clockCalls++
		return time.Unix(observed, 0)
	}}
	corpus, err := p.Fetch(context.Background())
	if err != nil {
		t.Fatalf("采集失败: %v", err)
	}
	if clockCalls != 1 {
		t.Fatalf("每次采集应只读一次时钟，实际 %d", clockCalls)
	}
	if len(corpus.Items) != 2 {
		t.Fatalf("应采集 2 条，实际 %d", len(corpus.Items))
	}
	for _, it := range corpus.Items {
		if it.ObservedAt != observed {
			t.Fatalf("同次采集必须共享 ObservedAt，实际 %d", it.ObservedAt)
		}
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
