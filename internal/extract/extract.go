package extract

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// Extractor 把语料变成概念标注，并给星群命名。
type Extractor interface {
	// Extract 返回与 items 等长的概念标注。
	Extract(ctx context.Context, items []zhihu.Item) ([][]string, error)
	// NameCluster 给一个星群命名（管线 ⑨）。
	NameCluster(ctx context.Context, members, samples []string) (string, error)
}

const systemPrompt = `你是一个知识结构分析器。你的任务是从一条中文内容里抽取概念标签，供后续的图算法使用。

抽取规则：
1. 每条内容抽 3~5 个概念，覆盖四个正交维度：
   - 领域：这条内容属于什么学科或行业（如 计算机视觉、网文写作、考研升学）
   - 方法：它用什么方式展开（如 源码拆解、实测对比、类比讲解、复盘反思）
   - 对象：它在处理什么东西（如 注意力机制、内存与缓存、身份与鉴权）
   - 旨趣：作者真正好奇的是什么（如 底层原理、反直觉、权衡取舍、名不副实）
2. 必须抽「旨趣」维度。只打领域标签会让「城市规划」和「游戏设计」永远分属两类，
   而它们可能共享同一种好奇心 —— 找到这种共享正是本系统的目的。
3. 概念用 2~6 个汉字的短词，不要整句，不要标点。
4. 优先复用【已有词表】里的词。只有当已有词表里确实没有合适的词时，才创造新词。
   词表的一致性直接决定聚类质量。
5. 绝对不要输出涉及以下类目的概念：政治立场、宗教信仰、健康与医疗、性取向、
   种族民族、犯罪记录、精确定位、金融账户、未成年人身份。遇到这类内容，
   只抽取其中中性的技术或社会议题概念。

只输出 JSON，格式：{"r":[{"i":条目序号,"c":["概念1","概念2","概念3"]}]}`

const namePrompt = `你要给一个「主题星群」起名字。

星群由若干概念组成，它们因为经常一起出现而被聚在一起。
名字要求：
1. 4~8 个汉字，是一个有画面感的短语，不是简单罗列
2. 必须概括全部成员概念，不能只取其中词频最高的那个
3. 不要用「相关」「合集」「类」这种空词

只输出 JSON：{"name":"星群名"}`

const canonPrompt = `下面是从同一个人的阅读与创作里抽出的全部概念及其出现次数。
其中有些是同一件事的不同写法（如「大模型架构」与「LLM架构」，「调试」与「Debug」）。

请找出这些需要合并的变体，把它们映射到出现次数更多的那个规范写法。
只合并确实同义的，不要把相近但不同的概念合并（如「前端」和「渲染管线」不能合并）。

只输出 JSON：{"merge":{"变体":"规范名"}}。没有需要合并的就输出 {"merge":{}}`

// LLMExtractor 用大模型做概念抽取。
type LLMExtractor struct {
	LLM Completer

	// BatchSize 每次请求处理多少条。太大容易截断，太小浪费往返。
	BatchSize int
	// Workers 并发请求数。
	Workers int
	// SeedBatches 先串行跑几个批次来积累词表，之后才并发。
	//
	// 这是没有 embedding 服务时对管线 ③「概念归并」的替代方案：
	// 让模型看着已有词表抽取，把归并前移到抽取阶段。收尾再跑一次
	// 规范化把漏网的变体合掉。
	SeedBatches int
}

// NewLLMExtractor 用默认批量参数构造抽取器。
func NewLLMExtractor(l Completer) *LLMExtractor {
	return &LLMExtractor{LLM: l, BatchSize: 20, Workers: 4, SeedBatches: 2}
}

func (e *LLMExtractor) opts() (batch, workers, seed int) {
	batch, workers, seed = e.BatchSize, e.Workers, e.SeedBatches
	if batch <= 0 {
		batch = 20
	}
	if workers <= 0 {
		workers = 4
	}
	if seed < 0 {
		seed = 0
	}
	return
}

type batchResult struct {
	R []struct {
		I int      `json:"i"`
		C []string `json:"c"`
	} `json:"r"`
}

// renderBatch 把一批条目渲染成提示词。收藏夹名作为先验一并给出 ——
// 那是用户在无人观看时对自己兴趣的命名，小样本下能显著改善聚类质量。
func renderBatch(items []zhihu.Item, offset int, vocab []string) string {
	var b strings.Builder
	if len(vocab) > 0 {
		b.WriteString("【已有词表】（优先复用）\n")
		b.WriteString(strings.Join(vocab, "、"))
		b.WriteString("\n\n")
	}
	b.WriteString("【待抽取内容】\n")
	for i, it := range items {
		fmt.Fprintf(&b, "%d. 《%s》", offset+i, truncate(it.Title, 60))
		if s := strings.TrimSpace(it.Summary); s != "" {
			fmt.Fprintf(&b, "｜摘要：%s", truncate(s, 80))
		}
		if folders := it.EffectiveFolders(); len(folders) > 0 {
			fmt.Fprintf(&b, "｜作者把它收进了收藏夹：%s", strings.Join(folders, "、"))
		}
		if len(it.ConceptHints) > 0 {
			fmt.Fprintf(&b, "｜公共搜索方向：%s", strings.Join(it.ConceptHints, "、"))
		}
		if it.IsCreated() {
			b.WriteString("｜这是作者本人写的")
		}
		b.WriteByte('\n')
	}
	return b.String()
}

