package zhihu

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
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
	ConceptHints     []string             `json:"conceptHints,omitempty"`

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
	// AuthorID is present only when ingestion observed a stable URL token or a
	// canonical Zhihu profile URL. Deprecated: consumers must validate and use
	// AuthorIdentity; this scalar remains only for compatibility.
	AuthorID       string          `json:"authorId,omitempty"`
	AuthorIdentity *AuthorIdentity `json:"authorIdentity,omitempty"`
	LikeCount      int64           `json:"likeCount"`
	CommentCount   int64           `json:"commentCount,omitempty"`
	FavoriteCount  int64           `json:"favoriteCount,omitempty"`

	authorDisplayNames map[string]struct{}
	authorIdentities   map[string]AuthorIdentity
}

func (i Item) hasDomainTruth() bool {
	return i.Identity.ContentID != "" || i.AuthorIdentity != nil || len(i.Bindings) > 0 || len(i.DiscoverySources) > 0 || len(i.ConceptHints) > 0 || i.PublishedAt > 0 || i.UpdatedAt > 0 || i.ObservedAt > 0
}

// IsCreated reports a real authored binding, falling back to legacy Own only
// for records that predate the split domain contract.
func (i Item) IsCreated() bool {
	for _, binding := range i.Bindings {
		if binding.Relation == RelationCreated {
			return true
		}
	}
	return !i.hasDomainTruth() && i.Own
}

// IsCollected reports a real collected binding, falling back to the historic
// Own=false representation only for legacy records.
func (i Item) IsCollected() bool {
	for _, binding := range i.Bindings {
		if binding.Relation == RelationCollected {
			return true
		}
	}
	return !i.hasDomainTruth() && !i.Own
}

func (i Item) EffectivePublishedAt() int64 {
	if i.PublishedAt > 0 {
		return i.PublishedAt
	}
	if !i.hasDomainTruth() {
		return i.CreatedAt
	}
	return 0
}

func (i Item) EffectiveCollectedAt() int64 {
	for _, binding := range i.Bindings {
		if binding.Relation == RelationCollected && binding.At > 0 {
			return binding.At
		}
	}
	if !i.hasDomainTruth() {
		return i.FavTime
	}
	return 0
}

// EffectiveFolders returns a sorted copy of binding folders, with a legacy
// fallback for old snapshots.
func (i Item) EffectiveFolders() []string {
	var folders []string
	for _, binding := range i.Bindings {
		if binding.Relation == RelationCollected {
			for _, folder := range binding.Folders {
				folders = appendUniq(folders, folder)
			}
		}
	}
	if len(folders) == 0 && !i.hasDomainTruth() {
		folders = append(folders, i.Folders...)
	}
	sort.Strings(folders)
	return folders
}

// EffectiveTime is the user's relationship time when one exists, otherwise
// the artifact's publication time. Public discovery does not invent either.
func (i Item) EffectiveTime() int64 {
	if collectedAt := i.EffectiveCollectedAt(); collectedAt > 0 {
		return collectedAt
	}
	return i.EffectivePublishedAt()
}

// At is retained as a source-compatible alias for existing callers.
func (i Item) At() int64 { return i.EffectiveTime() }

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
		if it.IsCreated() {
			own++
		} else if it.IsCollected() {
			fav++
		}
	}
	return len(c.Items), own, fav
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
	Now    func() time.Time
}

func (p *LiveProvider) Kind() string { return "live" }

