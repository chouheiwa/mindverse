// Package seed 实现游客模式（种子星）。
//
// 内容太少或没有授权时，让用户现场挑几个感兴趣的方向，
// 用知乎搜索把它们展开成真实语料，再走同一条管线。
//
// 硬约束：界面必须显式标注「这是基于你现场选择生成的宇宙，不是你的知乎历史」。
// 绝不允许把种子星结果伪装成真实历史数据。
package seed

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// Topic 是一个可挑选的方向。
type Topic struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Hint  string `json:"hint"` // 一句话说明，帮用户判断
	Query string `json:"-"`    // 实际用于搜索的关键词，不外发
}

// topics 是精选的方向池。
//
// 刻意覆盖不同象限 —— 技术、表达、生活、思维方式都有，
// 否则挑完全是同一类，星图会退化成一团。
var topics = []Topic{
	{"ai", "AI 与大模型", "架构、Agent、提示工程", "大模型架构 Agent 设计 深度解析"},
	{"code", "写代码这件事", "工程实践、调试、技术选型", "程序员 工程实践 技术选型 经验"},
	{"cs", "计算机底层", "体系结构、网络、操作系统", "计算机底层原理 体系结构 网络协议"},
	{"math", "数学与算法", "推导、复杂度、可视化", "数学之美 算法思想 直观理解"},
	{"design", "设计与审美", "视觉、交互、信息设计", "设计 审美 信息可视化 交互"},
	{"write", "写作与表达", "叙事、结构、说清一件事", "写作技巧 叙事结构 表达"},
	{"product", "产品与增长", "需求、取舍、用户", "产品设计 需求取舍 用户增长"},
	{"career", "职业与选择", "转行、成长、职场判断", "职业选择 转行 成长路径"},
	{"science", "科学与认知", "物理、生物、认知科学", "科学 认知 思维方式"},
	{"history", "历史与人文", "考古、艺术史、社会", "历史 考古 艺术史 人文"},
	{"game", "游戏与博弈", "机制设计、策略、桌游", "游戏设计 博弈 策略 桌游"},
	{"life", "生活与手艺", "料理、运动、动手做", "生活 手艺 料理 运动"},
	{"film", "影视与故事", "叙事、镜头、剧作", "影视 剧作 叙事 镜头语言"},
	{"finance", "商业与金融", "市场、投资、经济学", "商业 投资 经济学 市场"},
}

// MinPicks 与 MaxPicks 限定挑选数量。
//
// 下限 6：低于这个数出不来 6 个星群，也就没有星图可看。
// 上限 12：每个方向一次搜索，12 次已经够用，再多是浪费配额。
const (
	MinPicks = 6
	MaxPicks = 12
)

// Topics 返回可挑选的方向。
func Topics() []Topic { return topics }

func topicByID(id string) (Topic, bool) {
	for _, t := range topics {
		if t.ID == id {
			return t, true
		}
	}
	return Topic{}, false
}

// Builder 把挑选结果展开成语料。
type Builder struct {
	Client *zhihu.Client

	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	items []zhihu.Item
	at    time.Time
}

const cacheTTL = 6 * time.Hour

func NewBuilder(c *zhihu.Client) *Builder {
	return &Builder{Client: c, cache: map[string]cached{}}
}

// Build 依次展开每个方向。
//
// 单个方向失败不拖垮整次生成 —— 配额耗尽时能拿到多少算多少，
// 拿不到足够语料再报错。
func (b *Builder) Build(ctx context.Context, ids []string) (*zhihu.Corpus, error) {
	if len(ids) < MinPicks {
		return nil, fmt.Errorf("至少要挑 %d 个方向，星图才立得住", MinPicks)
	}
	if len(ids) > MaxPicks {
		ids = ids[:MaxPicks]
	}

	seen := map[string]bool{}
	out := &zhihu.Corpus{Source: "seed"}
	var firstErr error

	for _, id := range ids {
		t, ok := topicByID(id)
		if !ok {
			continue
		}
		items, err := b.expand(ctx, t)
		out.Calls++
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, it := range items {
			if it.URL == "" || seen[it.URL] || it.Title == "" {
				continue
			}
			seen[it.URL] = true
			out.Items = append(out.Items, it)
		}
	}

	if len(out.Items) < 30 {
		if firstErr != nil {
			return nil, fmt.Errorf("展开选题失败: %w", firstErr)
		}
		return nil, fmt.Errorf("只找到 %d 条内容，不够生成星图，换几个方向再试", len(out.Items))
	}
	return out, nil
}

func (b *Builder) expand(ctx context.Context, t Topic) ([]zhihu.Item, error) {
	b.mu.Lock()
	if c, ok := b.cache[t.ID]; ok && time.Since(c.at) < cacheTTL {
		b.mu.Unlock()
		return c.items, nil
	}
	b.mu.Unlock()

	res, err := b.Client.SearchZhihu(ctx, t.Query, 10)
	if err != nil {
		return nil, err
	}
	items := make([]zhihu.Item, 0, len(res))
	for _, r := range res {
		// 方向名当作「收藏夹」注入 —— 概念抽取会把它作为先验
		items = append(items, r.ToItem(t.Name))
	}

	b.mu.Lock()
	b.cache[t.ID] = cached{items: items, at: time.Now()}
	b.mu.Unlock()
	return items, nil
}
