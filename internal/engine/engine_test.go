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
	// 暗物质：收藏过但从未创作
	for _, d := range u.Dark {
		if d.Own != 0 {
			t.Errorf("暗物质「%s」不应有创作，实际 %d", d.Concept, d.Own)
		}
	}
	t.Logf("星群 %d | 恒星 %d | 粒子 %d | 虫洞 %d | 孤例 %d | 暗物质 %d | 断裂修复 %d",
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
		t.Logf("暗物质：%s 收藏 %d / 创作 0（%s → %s）", d.Concept, d.Fav, d.First, d.Last)
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