func (p *LiveProvider) Fetch(ctx context.Context) (*Corpus, error) {
	plan := p.Plan
	if plan.FavlistPages == 0 {
		plan = DefaultPlan()
	}
	out := &Corpus{Source: "live"}
	now := time.Now
	if p.Now != nil {
		now = p.Now
	}
	merge := newMerger(now().Unix())

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

// merger 按稳定内容身份去重，并合并同一条内容的用户关系。
// 同一 ContentID 若出现不兼容的原始身份，result 会将所有
// 冲突项隔离为未准入证据，并赋予完整 SHA-256 的确定性证据键。
type merger struct {
	byKey            map[string]*Item
	baseKeys         map[string][]string
	unresolvedCounts map[string]int
	order            []string
	observedAt       int64
}

func newMerger(observedAt ...int64) *merger {
	m := &merger{
		byKey:            map[string]*Item{},
		baseKeys:         map[string][]string{},
		unresolvedCounts: map[string]int{},
	}
	if len(observedAt) > 0 {
		m.observedAt = observedAt[0]
	}
	return m
}

func (m *merger) get(identity ContentIdentity) *Item {
	if !identity.Resolved {
		key := identity.EvidenceKey
		it := &Item{Identity: identity, URL: identity.URL, ObservedAt: m.observedAt}
		m.byKey[key] = it
		m.order = append(m.order, key)
		return it
	}
	fingerprint := identityFingerprint(identity)
	key := identity.ContentID + "\x00" + fingerprint
	if it, ok := m.byKey[key]; ok {
		it.Identity = enrichIdentity(it.Identity, identity)
		return it
	}
	it := &Item{Identity: identity, URL: identity.URL, ObservedAt: m.observedAt}
	m.byKey[key] = it
	m.baseKeys[identity.ContentID] = append(m.baseKeys[identity.ContentID], key)
	m.order = append(m.order, key)
	return it
}

func enrichIdentity(current, observed ContentIdentity) ContentIdentity {
	if observed.Admitted && !current.Admitted {
		current.QuestionID = observed.QuestionID
		current.QuestionURL = observed.QuestionURL
		current.Admitted = true
	}
	current.Resolved = current.Resolved || observed.Resolved
	return current
}

func (m *merger) unresolvedIdentity(identity ContentIdentity, evidenceParts ...string) ContentIdentity {
	sum := sha256.Sum256([]byte(strings.Join(evidenceParts, "\x00")))
	base := fmt.Sprintf("evidence:unresolved:%x", sum[:])
	m.unresolvedCounts[base]++
	identity.EvidenceKey = fmt.Sprintf("%s:%06d", base, m.unresolvedCounts[base])
	return identity
}

func identityFingerprint(identity ContentIdentity) string {
	normalizedURL := identity.URL
	if u, err := url.Parse(identity.URL); err == nil {
		u.Host = strings.ToLower(u.Host)
		normalizedURL = u.String()
	}
	sum := sha256.Sum256([]byte(strings.Join([]string{
		string(identity.Type), identity.ContentID, normalizedURL,
	}, "\x00")))
	return fmt.Sprintf("%x", sum[:])
}

func (m *merger) addCollections(items []CollectionItem, folder string) {
	for _, c := range items {
		identity := ResolveIdentity(c.ContentType, c.ContentID, c.URL, c.Title)
		stableFields := []string{string(c.ContentType), c.ContentID, c.URL, c.Title, c.Summary, strconv.FormatInt(c.CreatedAt, 10), strconv.FormatInt(c.FavTime, 10)}
		if c.Author != nil {
			stableFields = append(stableFields, c.Author.URLToken, c.Author.URL)
		}
		if !identity.Resolved {
			identity = m.unresolvedIdentity(identity, stableFields...)
		}
		it := m.get(identity)
		if c.Title != "" {
			it.Title = c.Title
		}
		if c.Summary != "" {
			it.Summary = c.Summary
		}
		it.Type = c.ContentType
		it.PublishedAt = earliestNonZero(it.PublishedAt, c.CreatedAt)
		if c.LikeCount > it.LikeCount {
			it.LikeCount = c.LikeCount
		}
		if c.CommentCount > it.CommentCount {
			it.CommentCount = c.CommentCount
		}
		if c.FavoriteCount > it.FavoriteCount {
			it.FavoriteCount = c.FavoriteCount
		}
		it.DiscoverySources = appendDiscovery(it.DiscoverySources, DiscoveryFavoriteList)
		it.Bindings = upsertBinding(it.Bindings, UserContentBinding{Relation: RelationCollected, At: c.FavTime})
		mergeAuthorObservation(it, c.Author)
		if folder != "" {
			it.Bindings = addBindingFolder(it.Bindings, RelationCollected, folder)
		}
		for _, f := range c.Favlists {
			if f.Title != "" {
				it.Bindings = addBindingFolder(it.Bindings, RelationCollected, f.Title)
			}
		}
	}
}

func ResolveAuthorIdentity(author *ContentAuthor) *AuthorIdentity {
	if author == nil {
		return nil
	}
	if token := strings.TrimSpace(author.URLToken); token == author.URLToken && safeAuthorToken(token) {
		return &AuthorIdentity{ID: "author:" + token, Name: author.Name, Source: AuthorIdentityURLToken}
	}
	u, err := url.Parse(author.URL)
	if err != nil || u.Scheme != "https" || u.Host != "www.zhihu.com" || u.Port() != "" || u.Opaque != "" ||
		u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return nil
	}
	const prefix = "/people/"
	if !strings.HasPrefix(u.Path, prefix) {
		return nil
	}
	token := strings.TrimPrefix(u.Path, prefix)
	expectedPath := prefix + token
	if !safeAuthorToken(token) || u.Path != expectedPath || u.EscapedPath() != expectedPath {
		return nil
	}
	return &AuthorIdentity{ID: "author:" + token, Name: author.Name, Source: AuthorIdentityProfileURL}
}

