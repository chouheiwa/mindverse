package extract

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// fakeLLM 模拟一个规矩的模型：按序号回填固定概念，并制造一个同义变体
// 来检验规范化那一步。
type fakeLLM struct {
	mu    sync.Mutex
	calls int
	seen  []string
}

func (f *fakeLLM) Complete(_ context.Context, system, user string, _ int) (string, error) {
	f.mu.Lock()
	f.calls++
	f.seen = append(f.seen, user)
	f.mu.Unlock()

	switch {
	case strings.Contains(system, "主题星群"):
		return `{"name":"游戏与博弈"}`, nil
	case strings.Contains(system, "需要合并的变体"):
		// 把变体并回规范写法
		return "```json\n{\"merge\":{\"LLM架构\":\"大模型架构\"}}\n```", nil
	}
	// 概念抽取：解析出每行的序号
	var rs []string
	for _, line := range strings.Split(user, "\n") {
		line = strings.TrimSpace(line)
		var n int
		if _, err := fmt.Sscanf(line, "%d.", &n); err != nil {
			continue
		}
		c := `"大模型架构","底层原理","反直觉"`
		if n%7 == 0 {
			c = `"LLM架构","底层原理","权衡取舍"` // 故意用变体
		}
		rs = append(rs, fmt.Sprintf(`{"i":%d,"c":[%s]}`, n, c))
	}
	return `{"r":[` + strings.Join(rs, ",") + `]}`, nil
}

func sampleItems(n int) []zhihu.Item {
	out := make([]zhihu.Item, n)
	for i := range out {
		out[i] = zhihu.Item{
			URL:     fmt.Sprintf("https://www.zhihu.com/answer/%d", i),
			Title:   fmt.Sprintf("第 %d 条内容标题", i),
			Summary: "摘要正文",
			Folders: []string{"技术"},
		}
	}
	return out
}

func TestExtractAlignsAndCanonicalizes(t *testing.T) {
	f := &fakeLLM{}
	e := NewLLMExtractor(f)
	e.BatchSize, e.Workers, e.SeedBatches = 10, 3, 1
	items := sampleItems(45)

	got, err := e.Extract(context.Background(), items)
	if err != nil {
		t.Fatalf("抽取失败: %v", err)
	}
	if len(got) != len(items) {
		t.Fatalf("标注长度必须与语料一致：%d vs %d", len(got), len(items))
	}
	annotated := 0
	for _, cs := range got {
		if len(cs) > 0 {
			annotated++
		}
	}
	if annotated != len(items) {
		t.Errorf("应全部标注，实际 %d/%d", annotated, len(items))
	}
	// 规范化必须把变体合掉
	for i, cs := range got {
		for _, c := range cs {
			if c == "LLM架构" {
				t.Fatalf("第 %d 条仍含未合并的变体 LLM架构", i)
			}
		}
	}
	t.Logf("模型调用 %d 次，覆盖 %d 条", f.calls, annotated)
}

func TestRenderBatchSeparatesBindingsFromPublicHints(t *testing.T) {
	items := []zhihu.Item{
		{Title: "收藏", Bindings: []zhihu.UserContentBinding{{Relation: zhihu.RelationCollected, Folders: []string{"Beta", "Alpha"}}}},
		{Title: "搜索", Identity: zhihu.ContentIdentity{ContentID: "answer:1"}, DiscoverySources: []zhihu.DiscoverySource{zhihu.DiscoveryPublicSearch}, ConceptHints: []string{"游戏与博弈"}},
	}
	got := renderBatch(items, 0, nil)
	if !strings.Contains(got, "作者把它收进了收藏夹：Alpha、Beta") {
		t.Fatalf("真实绑定收藏夹应排序后注入：%s", got)
	}
	if !strings.Contains(got, "公共搜索方向：游戏与博弈") {
		t.Fatalf("公共探索先验应保留：%s", got)
	}
	lines := strings.Split(got, "\n")
	if len(lines) > 2 && strings.Contains(lines[2], "收进了收藏夹") {
		t.Fatalf("公共搜索不得伪装成收藏：%s", lines[2])
	}
}

