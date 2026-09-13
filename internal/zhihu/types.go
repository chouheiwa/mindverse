// Package zhihu 封装知乎开放平台的用户数据接口与 OAuth 流程。
//
// 协议细节移植自官方黑客松 Skill 包 assets/hello-world-oauth/lib/oauth.mjs
// （zhihu-hackathon-skill_s2_v260815），那是平台实测跑通过的参考实现。
// 凡官方文档与实测冲突之处，以实测为准，并在此注明。
package zhihu

import (
	"encoding/json"
	"fmt"
	"strings"
)

// AuthorIdentitySource records which stable public discriminator established
// an author identity. Display names never establish identity.
type AuthorIdentitySource string

const (
	AuthorIdentityURLToken   AuthorIdentitySource = "url_token"
	AuthorIdentityProfileURL AuthorIdentitySource = "profile_url"
)

// AuthorIdentity is a coherent, validated stable author identity. ID is always
// author:{safe-url-token}; Name is the display name from that same observation.
type AuthorIdentity struct {
	ID     string               `json:"id"`
	Name   string               `json:"name,omitempty"`
	Source AuthorIdentitySource `json:"source"`
}

func (a AuthorIdentity) Valid() bool {
	token, ok := strings.CutPrefix(a.ID, "author:")
	return ok && safeAuthorToken(token) &&
		(a.Source == AuthorIdentityURLToken || a.Source == AuthorIdentityProfileURL)
}

// 开放平台业务错误码。
const (
	CodeOK       = 0
	CodeParam    = 10001
	CodeAuth     = 20001
	CodeRateLim  = 30001
	CodeQuotaOut = 30002
	CodeInternal = 90001
)

// UserContentRelation is an actual relation between the current user and an
// artifact. Public discovery is intentionally not representable here.
type UserContentRelation string

const (
	RelationCreated   UserContentRelation = "created"
	RelationCollected UserContentRelation = "collected"
)

type UserContentBinding struct {
	Relation UserContentRelation `json:"relation"`
	At       int64               `json:"at,omitempty"`
	Folders  []string            `json:"folders,omitempty"`
}

type DiscoverySource string

const (
	DiscoveryPublicSearch DiscoverySource = "public_search"
	DiscoveryFavoriteList DiscoverySource = "favorite_list"
	DiscoveryOwnContent   DiscoverySource = "own_content"
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
	TypeUnknown  ContentType = "unknown"
	TypeAnswer   ContentType = "answer"
	TypeArticle  ContentType = "article"
	TypeZvideo   ContentType = "zvideo"
	TypePin      ContentType = "pin"
	TypeQuestion ContentType = "question"
	TypeAll      ContentType = "all"
)

// ContentItem 用户创作内容。
type ContentItem struct {
	ContentID     string      `json:"ContentID"`
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
	ContentID     string               `json:"ContentID"`
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
// 字段以《获取授权用户基础信息》为准：fullname、avatar_path、headline、description、url，
// 另有 uid 与 hash_id 两个标识。旧实现取的是 name 与 avatar_url，服务端并不返回这两个名字，
// 于是 Profile 长期静默降级为 nil；这里保留它们作为兼容回退，优先用文档字段。
//
// 全部字段可空：取不到时降级为不展示，绝不伪造，也绝不阻断主流程。
type Profile struct {
	// UID 是 int64，可能超出 JavaScript 安全整数范围，因此全程以字符串原文保存和传递。
	UID       string
	HashID    string
	Name      string
	AvatarURL string
	Headline  string
	Desc      string
	URL       string
}

// UnmarshalJSON 同时接受文档字段与旧实现字段，并无损保留 uid。
func (p *Profile) UnmarshalJSON(b []byte) error {
	var raw struct {
		UID        json.Number `json:"uid"`
		HashID     string      `json:"hash_id"`
		Fullname   string      `json:"fullname"`
		AvatarPath string      `json:"avatar_path"`
		Headline   string      `json:"headline"`
		Desc       string      `json:"description"`
		URL        string      `json:"url"`
		// 兼容回退，不是文档字段。
		LegacyName   string `json:"name"`
		LegacyAvatar string `json:"avatar_url"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	// json.Number 保留字面量，不经 float64，避免 int64 精度丢失。
	// uid 缺失时是空串，显式写 0 时也不是有效标识，一并归一成空。
	if uid := strings.TrimSpace(raw.UID.String()); uid != "" && strings.Trim(uid, "0") != "" {
		p.UID = uid
	}
	p.HashID = raw.HashID
	p.Name = firstNonEmpty(raw.Fullname, raw.LegacyName)
	p.AvatarURL = firstNonEmpty(raw.AvatarPath, raw.LegacyAvatar)
	p.Headline = raw.Headline
	p.Desc = raw.Desc
	p.URL = raw.URL
	return nil
}

// Identified 报告响应里是否带回了可用的用户标识。
//
// 文档要求建立会话前确认存在有效标识，不能只看 HTTP 200。
func (p Profile) Identified() bool {
	return strings.TrimSpace(p.UID) != "" || strings.TrimSpace(p.HashID) != "" || strings.TrimSpace(p.Name) != ""
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
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
