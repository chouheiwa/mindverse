package zhihu

import (
	"context"
	"net/url"
	"strconv"
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
// 标成非本人创作（Own=false）：种子星是「你想看的」，不是「你写过的」。
// 这也让暗物质判据在游客模式下依然成立。
func (s SearchItem) ToItem(folder string) Item {
	var folders []string
	if folder != "" {
		folders = []string{folder}
	}
	return Item{
		URL:       s.URL,
		Title:     s.Title,
		Summary:   s.ContentText,
		Type:      ContentType(normalizeType(s.ContentType)),
		CreatedAt: s.EditTime,
		FavTime:   s.EditTime,
		Own:       false,
		Folders:   folders,
		Author:    s.AuthorName,
		LikeCount: int64(s.VoteUpCount),
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
		return "answer"
	}
}
