package engine

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// loadSample 载入真实样本语料与其概念标注，按 URL 对齐。
func loadSample(t *testing.T) Input {
	t.Helper()
	p := &zhihu.MockProvider{Path: "../../testdata/corpus_sample.json"}
	c, err := p.Fetch(context.Background())
	if err != nil {
		t.Fatalf("载入语料失败: %v", err)
	}
	raw, err := os.ReadFile("../../testdata/concepts_sample.json")
	if err != nil {
		t.Fatalf("载入概念标注失败: %v", err)
	}
	var byURL map[string][]string
	if err := json.Unmarshal(raw, &byURL); err != nil {
		t.Fatalf("解析概念标注失败: %v", err)
	}
	in := Input{}
	for _, it := range c.Items {
		cs, ok := byURL[it.URL]
		if !ok {
			continue
		}
		in.Items = append(in.Items, it)
		in.Concepts = append(in.Concepts, cs)
	}
	if len(in.Items) < 400 {
		t.Fatalf("对齐后语料过少: %d", len(in.Items))
	}
	return in
}

// TestRunOnRealSample 是 Go/No-Go 门槛的自动化版本。
func TestRunOnRealSample(t *testing.T) {
	in := loadSample(t)
	u, err := Run(in, Options{}, nil)
	if err != nil {
		t.Fatalf("引擎失败: %v", err)
	}

	// 门槛一：≥6 个可解释星群
	if u.Meta.Clusters < 6 {
		t.Errorf("星群数 %d < 6，未达 Go/No-Go 门槛", u.Meta.Clusters)
	}
	// 门槛二：≥1 个非牵强的跨主题连接
	if len(u.Wormholes) < 1 {
		t.Error("未产出任何虫洞，未达 Go/No-Go 门槛")
	}
	// 虫洞必须同时满足显著分离与跨越稀少
	for _, w := range u.Wormholes {
		if w.Z >= -2 {
			t.Errorf("虫洞 %s×%s 的 z=%.2f 未达显著", w.NameA, w.NameB, w.Z)
		}
		if w.Observed > 3 {
			t.Errorf("虫洞 %s×%s 跨越 %d 次，不算稀有", w.NameA, w.NameB, w.Observed)
		}
		if len(w.Evidence) == 0 {
			t.Errorf("虫洞 %s×%s 没有证据条目", w.NameA, w.NameB)
		}
	}
	// 每颗恒星都必须能点回原文 —— 这是产品的核心承诺
	for _, s := range u.Stars {
		if len(s.Evidence) == 0 {
			t.Errorf("恒星「%s」没有证据条目", s.Concept)
		}
		if s.Persist > 1.0001 {
			t.Errorf("恒星「%s」持续性 %.3f 超过 1，分母算错了", s.Concept, s.Persist)
		}
	}
	// 熄灭的星：有过体量，且确实停了足够久
	if len(u.Dark) > darkMax {
		t.Errorf("熄灭的星 %d 颗，超过展示上限 %d", len(u.Dark), darkMax)
	}
	for _, d := range u.Dark {
		if d.N < darkMinN {
			t.Errorf("熄灭的星「%s」条目数 %d < %d，体量不足以称为熄灭", d.Concept, d.N, darkMinN)
		}
		if d.Gap < darkMinGap {
			t.Errorf("熄灭的星「%s」只停了 %d 个月，不到下限 %d", d.Concept, d.Gap, darkMinGap)
		}
	}
	t.Logf("星群 %d | 恒星 %d | 粒子 %d | 虫洞 %d | 孤例 %d | 熄灭 %d | 断裂修复 %d",
		u.Meta.Clusters, u.Meta.Concepts, len(u.Particles), len(u.Wormholes),
		len(u.Solo), len(u.Dark), u.Meta.Splits)
	if len(u.Wormholes) > 0 {
		w := u.Wormholes[0]
		t.Logf("最强虫洞：「%s」×「%s」 实测 %d / 期望 %.1f / z=%.2f",
			w.NameA, w.NameB, w.Observed, w.Expected, w.Z)
		for _, e := range w.Evidence {
			t.Logf("    · %s  [%s ↔ %s]", e.Title, e.SideA, e.SideB)
		}
	}
	for _, d := range u.Dark {
		t.Logf("熄灭的星：%s %d 条（收藏 %d / 创作 %d），%s → %s，已停 %d 个月",
			d.Concept, d.N, d.Fav, d.Own, d.First, d.Last, d.Gap)
	}
}