func (e *LLMExtractor) runBatch(ctx context.Context, items []zhihu.Item, offset int, vocab []string) (map[int][]string, error) {
	out, err := e.LLM.Complete(ctx, systemPrompt, renderBatch(items, offset, vocab), 4000)
	if err != nil {
		return nil, err
	}
	blk, err := jsonBlock(out)
	if err != nil {
		return nil, err
	}
	var br batchResult
	if err := json.Unmarshal([]byte(blk), &br); err != nil {
		return nil, fmt.Errorf("解析概念抽取结果失败: %w", err)
	}
	res := make(map[int][]string, len(br.R))
	for _, r := range br.R {
		if cs := FilterConcepts(r.C); len(cs) > 0 {
			res[r.I] = cs
		}
	}
	return res, nil
}

// Extract 执行管线 ①②③。
func (e *LLMExtractor) Extract(ctx context.Context, items []zhihu.Item) ([][]string, error) {
	return e.ExtractWithVocabulary(ctx, items, nil)
}

// ExtractWithVocabulary analyzes only changed items using the owner's established
// vocabulary. Existing canonical names are frozen to avoid relabeling history.
func (e *LLMExtractor) ExtractWithVocabulary(ctx context.Context, items []zhihu.Item, known map[string]int) ([][]string, error) {
	batch, workers, seedBatches := e.opts()
	result := make([][]string, len(items))

	// ① 敏感条目在进入模型之前就剔除
	live := make([]int, 0, len(items))
	for i, it := range items {
		if !IsSensitiveItem(it.Title, it.Summary) {
			live = append(live, i)
		}
	}
	if len(live) == 0 {
		return result, fmt.Errorf("过滤后没有可用语料")
	}

	type job struct {
		start int
		idx   []int
	}
	var jobs []job
	for i := 0; i < len(live); i += batch {
		end := min(i+batch, len(live))
		jobs = append(jobs, job{start: i, idx: live[i:end]})
	}

	var mu sync.Mutex
	vocabCount := map[string]int{}
	for c, n := range known {
		vocabCount[c] = n
	}
	apply := func(idx []int, start int, res map[int][]string) {
		mu.Lock()
		defer mu.Unlock()
		for off, itemIdx := range idx {
			cs := res[start+off]
			result[itemIdx] = cs
			for _, c := range cs {
				vocabCount[c]++
			}
		}
	}
	topVocab := func(n int) []string {
		mu.Lock()
		defer mu.Unlock()
		type kv struct {
			c string
			n int
		}
		xs := make([]kv, 0, len(vocabCount))
		for c, k := range vocabCount {
			xs = append(xs, kv{c, k})
		}
		sort.Slice(xs, func(i, j int) bool {
			if xs[i].n != xs[j].n {
				return xs[i].n > xs[j].n
			}
			return xs[i].c < xs[j].c
		})
		if len(xs) > n {
			xs = xs[:n]
		}
		out := make([]string, len(xs))
		for i, x := range xs {
			out[i] = x.c
		}
		return out
	}

	// 前几批串行，积累词表
	seed := min(seedBatches, len(jobs))
	for i := 0; i < seed; i++ {
		sub := pick(items, jobs[i].idx)
		res, err := e.runBatch(ctx, sub, jobs[i].start, topVocab(140))
		if err != nil {
			return result, fmt.Errorf("首批概念抽取失败: %w", err)
		}
		apply(jobs[i].idx, jobs[i].start, res)
	}

	// 其余并发
	if seed < len(jobs) {
		sem := make(chan struct{}, workers)
		var wg sync.WaitGroup
		var firstErr error
		var errMu sync.Mutex
		base := topVocab(140)
		for _, j := range jobs[seed:] {
			wg.Add(1)
			go func(j job) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				sub := pick(items, j.idx)
				res, err := e.runBatch(ctx, sub, j.start, base)
				if err != nil {
					errMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					errMu.Unlock()
					return // 单批失败不拖垮整次生成，这些条目留空
				}
				apply(j.idx, j.start, res)
			}(j)
		}
		wg.Wait()
		if firstErr != nil && countAnnotated(result) == 0 {
			return result, firstErr
		}
	}

	// ③ 收尾规范化：把漏网的同义变体合掉
	if m, err := e.canonicalize(ctx, vocabCount); err == nil && len(m) > 0 {
		for i, cs := range result {
			if len(cs) == 0 {
				continue
			}
			mapped := make([]string, 0, len(cs))
			for _, c := range cs {
				if to, ok := m[c]; ok && to != "" && known[c] == 0 {
					c = to
				}
				mapped = append(mapped, c)
			}
			result[i] = FilterConcepts(mapped)
		}
	}
	return result, nil
}