func mergeAuthorObservation(item *Item, author *ContentAuthor) {
	if author == nil {
		return
	}
	if author.Name != "" {
		if item.authorDisplayNames == nil {
			item.authorDisplayNames = map[string]struct{}{}
		}
		item.authorDisplayNames[author.Name] = struct{}{}
	}
	identity := ResolveAuthorIdentity(author)
	if identity != nil {
		if item.authorIdentities == nil {
			item.authorIdentities = map[string]AuthorIdentity{}
		}
		if current, exists := item.authorIdentities[identity.ID]; exists {
			item.authorIdentities[identity.ID] = preferredAuthorIdentity(current, *identity)
		} else {
			item.authorIdentities[identity.ID] = *identity
		}
	}
	finalizeAuthorIdentity(item)
}

// URLToken is the API's direct stable discriminator, so it takes precedence
// over an equivalent profile URL observation. The selected name stays attached
// to the selected provenance instead of being independently mixed.
func preferredAuthorIdentity(current, candidate AuthorIdentity) AuthorIdentity {
	rank := func(source AuthorIdentitySource) int {
		if source == AuthorIdentityURLToken {
			return 0
		}
		return 1
	}
	if rank(candidate.Source) < rank(current.Source) {
		return candidate
	}
	if rank(candidate.Source) > rank(current.Source) {
		return current
	}
	current.Name = deterministicDisplayName(current.Name, candidate.Name)
	return current
}

func finalizeAuthorIdentity(item *Item) {
	item.AuthorID = ""
	item.AuthorIdentity = nil
	if len(item.authorIdentities) == 1 {
		for _, identity := range item.authorIdentities {
			selected := identity
			item.AuthorIdentity = &selected
			item.AuthorID = selected.ID
			item.Author = selected.Name
		}
		return
	}
	item.Author = ""
	for name := range item.authorDisplayNames {
		item.Author = deterministicDisplayName(item.Author, name)
	}
}

func deterministicDisplayName(current, candidate string) string {
	if current == "" || (candidate != "" && candidate < current) {
		return candidate
	}
	return current
}

