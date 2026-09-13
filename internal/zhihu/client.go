package zhihu

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	apiBase  = "https://developer.zhihu.com"
	openBase = "https://openapi.zhihu.com"

	// 单页上限，服务端规定为 50。
	maxLimit = 50
)

// Client 调用知乎用户数据接口。
//
// 双凭证模型：
//   - Authorization: Bearer <Access Secret>  鉴权开放平台调用方，每次必带
//   - X-OAuth-Token: <OAuth access token>    指明当前代表哪个用户，仅代他人访问时带
//
// 两者职责不同，混填是官方文档专门警告的高频错误。
type Client struct {
	AccessSecret string        // 开放平台 Access Secret
	OAuthToken   string        // 用户 OAuth token；为空时读取 Access Secret 所属账号本人数据
	HTTP         *http.Client  // 可注入，便于测试
	Timeout      time.Duration // 单次请求超时
	BaseURL      string        // 可注入，便于测试；留空即官方域名
}

// NewClient 构造一个带默认超时的客户端。
func NewClient(accessSecret, oauthToken string) *Client {
	return &Client{
		AccessSecret: accessSecret,
		OAuthToken:   oauthToken,
		HTTP:         &http.Client{Timeout: 30 * time.Second},
		Timeout:      30 * time.Second,
	}
}

