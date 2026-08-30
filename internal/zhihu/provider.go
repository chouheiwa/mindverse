package zhihu

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

// Item 是喂给语义引擎的统一语料单元。
// 内容身份、用户关系、发现来源和三类时间各自作为独立真相源。
type Item struct {
	Identity         ContentIdentity      `json:"identity"`
	Bindings         []UserContentBinding `json:"bindings,omitempty"`
	DiscoverySources []DiscoverySource    `json:"discoverySources,omitempty"`
	PublishedAt      int64                `json:"publishedAt,omitempty"`
	UpdatedAt        int64                `json:"updatedAt,omitempty"`
	ObservedAt       int64                `json:"observedAt,omitempty"`

	// Deprecated compatibility fields. New ingestion paths write the domain
	// fields above; these remain readable for legacy snapshots and consumers.
	URL       string      `json:"url"`
	Title     string      `json:"title"`
	Summary   string      `json:"summary"`
	Type      ContentType `json:"type"`
	CreatedAt int64       `json:"createdAt"` // 内容诞生时刻
	FavTime   int64       `json:"favTime"`   // 收藏时刻；创作为 0
	Own       bool        `json:"own"`       // true=我写的，false=我收藏的
	Folders   []string    `json:"folders"`   // 所属收藏夹名，概念抽取的先验
	Author    string      `json:"author,omitempty"`
	LikeCount int64       `json:"likeCount"`
}

// At 返回该条目在时间轴上的位置：收藏用收藏时刻，创作用发表时刻。
func (i Item) At() int64 {
	for _, binding := range i.Bindings {
		if binding.Relation == RelationCollected && binding.At > 0 {
			return binding.At
		}
	}
	if i.PublishedAt > 0 {
		return i.PublishedAt
	}
	if i.FavTime > 0 {
		return i.FavTime
	}
	return i.CreatedAt
}

// Corpus 是一次采集的完整结果。
type Corpus struct {
	Items     []Item     `json:"items"`
	Favlists  []Favlist  `json:"favlists"`
	Followees []Followee `json:"followees"`
	Profile   *Profile   `json:"profile,omitempty"`
	Source    string     `json:"source"` // live / mock / seed
	Calls     int        `json:"calls"`  // 本次消耗的接口调用次数
}

// Stats 汇总语料规模，用于前端展示与冷启动判断。
func (c *Corpus) Stats() (total, own, fav int) {
	for _, it := range c.Items {
		created, collected := it.userRelations()
		if created {
			own++
		} else if collected || len(it.Bindings) == 0 && len(it.DiscoverySources) == 0 && !it.Own {
			fav++
		}
	}
	return len(c.Items), own, fav
}

func (i Item) userRelations() (created, collected bool) {
	for _, binding := range i.Bindings {
		created = created || binding.Relation == RelationCreated
		collected = collected || binding.Relation == RelationCollected
	}
	if len(i.Bindings) == 0 {
		created = i.Own
	}
	return created, collected
}

// Provider 抽象语料来源。
//
// 硬约束：Provider 之上的所有代码（语义引擎、渲染、分享）不得感知
// 当前是哪一个实现。凭证到位前全部开发在 MockProvider 上推进，
// 到位后只改一个环境变量。
type Provider interface {
	Fetch(ctx context.Context) (*Corpus, error)
	Kind() string
}

// FetchPlan 控制采集范围。上限是显式的：接口配额有限，绝不无界翻页。
type FetchPlan struct {
	FavlistPages  int // 每个收藏夹最多翻几页
	ContentPages  int // 创作最多翻几页
	FolloweePages int // 关注最多翻几页
}

// DefaultPlan 是典型用户的采集计划，约 35 次请求、200–800 条语料。
func DefaultPlan() FetchPlan { return FetchPlan{FavlistPages: 4, ContentPages: 6, FolloweePages: 2} }

// LiveProvider 通过 OAuth 读取真实用户数据。
type LiveProvider struct {
	Client *Client
	Plan   FetchPlan
}

func (p *LiveProvider) Kind() string { return "live" }

func (p *LiveProvider) Fetch(ctx context.Context) (*Corpus, error) {
	plan := p.Plan
	if plan.FavlistPages == 0 {
		plan = DefaultPlan()
	}
	out := &Corpus{Source: "live"}
	merge := newMerger()

	favlists, err := p.Client.Favlists(ctx)
	if err != nil {
		return nil, fmt.Errorf("读取收藏夹列表失败: %w", err)
	}
	out.Calls++
	out.Favlists = favlists
	names := map[int64]string{}
	for _, f := range favlists {
		names[f.URLToken] = f.Title
	}

	// 近期收藏信息最全（带 Author 与所属收藏夹），先取。
	if recents, err := p.Client.RecentCollections(ctx); err == nil {
		out.Calls++
		merge.addCollections(recents, "")
	} else if !softFail(err) {
		return nil, err
	}

	for _, f := range favlists {
		items, err := p.Client.FavlistContents(ctx, f.URLToken, plan.FavlistPages)
		out.Calls++
		if err != nil && !softFail(err) {
			return nil, err
		}
		merge.addCollections(items, f.Title)
	}

	contents, err := p.Client.Contents(ctx, TypeAll, plan.ContentPages)
	out.Calls++
	if err != nil && !softFail(err) {
		return nil, err
	}
	merge.addContents(contents)

	if fs, err := p.Client.Followees(ctx, plan.FolloweePages); err == nil {
		out.Calls++
		out.Followees = fs
	}

	out.Profile = p.Client.Profile(ctx)
	out.Items = merge.result()
	return out, nil
}