// TestSpectrumNeverPassesThroughGreen 锁死光谱映射。
//
// 在琥珀与蓝之间线性插值色相会经过绿色，星空里没有绿星。
// 真实恒星靠去饱和穿过白色，这条测试防止有人改回去。
func TestSpectrumNeverPassesThroughGreen(t *testing.T) {
	for i := 0; i <= 100; i++ {
		r := float64(i) / 100
		hue, sat := spectrum(r)
		if hue != 32 && hue != 218 {
			t.Fatalf("ratio=%.2f 得到色相 %d，只允许 32(琥珀) 或 218(蓝白)", r, hue)
		}
		if sat < 0 || sat > 70 {
			t.Fatalf("ratio=%.2f 饱和度 %d 越界", r, sat)
		}
	}
	// 中点必须近乎纯白
	if _, sat := spectrum(0.5); sat > 2 {
		t.Fatalf("创作收藏持平时应近乎纯白，实际饱和度 %d", sat)
	}
}

// TestDeterministic 同一输入必须产出同一星图 —— 分享快照要能重建。
func TestDeterministic(t *testing.T) {
	in := loadSample(t)
	opt := Options{Shuffles: 200}
	a, err := Run(in, opt, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Run(in, opt, nil)
	if err != nil {
		t.Fatal(err)
	}
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatal("两次运行结果不一致，星图不可复现")
	}
}

func BenchmarkRun(b *testing.B) {
	p := &zhihu.MockProvider{Path: "../../testdata/corpus_sample.json"}
	c, _ := p.Fetch(context.Background())
	raw, _ := os.ReadFile("../../testdata/concepts_sample.json")
	var byURL map[string][]string
	json.Unmarshal(raw, &byURL)
	in := Input{}
	for _, it := range c.Items {
		if cs, ok := byURL[it.URL]; ok {
			in.Items = append(in.Items, it)
			in.Concepts = append(in.Concepts, cs)
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Run(in, Options{}, nil); err != nil {
			b.Fatal(err)
		}
	}
}

// TestConsumerProfileKeepsVariety 守住这次改动的初衷。
//
// 绝大多数知乎用户只收藏、不创作。旧的着色轴是 own/(own+fav)，对这类用户恒为 0，
// 83 颗星会被涂成同一个最饱和的琥珀色；旧的暗物质判据 Fav>=3 && Own==0
// 对他们则是 83/83 全中，配套文案「你想成为、还没开始的那个人」
// 变成对其全部兴趣的指控。
//
// 这个测试把样本语料的 Own 全部抹掉，断言星图仍然是一张星图。
func TestConsumerProfileKeepsVariety(t *testing.T) {
	in := loadSample(t)
	for i := range in.Items {
		in.Items[i].Own = false
	}
	u, err := Run(in, Options{}, nil)
	if err != nil {
		t.Fatalf("引擎失败: %v", err)
	}
	if u.Meta.Own != 0 {
		t.Fatalf("这一组本应没有任何创作，实际 %d", u.Meta.Own)
	}

	colors := map[[2]int]int{}
	for _, s := range u.Stars {
		colors[[2]int{s.Hue, s.Sat}]++
	}
	// 旧实现在这里恒为 1
	if len(colors) < 10 {
		t.Errorf("纯消费者只得到 %d 种星色，星图退化成一片单色", len(colors))
	}
	for k, n := range colors {
		if share := float64(n) / float64(len(u.Stars)); share > 0.5 {
			t.Errorf("星色 hue%d/sat%d 占了 %.0f%%，色彩没有铺开", k[0], k[1], share*100)
		}
	}

	// 旧实现在这里是 83（= 全部恒星）
	if len(u.Dark) == 0 || len(u.Dark) > darkMax {
		t.Errorf("熄灭的星 %d 颗，应在 1~%d 之间", len(u.Dark), darkMax)
	}
	// 结构性特征不依赖 own，必须原样还在
	if len(u.Wormholes) == 0 {
		t.Error("虫洞不应受创作与否影响，却为空")
	}
	t.Logf("纯消费者：恒星 %d | 星色 %d 种 | 熄灭 %d | 虫洞 %d | 星云 %d | 孤例 %d",
		len(u.Stars), len(colors), len(u.Dark), len(u.Wormholes), len(u.Nebula), len(u.Solo))
}
