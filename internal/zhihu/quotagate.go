package zhihu

import (
	"context"
	"sync"
	"time"
)

// 公开的统一额度 API ID。
const (
	QuotaUserData        = "user_data"
	QuotaQuestionAnswers = "question_answers"
	QuotaZhihuSearch     = "zhihu_search"
	QuotaCreator         = "creator"
)

// LowQuotaRatio 是「该降级了」的阈值：剩余不足配额的 15%。
const LowQuotaRatio = 0.15

// QuotaSnapshot 是某一时刻的额度快照。
type QuotaSnapshot struct {
	At    time.Time
	Items map[string]QuotaItem
}

// Remaining 返回某项能力的剩余次数；没查到时第二个返回值为 false。
func (s *QuotaSnapshot) Remaining(apiID string) (int64, bool) {
	if s == nil {
		return 0, false
	}
	item, ok := s.Items[apiID]
	return item.Remaining, ok
}

// Low 返回剩余比例低于 ratio 的能力，按剩余比例升序。
func (s *QuotaSnapshot) Low(ratio float64) []QuotaItem {
	if s == nil {
		return nil
	}
	var low []QuotaItem
	for _, item := range s.Items {
		if item.Total <= 0 {
			continue
		}
		if float64(item.Remaining)/float64(item.Total) < ratio {
			low = append(low, item)
		}
	}
	sortQuotaByRatio(low)
	return low
}

func sortQuotaByRatio(items []QuotaItem) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0; j-- {
			a, b := items[j-1], items[j]
			if float64(a.Remaining)/float64(a.Total) <= float64(b.Remaining)/float64(b.Total) {
				break
			}
			items[j-1], items[j] = b, a
		}
	}
}

// QuotaGate 缓存额度查询结果。
//
// 额度查询本身不消耗业务额度，但它仍是一次网络往返；每次生成前查一次就够了，
// 不做定时轮询 —— 轮询只会在没人使用时白白产生请求。
type QuotaGate struct {
	client *Client
	ttl    time.Duration
	now    func() time.Time

	mu   sync.Mutex
	snap *QuotaSnapshot
}

// NewQuotaGate 构造闸门；ttl <= 0 时用 60 秒。
func NewQuotaGate(client *Client, ttl time.Duration) *QuotaGate {
	if ttl <= 0 {
		ttl = 60 * time.Second
	}
	return &QuotaGate{client: client, ttl: ttl, now: time.Now}
}

// Snapshot 返回缓存内的额度，过期则重新查询。
func (g *QuotaGate) Snapshot(ctx context.Context) (*QuotaSnapshot, error) {
	if g == nil || g.client == nil {
		return nil, nil
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.snap != nil && g.now().Sub(g.snap.At) < g.ttl {
		return g.snap, nil
	}
	items, err := g.client.Quota(ctx)
	if err != nil {
		// 查不到额度不该阻断主流程：返回上一次的快照（可能为 nil）并把错误带出去。
		return g.snap, err
	}
	byID := make(map[string]QuotaItem, len(items))
	for _, item := range items {
		byID[item.APIID] = item
	}
	g.snap = &QuotaSnapshot{At: g.now(), Items: byID}
	return g.snap, nil
}

// EnoughFor 报告某项能力是否还够做 need 次请求。
//
// 查不到该项时返回 true：缺少额度信息不构成拒绝理由，宁可让真实请求去报错，
// 也不要凭猜测拦住用户。
func (s *QuotaSnapshot) EnoughFor(apiID string, need int64) bool {
	remaining, ok := s.Remaining(apiID)
	if !ok {
		return true
	}
	return remaining >= need
}
