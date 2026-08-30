// Package engine 实现语义引擎管线 ③~⑨：
// 概念归并 → 二部图 → 资源分配投影 → 社区发现 → 时间刻画 → 非典型 z 检验 → 布局。
//
// 概念抽取（②）不在本包，见 internal/extract。
package engine

import "github.com/chouheiwa/mindverse/internal/zhihu"

const (
	CurrentSchemaVersion   = "universe.v1"
	CurrentAnalysisVersion = "engine.v1"
)

// ConceptScope is part of a star's identity. Private model-extracted concepts
// must never be promoted to a queryable public concept by inference.
type ConceptScope string

const (
	ScopePrivate ConceptScope = "private"
	ScopePublic  ConceptScope = "public"
)

// Input 是引擎的输入：语料 + 与之等长的概念标注。
type Input struct {
	Items    []zhihu.Item
	Concepts [][]string // Concepts[i] 是 Items[i] 抽出的概念
}

// Options 控制引擎行为。零值会被 withDefaults 补全。
type Options struct {
	// MinSupport 概念成星的最低出现次数。
	// 借鉴 Clio 的最小数量阈值，防止孤例撑出假星群。
	MinSupport int

	// MinCluster 星群的最小概念数。
	MinCluster int

	// Shuffles 零模型重排次数。
	Shuffles int

	// WormholeZ 虫洞的 z 阈值（负数）。
	WormholeZ float64

	// WormholeMaxCross 虫洞允许的最大实际跨越次数。
	//
	// 这一条是实测补上的：单看 z 会被星群规模主导 —— 最大的两个星群
	// 因为期望值大，z 天然更负，会把「细但常走的路」顶成第一。
	// 虫洞必须同时满足「显著分离」与「跨越稀少」。
	WormholeMaxCross int

	Seed uint64
}

func (o Options) withDefaults() Options {
	if o.MinSupport == 0 {
		o.MinSupport = 3
	}
	if o.MinCluster == 0 {
		o.MinCluster = 3
	}
	if o.Shuffles == 0 {
		o.Shuffles = 1000
	}
	if o.WormholeZ == 0 {
		o.WormholeZ = -2
	}
	if o.WormholeMaxCross == 0 {
		o.WormholeMaxCross = 3
	}
	if o.Seed == 0 {
		o.Seed = 20260826
	}
	return o
}

// Evidence 是一条可点回原文的证据。
type Evidence struct {
	Title string `json:"t"`
	URL   string `json:"u"`
	Own   int    `json:"o"` // 1=我写的 0=我收藏的
	When  string `json:"y"`
}

// Star 一颗恒星，对应一个概念。
type Star struct {
	ID                   string       `json:"id"`
	Scope                ConceptScope `json:"scope"`
	ExternalQueryAllowed bool         `json:"externalQueryAllowed"`
	QuestionIDs          []string     `json:"questionIds,omitempty"`
	ProbeIDs             []string     `json:"probeIds,omitempty"`
	Concept              string       `json:"c"`
	Cluster              int          `json:"g"`
	Pos                  [3]float64   `json:"p"`
	N                    int          `json:"n"`
	Own                  int          `json:"o"`
	Fav                  int          `json:"f"`
	Hue                  int          `json:"hue"`
	Sat                  int          `json:"sat"`
	Persist              float64      `json:"pe"` // 持续性 → 亮度
	Burst                float64      `json:"bu"` // 集中度 → 星云判据
	First                string       `json:"fi"`
	Last                 string       `json:"la"`
	Evidence             []Evidence   `json:"ev"`
}

// QuestionPlanet is a globally deduplicated, real Zhihu question. ID uses the
// namespaced form question:{questionId}; URL is always canonical.
type QuestionPlanet struct {
	ID         string   `json:"id"`
	QuestionID string   `json:"questionId"`
	Title      string   `json:"title"`
	URL        string   `json:"url"`
	AnswerIDs  []string `json:"answerIds,omitempty"`
}

// AnswerSatellite is a public answer artifact bound to one admitted question.
// Bindings describe current-user relations; discoverySources describe how the
// artifact was observed and never imply a user relation.
type AnswerSatellite struct {
	ID               string                     `json:"id"`
	QuestionID       string                     `json:"questionId"`
	Title            string                     `json:"title"`
	Summary          string                     `json:"summary,omitempty"`
	URL              string                     `json:"url"`
	AuthorID         string                     `json:"authorId,omitempty"`
	AuthorName       string                     `json:"authorName,omitempty"`
	PublishedAt      int64                      `json:"publishedAt,omitempty"`
	UpdatedAt        int64                      `json:"updatedAt,omitempty"`
	ObservedAt       int64                      `json:"observedAt,omitempty"`
	LikeCount        int64                      `json:"likeCount,omitempty"`
	CommentCount     int64                      `json:"commentCount,omitempty"`
	FavoriteCount    int64                      `json:"favoriteCount,omitempty"`
	Bindings         []zhihu.UserContentBinding `json:"bindings,omitempty"`
	DiscoverySources []zhihu.DiscoverySource    `json:"discoverySources,omitempty"`
}