// TestVocabularyIsFedBack 检验词表回灌：并发批次必须看得到首批建立的词表，
// 否则概念会碎成一地，聚类质量崩掉。
func TestVocabularyIsFedBack(t *testing.T) {
	f := &fakeLLM{}
	e := NewLLMExtractor(f)
	e.BatchSize, e.Workers, e.SeedBatches = 5, 2, 1
	if _, err := e.Extract(context.Background(), sampleItems(30)); err != nil {
		t.Fatal(err)
	}
	withVocab := 0
	for _, u := range f.seen {
		if strings.Contains(u, "【已有词表】") {
			withVocab++
		}
	}
	if withVocab == 0 {
		t.Fatal("没有任何批次带上已有词表")
	}
	t.Logf("%d/%d 个批次带了词表", withVocab, len(f.seen))
}

func TestSensitiveItemsNeverReachTheModel(t *testing.T) {
	f := &fakeLLM{}
	e := NewLLMExtractor(f)
	e.BatchSize, e.Workers, e.SeedBatches = 50, 1, 1
	items := sampleItems(5)
	items[2].Title = "我确诊抑郁症之后的三年"
	if _, err := e.Extract(context.Background(), items); err != nil {
		t.Fatal(err)
	}
	for _, u := range f.seen {
		if strings.Contains(u, "抑郁症") {
			t.Fatal("敏感条目进入了模型上下文 —— 过滤必须发生在抽取之前")
		}
	}
}

func TestFilterConceptsDropsSensitiveAndLongOnes(t *testing.T) {
	got := FilterConcepts([]string{"大模型架构", "政治立场", "", "大模型架构",
		"这是一整句被模型误当成概念输出的话", "健康与医疗"})
	want := []string{"大模型架构"}
	if len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("过滤结果不对: %v", got)
	}
}

func TestJSONBlockSurvivesFencesAndChatter(t *testing.T) {
	cases := []string{
		`{"r":[]}`,
		"好的，结果如下：\n```json\n{\"r\":[]}\n```\n希望有帮助",
		"```\n{\"r\":[]}\n```",
		`前缀 {"r":[{"i":1,"c":["带\"引号\"的值"]}]} 后缀`,
	}
	for i, c := range cases {
		blk, err := jsonBlock(c)
		if err != nil {
			t.Fatalf("用例 %d 失败: %v", i, err)
		}
		var v any
		if err := json.Unmarshal([]byte(blk), &v); err != nil {
			t.Fatalf("用例 %d 抠出的不是合法 JSON: %s", i, blk)
		}
	}
}

func TestNameClusterRejectsGarbage(t *testing.T) {
	e := NewLLMExtractor(&fakeLLM{})
	name, err := e.NameCluster(context.Background(),
		[]string{"图形学", "渲染管线", "信息不对称", "游戏"}, []string{"玩狼人杀如何抿身份？"})
	if err != nil {
		t.Fatal(err)
	}
	if name != "游戏与博弈" {
		t.Fatalf("命名不对: %s", name)
	}
	if name == "图形学" {
		t.Fatal("不能退化成取词频最高的成员")
	}
}

func TestFileExtractorAlignsByURL(t *testing.T) {
	f := &FileExtractor{Path: "../../testdata/concepts_sample.json"}
	p := &zhihu.MockProvider{Path: "../../testdata/corpus_sample.json"}
	c, err := p.Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.Extract(context.Background(), c.Items)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, cs := range got {
		if len(cs) > 0 {
			n++
		}
	}
	if n < 400 {
		t.Fatalf("按 URL 对齐后覆盖过低: %d", n)
	}
	t.Logf("离线标注覆盖 %d/%d 条", n, len(c.Items))
}

// TestHealthDisclosureIsFilteredOnPurpose 固化一条真实样本的过滤行为。
//
// 《你经历过怎样的希望？》正文含「她却在这天确诊了乳腺癌」，属健康医疗类目。
// 剔除是正确行为，不是误伤 —— 但必须计数并如实告知用户。
func TestHealthDisclosureIsFilteredOnPurpose(t *testing.T) {
	p := &zhihu.MockProvider{Path: "../../testdata/corpus_sample.json"}
	c, err := p.Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	n := CountSensitiveItems(c.Items)
	if n == 0 {
		t.Fatal("样本里确有健康类内容，过滤器却一条都没拦住")
	}
	if n > 5 {
		t.Errorf("过滤了 %d 条，疑似过度触发", n)
	}
	t.Logf("样本中 %d/%d 条因敏感类目未参与分析", n, len(c.Items))
}