func (e *LLMExtractor) canonicalize(ctx context.Context, counts map[string]int) (map[string]string, error) {
	if len(counts) < 4 {
		return nil, nil
	}
	type kv struct {
		c string
		n int
	}
	xs := make([]kv, 0, len(counts))
	for c, n := range counts {
		xs = append(xs, kv{c, n})
	}
	sort.Slice(xs, func(i, j int) bool {
		if xs[i].n != xs[j].n {
			return xs[i].n > xs[j].n
		}
		return xs[i].c < xs[j].c
	})
	var b strings.Builder
	for _, x := range xs {
		fmt.Fprintf(&b, "%s(%d) ", x.c, x.n)
	}
	out, err := e.LLM.Complete(ctx, canonPrompt, b.String(), 2000)
	if err != nil {
		return nil, err
	}
	blk, err := jsonBlock(out)
	if err != nil {
		return nil, err
	}
	var r struct {
		Merge map[string]string `json:"merge"`
	}
	if err := json.Unmarshal([]byte(blk), &r); err != nil {
		return nil, err
	}
	// 只接受「合并到出现次数不少于自己的词」，防止模型把主流写法并进冷门写法
	clean := map[string]string{}
	for from, to := range r.Merge {
		if from == to || from == "" || to == "" {
			continue
		}
		if counts[to] >= counts[from] {
			clean[from] = to
		}
	}
	return clean, nil
}

// NameCluster 实现管线 ⑨。
//
// 为什么不能取词频最高的成员：实测有个星群装着
// 「图形学 / 渲染管线 / 信息不对称 / 游戏」，按词频会命名为「图形学」，
// 而它实际是「游戏与博弈」—— 狼人杀就在里面。
func (e *LLMExtractor) NameCluster(ctx context.Context, members, samples []string) (string, error) {
	var b strings.Builder
	b.WriteString("【成员概念】\n")
	b.WriteString(strings.Join(members, "、"))
	if len(samples) > 0 {
		b.WriteString("\n\n【代表内容标题】\n")
		for _, s := range samples {
			fmt.Fprintf(&b, "· %s\n", truncate(s, 50))
		}
	}
	out, err := e.LLM.Complete(ctx, namePrompt, b.String(), 200)
	if err != nil {
		return "", err
	}
	blk, err := jsonBlock(out)
	if err != nil {
		return "", err
	}
	var r struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal([]byte(blk), &r); err != nil {
		return "", err
	}
	name := strings.TrimSpace(r.Name)
	if name == "" || len([]rune(name)) > 14 {
		return "", fmt.Errorf("模型返回的星群名不合法")
	}
	return name, nil
}

// FileExtractor 从预先标注好的 JSON 读取概念，按 URL 对齐。
//
// 用于测试、离线演示与路演兜底：模型不可用时星图仍能生成。
type FileExtractor struct {
	Path string

	once  sync.Once
	byURL map[string][]string
	err   error
}

func (f *FileExtractor) load() {
	f.once.Do(func() {
		b, err := os.ReadFile(f.Path)
		if err != nil {
			f.err = fmt.Errorf("读取概念标注失败: %w", err)
			return
		}
		if err := json.Unmarshal(b, &f.byURL); err != nil {
			f.err = fmt.Errorf("解析概念标注失败: %w", err)
		}
	})
}

func (f *FileExtractor) Extract(_ context.Context, items []zhihu.Item) ([][]string, error) {
	f.load()
	if f.err != nil {
		return nil, f.err
	}
	out := make([][]string, len(items))
	for i, it := range items {
		if IsSensitiveItem(it.Title, it.Summary) {
			continue
		}
		out[i] = FilterConcepts(f.byURL[it.URL])
	}
	return out, nil
}

func (f *FileExtractor) NameCluster(_ context.Context, members, _ []string) (string, error) {
	if len(members) == 0 {
		return "", fmt.Errorf("空星群")
	}
	return members[0], nil
}

func pick(items []zhihu.Item, idx []int) []zhihu.Item {
	out := make([]zhihu.Item, len(idx))
	for i, k := range idx {
		out[i] = items[k]
	}
	return out
}

func countAnnotated(rs [][]string) int {
	n := 0
	for _, r := range rs {
		if len(r) > 0 {
			n++
		}
	}
	return n
}