// ArticleProbe is a globally deduplicated public article. It intentionally has
// no question field: articles are independent probes, not fabricated planets.
type ArticleProbe struct {
	ID               string                     `json:"id"`
	Title            string                     `json:"title"`
	Summary          string                     `json:"summary,omitempty"`
	URL              string                     `json:"url"`
	AuthorID         string                     `json:"authorId,omitempty"`
	AuthorName       string                     `json:"authorName,omitempty"`
	PublishedAt      int64                      `json:"publishedAt,omitempty"`
	UpdatedAt        int64                      `json:"updatedAt,omitempty"`
	ObservedAt       int64                      `json:"observedAt,omitempty"`
	LikeCount        int64                      `json:"likeCount,omitempty"`
	CommentCount     int64                      `json:"commentCount,omitempty"`
	FavoriteCount    int64                      `json:"favoriteCount,omitempty"`
	Bindings         []zhihu.UserContentBinding `json:"bindings,omitempty"`
	DiscoverySources []zhihu.DiscoverySource    `json:"discoverySources,omitempty"`
}

// Cluster 一个主题星群。
type Cluster struct {
	ID      int        `json:"g"`
	Name    string     `json:"name"`
	Lead    string     `json:"lead"`
	Center  [3]float64 `json:"c"`
	N       int        `json:"n"`
	Own     int        `json:"o"`
	Fav     int        `json:"f"`
	Hue     int        `json:"hue"`
	Sat     int        `json:"sat"`
	Members []string   `json:"mem"`
}

// WormholeEvidence 跨越两个星群的那一条内容。
type WormholeEvidence struct {
	Title string `json:"t"`
	URL   string `json:"u"`
	SideA string `json:"a"` // 属于 A 星群的概念
	SideB string `json:"b"`
}

// Wormhole 一条非典型连接。
type Wormhole struct {
	A        int                `json:"a"`
	B        int                `json:"b"`
	NameA    string             `json:"an"`
	NameB    string             `json:"bn"`
	Observed int                `json:"obs"`
	Expected float64            `json:"exp"`
	Z        float64            `json:"z"`
	Evidence []WormholeEvidence `json:"ev"`
}

// Solo 被支持度阈值挡在星群外的孤例概念。
//
// 这条通道是实测补上的：阈值会杀掉最好的虫洞 —— 真正跨界的概念
// 往往在一个人的语料里只出现一两次。星群成形用阈值，桥接检测不用。
type Solo struct {
	Concept  string     `json:"c"`
	N        int        `json:"n"`
	Title    string     `json:"t"`
	URL      string     `json:"u"`
	Clusters []string   `json:"g"`
	Pos      [3]float64 `json:"p"`
}

// Dark 熄灭的星：曾经有过体量、但已经很久没有新增的概念。
//
// 判据曾经是「收藏过但从未创作」。那条判据只对创作者成立 ——
// 对一个从不写东西的人，他的每一个兴趣都满足它（实测 83/83），
// 而配套文案「你想成为、还没开始的那个人」就成了对他全部兴趣的指控。
type Dark struct {
	Concept  string     `json:"c"`
	N        int        `json:"n"` // 条目总数
	Fav      int        `json:"f"`
	Own      int        `json:"o"`
	Gap      int        `json:"gap"` // 距最近一次新增的月数
	First    string     `json:"first"`
	Last     string     `json:"last"`
	Evidence []Evidence `json:"ev"`
}

// Nebula 星云：高度集中在单一时间窗内的爆发。
type Nebula struct {
	Concept string  `json:"c"`
	N       int     `json:"n"`
	Burst   float64 `json:"burst"`
	First   string  `json:"first"`
	Last    string  `json:"last"`
}

// Meta 全局统计与好奇心结构坐标。
type Meta struct {
	Items    int      `json:"items"`
	Concepts int      `json:"concepts"`
	Clusters int      `json:"clusters"`
	Own      int      `json:"own"`
	Fav      int      `json:"fav"`
	Span     [2]int64 `json:"span"`
	MedZ     float64  `json:"medz"` // 常规性：z 中位数
	P10Z     float64  `json:"p10z"` // 新异尾部：z 第 10 百分位
	Source   string   `json:"source"`
	Splits   int      `json:"splits"` // Louvain 断裂社区的修复次数
}

// Universe 是引擎的完整输出，也是前端 /api/universe 的响应体。
type Universe struct {
	SchemaVersion   string            `json:"schemaVersion"`
	AnalysisVersion string            `json:"analysisVersion"`
	Meta            Meta              `json:"meta"`
	Clusters        []Cluster         `json:"clusters"`
	Stars           []Star            `json:"stars"`
	Particles       [][5]float64      `json:"particles"` // x,y,z,clusterID,own
	Wormholes       []Wormhole        `json:"wormholes"`
	Solo            []Solo            `json:"solo"`
	Dark            []Dark            `json:"dark"`
	Nebula          []Nebula          `json:"nebula"`
	Questions       []QuestionPlanet  `json:"questions"`
	Answers         []AnswerSatellite `json:"answers"`
	Probes          []ArticleProbe    `json:"probes"`
}