func safeAuthorToken(token string) bool {
	if token == "" {
		return false
	}
	for _, r := range token {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}

func (m *merger) addContents(items []ContentItem) {
	for _, c := range items {
		identity := ResolveIdentity(c.ContentType, c.ContentID, c.URL, c.Title)
		if !identity.Resolved {
			identity = m.unresolvedIdentity(identity,
				string(c.ContentType), c.ContentID, c.URL, c.Title, c.Summary, strconv.FormatInt(c.CreatedAt, 10))
		}
		it := m.get(identity)
		if c.Title != "" {
			it.Title = c.Title
		}
		if c.Summary != "" {
			it.Summary = c.Summary
		}
		it.Type = c.ContentType
		it.PublishedAt = earliestNonZero(it.PublishedAt, c.CreatedAt)
		if c.LikeCount > it.LikeCount {
			it.LikeCount = c.LikeCount
		}
		if c.CommentCount > it.CommentCount {
			it.CommentCount = c.CommentCount
		}
		if c.FavoriteCount > it.FavoriteCount {
			it.FavoriteCount = c.FavoriteCount
		}
		it.Bindings = upsertBinding(it.Bindings, UserContentBinding{Relation: RelationCreated, At: c.CreatedAt})
		it.DiscoverySources = appendDiscovery(it.DiscoverySources, DiscoveryOwnContent)
	}
}

func upsertBinding(bindings []UserContentBinding, binding UserContentBinding) []UserContentBinding {
	for i := range bindings {
		if bindings[i].Relation == binding.Relation {
			bindings[i].At = earliestNonZero(bindings[i].At, binding.At)
			return bindings
		}
	}
	return append(bindings, binding)
}

// earliestNonZero preserves the earliest known event for provenance while
// treating zero as unknown. It is commutative, so ingestion order cannot alter
// publication, collection, or observation semantics.
func earliestNonZero(a, b int64) int64 {
	if a == 0 {
		return b
	}
	if b == 0 || a < b {
		return a
	}
	return b
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
	for _, key := range m.order {
		it := m.byKey[key]
		if !it.Identity.Resolved && it.URL == "" && strings.TrimSpace(it.Title) == "" && strings.TrimSpace(it.Summary) == "" {
			continue
		}
		for i := range it.Bindings {
			sort.Strings(it.Bindings[i].Folders)
		}
		sort.SliceStable(it.Bindings, func(i, j int) bool { return it.Bindings[i].Relation < it.Bindings[j].Relation })
		sort.SliceStable(it.DiscoverySources, func(i, j int) bool { return it.DiscoverySources[i] < it.DiscoverySources[j] })
		item := *it
		baseID := item.Identity.ContentID
		if item.Identity.Resolved && len(m.baseKeys[baseID]) > 1 {
			_, fingerprint, _ := strings.Cut(key, "\x00")
			item.Identity.ContentID = ""
			item.Identity.Resolved = false
			item.Identity.Admitted = false
			item.Identity.QuestionID = ""
			item.Identity.QuestionURL = ""
			item.Identity.EvidenceKey = "evidence:conflict:" + fingerprint
		}
		out = append(out, cloneItem(item))
	}
	return out
}

func cloneItem(item Item) Item {
	if item.AuthorIdentity != nil {
		identity := *item.AuthorIdentity
		item.AuthorIdentity = &identity
	}
	if item.authorDisplayNames != nil {
		item.authorDisplayNames = cloneStringSet(item.authorDisplayNames)
	}
	if item.authorIdentities != nil {
		identities := make(map[string]AuthorIdentity, len(item.authorIdentities))
		for id, identity := range item.authorIdentities {
			identities[id] = identity
		}
		item.authorIdentities = identities
	}
	item.Bindings = append([]UserContentBinding(nil), item.Bindings...)
	for i := range item.Bindings {
		item.Bindings[i].Folders = append([]string(nil), item.Bindings[i].Folders...)
	}
	item.DiscoverySources = append([]DiscoverySource(nil), item.DiscoverySources...)
	item.ConceptHints = append([]string(nil), item.ConceptHints...)
	item.Folders = append([]string(nil), item.Folders...)
	return item
}

func cloneStringSet(values map[string]struct{}) map[string]struct{} {
	out := make(map[string]struct{}, len(values))
	for value := range values {
		out[value] = struct{}{}
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