func (c *Client) do(ctx context.Context, endpoint string, q url.Values, out any) error {
	if c.AccessSecret == "" {
		return fmt.Errorf("开放平台 Access Secret 未配置")
	}
	base := c.BaseURL
	if base == "" {
		base = apiBase
	}
	u := base + endpoint
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.AccessSecret)
	req.Header.Set("X-Request-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	req.Header.Set("Content-Type", "application/json")
	if c.OAuthToken != "" {
		req.Header.Set("X-OAuth-Token", c.OAuthToken)
	}

	cl := c.HTTP
	if cl == nil {
		cl = &http.Client{Timeout: 30 * time.Second}
	}
	resp, err := cl.Do(req)
	if err != nil {
		return fmt.Errorf("请求 %s 失败: %w", endpoint, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("读取 %s 响应失败: %w", endpoint, err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("请求 %s 返回 HTTP %d", endpoint, resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("解析 %s 响应失败: %w", endpoint, err)
	}
	return nil
}

func check(code int, msg, endpoint string) error {
	if code == CodeOK {
		return nil
	}
	return &APIError{Code: code, Message: msg, Endpoint: endpoint}
}

// pageFn 抽象一次分页请求：给定 offset 与 limit，返回本页条目。
type pageFn[T any] func(ctx context.Context, offset int64, limit int) ([]T, error)

// pageLimit 是翻页步长，取服务端上限。
//
// 终止条件不依赖 IsEnd（见 collect），所以大步长没有副作用，只是更省配额。
const pageLimit = maxLimit

// collect 按固定步长翻页，直到某页返回空或达到 maxPages。
//
// 刻意不使用 Paging.IsEnd 与 Paging.NextOffset。2026-08-27 对
// /api/v1/user/favlist_contents 实测确认服务端有缺陷：列表中已失效的条目会被
// 丢弃，服务端再用「实收 < 请求」反推出 IsEnd=true，于是在第一个失效条目处
// 就谎报到底。同一个 189 条的收藏夹，信 IsEnd 只能读到 29 条（15%），
// 忽略 IsEnd 硬翻能读到 188 条。/api/v1/user/followees 有同样表现。
//
// Paging.Totals 在同一批响应里同样被污染（退化成 Offset+实收），故也不可信。
//
// 越界 Offset 服务端返回 Code=0 且 Items 为空，因此「空页」是可靠的终止条件。
// 失效条目会让 offset 与实收错位造成重叠，故按 key 去重。
func collect[T any](ctx context.Context, maxPages int, key func(T) string, f pageFn[T]) ([]T, error) {
	var all []T
	seen := make(map[string]bool)
	var offset int64
	for i := 0; i < maxPages; i++ {
		items, err := f(ctx, offset, pageLimit)
		if err != nil {
			// 已经拿到部分数据时，配额或限流不应让整次生成失败。
			var ae *APIError
			if len(all) > 0 && asAPIError(err, &ae) && (ae.Exhausted() || ae.Code == CodeRateLim) {
				return all, nil
			}
			return all, err
		}
		if len(items) == 0 {
			break
		}
		for _, it := range items {
			k := key(it)
			if k != "" {
				if seen[k] {
					continue
				}
				seen[k] = true
			}
			all = append(all, it)
		}
		offset += pageLimit
	}
	return all, nil
}

func asAPIError(err error, target **APIError) bool {
	for err != nil {
		if e, ok := err.(*APIError); ok {
			*target = e
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// Contents 获取用户公开范围内的创作内容。
func (c *Client) Contents(ctx context.Context, t ContentType, maxPages int) ([]ContentItem, error) {
	const ep = "/api/v1/user/contents"
	return collect(ctx, maxPages, func(it ContentItem) string { return it.URL },
		func(ctx context.Context, off int64, limit int) ([]ContentItem, error) {
			q := url.Values{}
			q.Set("ContentType", string(t))
			q.Set("Offset", strconv.FormatInt(off, 10))
			q.Set("Limit", strconv.Itoa(limit))
			q.Set("SortField", "ts")
			q.Set("SortOrder", "desc")
			var env envelope[contentsData]
			if err := c.do(ctx, ep, q, &env); err != nil {
				return nil, err
			}
			if err := check(env.Code, env.Message, ep); err != nil {
				return nil, err
			}
			return env.Data.Items, nil
		})
}

// Favlists 获取收藏夹列表。
//
// 该接口没有 Paging，服务端忽略 Offset —— 因此不承诺遍历全部收藏夹，
// 界面上也不得宣称「读取了你的全部收藏」。
func (c *Client) Favlists(ctx context.Context) ([]Favlist, error) {
	const ep = "/api/v1/user/favlists"
	q := url.Values{}
	q.Set("Limit", strconv.Itoa(maxLimit))
	var env envelope[favlistsData]
	if err := c.do(ctx, ep, q, &env); err != nil {
		return nil, err
	}
	if err := check(env.Code, env.Message, ep); err != nil {
		return nil, err
	}
	return env.Data.Items, nil
}

// FavlistContents 获取指定收藏夹中的内容。
func (c *Client) FavlistContents(ctx context.Context, token int64, maxPages int) ([]CollectionItem, error) {
	const ep = "/api/v1/user/favlist_contents"
	return collect(ctx, maxPages, func(it CollectionItem) string { return it.URL },
		func(ctx context.Context, off int64, limit int) ([]CollectionItem, error) {
			q := url.Values{}
			q.Set("FavlistUrlToken", strconv.FormatInt(token, 10))
			q.Set("Offset", strconv.FormatInt(off, 10))
			q.Set("Limit", strconv.Itoa(limit))
			var env envelope[collectionsData]
			if err := c.do(ctx, ep, q, &env); err != nil {
				return nil, err
			}
			if err := check(env.Code, env.Message, ep); err != nil {
				return nil, err
			}
			return env.Data.Items, nil
		})
}

// RecentCollections 获取近期收藏。
//
// 该接口既没有 Offset 也没有 Paging，只代表最近一批，不等于完整收藏历史。
func (c *Client) RecentCollections(ctx context.Context) ([]CollectionItem, error) {
	const ep = "/api/v1/user/collections"
	q := url.Values{}
	q.Set("Limit", strconv.Itoa(maxLimit))
	var env envelope[collectionsData]
	if err := c.do(ctx, ep, q, &env); err != nil {
		return nil, err
	}
	if err := check(env.Code, env.Message, ep); err != nil {
		return nil, err
	}
	return env.Data.Items, nil
}

// Followees 获取关注列表。
func (c *Client) Followees(ctx context.Context, maxPages int) ([]Followee, error) {
	const ep = "/api/v1/user/followees"
	return collect(ctx, maxPages, func(it Followee) string { return it.URLToken },
		func(ctx context.Context, off int64, limit int) ([]Followee, error) {
			q := url.Values{}
			q.Set("Offset", strconv.FormatInt(off, 10))
			q.Set("Limit", strconv.Itoa(limit))
			var env envelope[followeesData]
			if err := c.do(ctx, ep, q, &env); err != nil {
				return nil, err
			}
			if err := check(env.Code, env.Message, ep); err != nil {
				return nil, err
			}
			return env.Data.Items, nil
		})
}

// Profile 读取账号资料。
//
// 《获取授权用户基础信息》明确：openapi.zhihu.com/user 只认 OAuth access token，
// 不需要 Access Secret、X-OAuth-Token 或 X-Request-Timestamp。旧实现发的是
// Access Secret 加那两个头，服务端不认，于是这个接口从来没成功过 —— 而失败被
// 降级成 nil，所以一直没人发现。
//
// 失败仍一律降级为 nil，绝不阻断主流程。
func (c *Client) Profile(ctx context.Context) *Profile {
	if c.OAuthToken == "" {
		return nil
	}
	base := openBase
	if c.BaseURL != "" {
		base = c.BaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/user", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+c.OAuthToken)
	cl := c.HTTP
	if cl == nil {
		cl = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := cl.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil
	}
	// 文档要求同时检查 HTTP 状态和响应内容，不能只凭 200 判断成功。
	if resp.StatusCode/100 != 2 {
		return nil
	}
	// 响应包裹层实测不统一，逐层尝试，取不到就算了。
	var probe map[string]json.RawMessage
	if json.Unmarshal(body, &probe) != nil {
		return nil
	}
	for _, k := range []string{"data", "Data", "user"} {
		raw, ok := probe[k]
		if !ok {
			continue
		}
		var p Profile
		if json.Unmarshal(raw, &p) == nil && p.Identified() {
			return &p
		}
	}
	var p Profile
	if json.Unmarshal(body, &p) == nil && p.Identified() {
		return &p
	}
	return nil
}

// QuotaItem 一项开放 API 的当日额度。
type QuotaItem struct {
	APIID     string `json:"APIID"`
	APIName   string `json:"APIName"`
	Remaining int64  `json:"RemainingQuota"`
	Total     int64  `json:"TotalQuota"`
	Used      int64  `json:"TotalUsed"`
}

// Quota 查询当前账号的开放 API 剩余额度。查询本身不消耗业务额度。
//
// 服务端在此接口返回的是数组而非对象，故单独解析。
func (c *Client) Quota(ctx context.Context) ([]QuotaItem, error) {
	const ep = "/api/v1/quota"
	var env envelope[[]QuotaItem]
	if err := c.do(ctx, ep, nil, &env); err != nil {
		return nil, err
	}
	if err := check(env.Code, env.Message, ep); err != nil {
		return nil, err
	}
	return env.Data, nil
}
