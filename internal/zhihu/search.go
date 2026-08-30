package zhihu

import (
	"context"
	"net/url"
	"strconv"
	"time"
)

// searchMaxCount 是服务端硬上限：Count > 10 会被自动截断。
const searchMaxCount = 10

// SearchItem 是站内搜索的一条结果。
type SearchItem struct {
	Title          string  `json:"Title"`
	ContentType    string  `json:"ContentType"`
	ContentID      string  `json:"ContentID"`
	ContentText    string  `json:"ContentText"`
	URL            string  `json:"Url"`
	CommentCount   int32   `json:"CommentCount"`
	VoteUpCount    int32   `json:"VoteUpCount"`
	AuthorName     string  `json:"AuthorName"`
	EditTime       int64   `json:"EditTime"`
	AuthorityLevel string  `json:"AuthorityLevel"`
	RankingScore   float32 `json:"RankingScore"`
}

type searchData struct {
	HasMore     bool         `json:"HasMore"`
	EmptyReason string       `json:"EmptyReason"`
	Items       []SearchItem `json:"Items"`
}

// SearchZhihu 搜索知乎站内内容。
//
// 只需要开放平台 Access Secret，不需要用户 OAuth —— 游客模式因此可用。
// 配额按黑客松手册最保守的 1000 次/天预算，调用方必须自己缓存。
func (c *Client) SearchZhihu(ctx context.Context, query string, count int) ([]SearchItem, error) {
	const ep = "/api/v1/content/zhihu_search"
	if count <= 0 || count > searchMaxCount {
		count = searchMaxCount
	}
	q := url.Values{}
	q.Set("Query", query)
	q.Set("Count", strconv.Itoa(count))

	var env envelope[searchData]
	if err := c.do(ctx, ep, q, &env); err != nil {
		return nil, err
	}
	if err := check(env.Code, env.Message, ep); err != nil {
		return nil, err
	}
	return env.Data.Items, nil
}

// ToItem 把搜索结果转成语料单元。
//
// 公共搜索只写发现来源，不会伪造收藏或创作关系。
func (s SearchItem) ToItem(folder string, clocks ...func() time.Time) Item {
	now := time.Now
	if len(clocks) > 0 && clocks[0] != nil {
		now = clocks[0]
	}
	var hints []string
	if folder != "" {
		hints = []string{folder}
	}
	return Item{
		Identity:         ResolveIdentity(ContentType(normalizeType(s.ContentType)), s.ContentID, s.URL, s.Title),
		DiscoverySources: []DiscoverySource{DiscoveryPublicSearch},
		UpdatedAt:        s.EditTime,
		ObservedAt:       now().Unix(),
		URL:              s.URL,
		Title:            s.Title,
		Summary:          s.ContentText,
		Type:             ContentType(normalizeType(s.ContentType)),
		ConceptHints:     hints,
		Author:           s.AuthorName,
		LikeCount:        int64(s.VoteUpCount),
	}
}

// normalizeType 搜索接口返回的类型首字母大写，用户数据接口返回小写，统一到后者。
func normalizeType(t string) string {
	switch t {
	case "Answer", "answer":
		return "answer"
	case "Article", "article":
		return "article"
	case "Zvideo", "zvideo":
		return "zvideo"
	case "Pin", "pin":
		return "pin"
	case "Question", "question":
		return "question"
	default:
		return "unknown"
	}
}