// softFail 报告该错误是否可以「少拿一点数据」地容忍。
func softFail(err error) bool {
	var ae *APIError
	if asAPIError(err, &ae) {
		return ae.Exhausted() || ae.Code == CodeRateLim
	}
	return false
}

// merger 按 URL 去重，并合并同一条内容在多个收藏夹中的归属。
type merger struct {
	byURL map[string]*Item
	order []string
}

func newMerger() *merger { return &merger{byURL: map[string]*Item{}} }

func (m *merger) get(url string) *Item {
	if it, ok := m.byURL[url]; ok {
		return it
	}
	it := &Item{URL: url}
	m.byURL[url] = it
	m.order = append(m.order, url)
	return it
}

func (m *merger) addCollections(items []CollectionItem, folder string) {
	for _, c := range items {
		if c.URL == "" {
			continue
		}
		it := m.get(c.URL)
		it.Title, it.Summary, it.Type = c.Title, c.Summary, c.ContentType
		it.Identity = ResolveIdentity(c.ContentType, "", c.URL, c.Title)
		it.PublishedAt, it.LikeCount = c.CreatedAt, c.LikeCount
		it.DiscoverySources = appendDiscovery(it.DiscoverySources, DiscoveryFavoriteList)
		it.Bindings = upsertBinding(it.Bindings, UserContentBinding{Relation: RelationCollected, At: c.FavTime})
		if c.Author != nil {
			it.Author = c.Author.Name
		}
		if folder != "" {
			it.Folders = appendUniq(it.Folders, folder)
			it.Bindings = addBindingFolder(it.Bindings, RelationCollected, folder)
		}
		for _, f := range c.Favlists {
			if f.Title != "" {
				it.Folders = appendUniq(it.Folders, f.Title)
				it.Bindings = addBindingFolder(it.Bindings, RelationCollected, f.Title)
			}
		}
	}
}

func (m *merger) addContents(items []ContentItem) {
	for _, c := range items {
		if c.URL == "" {
			continue
		}
		it := m.get(c.URL)
		it.Title, it.Summary, it.Type = c.Title, c.Summary, c.ContentType
		it.Identity = ResolveIdentity(c.ContentType, "", c.URL, c.Title)
		it.PublishedAt, it.LikeCount = c.CreatedAt, c.LikeCount
		it.Bindings = upsertBinding(it.Bindings, UserContentBinding{Relation: RelationCreated, At: c.CreatedAt})
		it.DiscoverySources = appendDiscovery(it.DiscoverySources, DiscoveryOwnContent)
	}
}

func upsertBinding(bindings []UserContentBinding, binding UserContentBinding) []UserContentBinding {
	for i := range bindings {
		if bindings[i].Relation == binding.Relation {
			if binding.At > 0 {
				bindings[i].At = binding.At
			}
			return bindings
		}
	}
	return append(bindings, binding)
}

func addBindingFolder(bindings []UserContentBinding, relation UserContentRelation, folder string) []UserContentBinding {
	bindings = upsertBinding(bindings, UserContentBinding{Relation: relation})
	for i := range bindings {
		if bindings[i].Relation == relation {
			bindings[i].Folders = appendUniq(bindings[i].Folders, folder)
		}
	}
	return bindings
}

func appendDiscovery(sources []DiscoverySource, source DiscoverySource) []DiscoverySource {
	for _, existing := range sources {
		if existing == source {
			return sources
		}
	}
	return append(sources, source)
}

func (m *merger) result() []Item {
	out := make([]Item, 0, len(m.order))
	for _, u := range m.order {
		it := m.byURL[u]
		if it.Title == "" {
			continue
		}
		sort.Strings(it.Folders)
		out = append(out, *it)
	}
	return out
}

func appendUniq(xs []string, v string) []string {
	for _, x := range xs {
		if x == v {
			return xs
		}
	}
	return append(xs, v)
}

// MockProvider 从本地样本读取语料。
//
// 这不是权宜之计：上一届被官方推荐的作品也明确采用「Mock 与真实 API 无缝切换」
// 来保证演示稳定性。凭证未到位时的全部开发都跑在这上面。
type MockProvider struct {
	Path string
}

func (p *MockProvider) Kind() string { return "mock" }

func (p *MockProvider) Fetch(ctx context.Context) (*Corpus, error) {
	b, err := os.ReadFile(p.Path)
	if err != nil {
		return nil, fmt.Errorf("读取样本语料失败: %w", err)
	}
	var c Corpus
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("解析样本语料失败: %w", err)
	}
	c.Source = "mock"
	return &c, nil
}

// SeedProvider 游客模式：以用户现场挑选的问题作为语料。
//
// 界面必须显式标注「这是基于你现场选择生成的宇宙，不是你的知乎历史」，
// 绝不允许把种子星结果伪装成真实历史数据。
type SeedProvider struct {
	Picked []Item
}

func (p *SeedProvider) Kind() string { return "seed" }

func (p *SeedProvider) Fetch(ctx context.Context) (*Corpus, error) {
	return &Corpus{Items: p.Picked, Source: "seed"}, nil
}
