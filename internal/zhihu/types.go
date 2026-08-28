// Package zhihu 封装知乎开放平台的用户数据接口与 OAuth 流程。
//
// 协议细节移植自官方黑客松 Skill 包 assets/hello-world-oauth/lib/oauth.mjs
// （zhihu-hackathon-skill_s2_v260815），那是平台实测跑通过的参考实现。
// 凡官方文档与实测冲突之处，以实测为准，并在此注明。
package zhihu

import (
	"encoding/json"
	"fmt"
)

// 开放平台业务错误码。
const (
	CodeOK       = 0
	CodeParam    = 10001
	CodeAuth     = 20001
	CodeRateLim  = 30001
	CodeQuotaOut = 30002
	CodeInternal = 90001
)

// APIError 承载服务端返回的业务错误。上层据此决定降级还是中止。
type APIError struct {
	Code     int
	Message  string
	Endpoint string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("zhihu api %s: code=%d %s", e.Endpoint, e.Code, e.Message)
}

// Retryable 报告该错误是否值得稍后重试。配额耗尽不可重试，限流可以。
func (e *APIError) Retryable() bool { return e.Code == CodeRateLim || e.Code == CodeInternal }

// Exhausted 报告该错误是否意味着当日配额已用尽。
func (e *APIError) Exhausted() bool { return e.Code == CodeQuotaOut }

// envelope 是全部用户数据接口的统一外层结构。
type envelope[T any] struct {
	Code    int             `json:"Code"`
	Message string          `json:"Message"`
	Data    T               `json:"Data"`
	Raw     json.RawMessage `json:"-"`
}

// Paging 分页信息。
//
// 保留字段仅为忠实反映协议，业务上一概不信任。2026-08-27 实测：
// 服务端会丢弃列表中已失效的条目，再用「实收 < 请求」反推出 IsEnd=true，
// 于是在第一个失效条目处谎报到底；Totals 在同一响应里退化成 Offset+实收。
// 翻页逻辑见 client.go 的 collect —— 按固定步长硬翻，以空页为终止条件。
type Paging struct {
	IsEnd      bool   `json:"IsEnd"`
	NextOffset string `json:"NextOffset"`
	Totals     int64  `json:"Totals"`
}

// ContentType 内容类型，服务端固定小写。
type ContentType string

const (
	TypeAnswer   ContentType = "answer"
	TypeArticle  ContentType = "article"
	TypeZvideo   ContentType = "zvideo"
	TypePin      ContentType = "pin"
	TypeQuestion ContentType = "question"
	TypeAll      ContentType = "all"
)

// ContentItem 用户创作内容。
type ContentItem struct {
	ContentType   ContentType `json:"ContentType"`
	URL           string      `json:"Url"`
	CreatedAt     int64       `json:"CreatedAt"`
	LikeCount     int64       `json:"LikeCount"`
	CommentCount  int64       `json:"CommentCount"`
	FavoriteCount int64       `json:"FavoriteCount"`
	Title         string      `json:"Title"`
	Summary       string      `json:"Summary"`
}

// ContentAuthor 收藏内容的作者。
type ContentAuthor struct {
	Name     string `json:"Name"`
	URLToken string `json:"UrlToken"`
	URL      string `json:"Url"`
	Headline string `json:"Headline"`
}

// ContentFavlistItem 内容所属收藏夹（简版对象）。
type ContentFavlistItem struct {
	URLToken int64  `json:"UrlToken"`
	Title    string `json:"Title"`
	URL      string `json:"Url"`
}

// CollectionItem 收藏内容。比 ContentItem 多出收藏时刻与作者，
// 是语义引擎最有价值的语料来源。
type CollectionItem struct {
	ContentType   ContentType          `json:"ContentType"`
	URL           string               `json:"Url"`
	CreatedAt     int64                `json:"CreatedAt"`
	FavTime       int64                `json:"FavTime"`
	LikeCount     int64                `json:"LikeCount"`
	CommentCount  int64                `json:"CommentCount"`
	FavoriteCount int64                `json:"FavoriteCount"`
	Title         string               `json:"Title"`
	Summary       string               `json:"Summary"`
	Favlists      []ContentFavlistItem `json:"Favlists"`
	Author        *ContentAuthor       `json:"Author,omitempty"`
}

// Favlist 收藏夹。Title 与 Description 是用户亲手写的兴趣自标注，
// 作为概念抽取的先验注入，在小样本下能显著改善聚类质量。
type Favlist struct {
	URLToken    int64  `json:"UrlToken"`
	URL         string `json:"Url"`
	Title       string `json:"Title"`
	Description string `json:"Description"`
	IsPublic    bool   `json:"IsPublic"`
}

// Followee 关注的用户。Headline 可作为兴趣语料的补充。
type Followee struct {
	Fullname      string `json:"Fullname"`
	URLToken      string `json:"UrlToken"`
	URL           string `json:"Url"`
	AvatarURL     string `json:"AvatarUrl"`
	Headline      string `json:"Headline"`
	FollowerCount int64  `json:"FollowerCount"`
}

// Profile 账号资料。
//
// 官方文档没有给出 /user 的正式响应 schema，只有实测提示。
// 因此这里全部字段可空：取不到时降级为不展示，绝不伪造，也绝不阻断主流程。
type Profile struct {
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Headline  string `json:"headline"`
	URL       string `json:"url"`
}

type contentsData struct {
	Items  []ContentItem `json:"Items"`
	Paging Paging        `json:"Paging"`
}

type collectionsData struct {
	Items  []CollectionItem `json:"Items"`
	Paging Paging           `json:"Paging"`
}

type favlistsData struct {
	Items []Favlist `json:"Items"`
}

type followeesData struct {
	Items  []Followee `json:"Items"`
	Paging Paging     `json:"Paging"`
}
