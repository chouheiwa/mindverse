package engine

import (
	"fmt"
	"math/rand/v2"
	"sort"
	"time"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// Namer 给一个星群命名（管线 ⑨）。
//
// 默认实现取词频最高的成员概念，但实测证明这不够：
// 有个星群装着「图形学 / 渲染管线 / 信息不对称 / 游戏」，argmax 命名为
// 「图形学」，而它实际是「游戏与博弈」—— 狼人杀就在里面。
// 正式运行时应注入 LLM 命名器。
type Namer func(members []string, samples []string) string

func defaultNamer(members []string, _ []string) string {
	if len(members) == 0 {
		return "未命名"
	}
	return members[0]
}

// Run 执行管线 ③~⑨，产出可直接交给前端的星图。
// 熄灭判据的四个常量。
//
// darkQuantile 取用户自身最后活跃月份的分位；darkMinGap 是绝对下限，
// 防止「上个月刚停」被叫成熄灭；darkMinN 要求有过一定体量，
// 收藏过一两条谈不上熄灭；darkMax 限制条数 —— 这个模式是拿来读的，
// 而且每颗熄灭的星会点亮它所在星群的轨道环，超过五个环画面就糊了。
const (
	darkQuantile = 0.10
	darkMinGap   = 3
	darkMinN     = 4
	darkMax      = 5
)

func Run(in Input, opt Options, name Namer) (*Universe, error) {
	opt = opt.withDefaults()
	if name == nil {
		name = defaultNamer
	}
	if len(in.Items) != len(in.Concepts) {
		return nil, fmt.Errorf("语料与概念标注长度不一致: %d vs %d", len(in.Items), len(in.Concepts))
	}
	if len(in.Items) == 0 {
		return nil, fmt.Errorf("语料为空")
	}
	concepts := canonicalizeConceptAnnotations(in.Concepts)

	rng := rand.New(rand.NewPCG(opt.Seed, opt.Seed^0x9E3779B97F4A7C15))

	// ③④ 二部图
	b := buildBipartite(concepts, opt.MinSupport)
	if len(b.names) == 0 {
		return nil, fmt.Errorf("没有任何概念达到支持度阈值 %d，语料太少", opt.MinSupport)
	}
	// ⑤ 资源分配投影
	weights := b.project()
	// ⑥ 社区发现 + 连通性修复
	comm, splits := splitDisconnected(louvain(len(b.names), weights, rng, 12), weights)

	clusterOf := map[int][]int{}
	for c, g := range comm {
		clusterOf[g] = append(clusterOf[g], c)
	}
	for g, mem := range clusterOf {
		if len(mem) < opt.MinCluster {
			delete(clusterOf, g)
		}
	}
	if len(clusterOf) == 0 {
		return nil, fmt.Errorf("没有形成任何星群，语料太少")
	}
	valid := make([]bool, len(b.names))
	for _, mem := range clusterOf {
		for _, c := range mem {
			valid[c] = true
		}
	}

	lay := computeLayout(b, comm, valid, weights, clusterOf, b.degConc, rng)

	// 概念 → 条目索引
	itemsOf := make([][]int, len(b.names))
	for k, s := range b.sets {
		for _, c := range s {
			itemsOf[c] = append(itemsOf[c], k)
		}
	}

	// ⑦ 时间刻画
	temp := make([]temporal, len(b.names))
	for c := range b.names {
		if !valid[c] {
			continue
		}
		var ts []int64
		own, fav := 0, 0
		for _, k := range itemsOf[c] {
			it := in.Items[k]
			if t := it.EffectiveTime(); t > 0 {
				ts = append(ts, t)
			}
			if it.IsCreated() {
				own++
			} else if it.IsCollected() {
				fav++
			}
		}
		temp[c] = computeTemporal(ts, own, fav)
	}

	u := &Universe{SchemaVersion: CurrentSchemaVersion, AnalysisVersion: CurrentAnalysisVersion}

	// 色温主轴：活跃月数（真正有内容的自然月数）的位次。
	//
	// 曾经用的是「创作占比」own/(own+fav)。那条轴假设用户是创作者 ——
	// 而绝大多数知乎用户只收藏。纯消费者的比值恒为 0，spectrum 会把每一颗星
	// 都涂成同一个最饱和的琥珀色（2026-08-28 实测：83 颗星 1 种颜色）。
	// 活跃月数对任何人都有方差，且完全不依赖 own。
	act := make(map[int]float64, len(b.names))
	for c := range b.names {
		if valid[c] {
			act[c] = float64(temp[c].Active)
		}
	}
	starRank := rankOf(act)

	// 恒星
	for c, cn := range b.names {
		if !valid[c] {
			continue
		}
		t := temp[c]
		hue, sat := spectrum(starRank[c])
		u.Stars = append(u.Stars, Star{
			Scope:   ScopePrivate,
			Concept: cn, Cluster: comm[c], Pos: lay.starPos[c],
			N: b.degConc[c], Own: t.Own, Fav: t.Fav, Hue: hue, Sat: sat,
			Persist: t.Persist, Burst: t.Burst, First: t.First, Last: t.Last,
			Evidence: evidenceFor(in.Items, itemsOf[c], 6),
		})
	}
	sort.Slice(u.Stars, func(i, j int) bool { return u.Stars[i].Concept < u.Stars[j].Concept })
	if err := assignStableStarIDs(u.Stars, StableStarID); err != nil {
		return nil, err
	}
	if err := u.Validate(); err != nil {
		return nil, err
	}
	itemsByStarID := make(map[string][]int, len(u.Stars))
	for _, star := range u.Stars {
		if conceptIndex, ok := b.index[star.Concept]; ok {
			itemsByStarID[star.ID] = append([]int(nil), itemsOf[conceptIndex]...)
		}
	}
	u.Questions, u.Answers, u.Probes = projectKnowledgeObjects(in, u.Stars, itemsByStarID)

	// 星群
	gids := make([]int, 0, len(clusterOf))
	for g := range clusterOf {
		gids = append(gids, g)
	}
	sort.Ints(gids)
	nameOf := map[int]string{}

	// 星群色温同样走位次。先取成员位次的均值，再在星群之间重新取位次 ——
	// 只取均值会向中间回归，十几个星群会全糊成白色。
	cAct := make(map[int]float64, len(gids))
	for _, g := range gids {
		sum := 0.0
		for _, c := range clusterOf[g] {
			sum += starRank[c]
		}
		cAct[g] = sum / float64(len(clusterOf[g]))
	}
	clusterRank := rankOf(cAct)

	for _, g := range gids {
		mem := append([]int(nil), clusterOf[g]...)
		sort.Slice(mem, func(i, j int) bool { return b.degConc[mem[i]] > b.degConc[mem[j]] })
		names := make([]string, len(mem))
		own, fav, total := 0, 0, 0
		var center [3]float64
		for i, c := range mem {
			names[i] = b.names[c]
			own += temp[c].Own
			fav += temp[c].Fav
			total += b.degConc[c]
			for k := 0; k < 3; k++ {
				center[k] += lay.starPos[c][k]
			}
		}
		for k := 0; k < 3; k++ {
			center[k] = round2(center[k] / float64(len(mem)))
		}
		hue, sat := spectrum(clusterRank[g])
		nm := name(names, sampleTitles(in.Items, itemsOf[mem[0]], 3))
		nameOf[g] = nm
		u.Clusters = append(u.Clusters, Cluster{
			ID: g, Name: nm, Lead: names[0], Center: center, N: total,
			Own: own, Fav: fav, Hue: hue, Sat: sat, Members: names,
		})
	}

	// 粒子：每条内容落在其主概念附近
	for k, s := range b.sets {
		best, bestN := -1, -1
		for _, c := range s {
			if valid[c] && b.degConc[c] > bestN {
				best, bestN = c, b.degConc[c]
			}
		}
		if best < 0 {
			continue
		}
		p := lay.starPos[best]
		own := 0.0
		if in.Items[k].IsCreated() {
			own = 1
		}
		u.Particles = append(u.Particles, [5]float64{
			round1(p[0] + rng.NormFloat64()*4.5),
			round1(p[1] + rng.NormFloat64()*4.5),
			round1(p[2] + rng.NormFloat64()*4.5),
			float64(comm[best]), own,
		})
	}

	// ⑧ 虫洞
	cross := map[pair][]int{}
	seen := map[int]bool{}
	var gs []int
	for k, s := range b.sets {
		gs = gs[:0]
		clear(seen)
		for _, c := range s {
			if !valid[c] {
				continue
			}
			if g := comm[c]; !seen[g] {
				seen[g] = true
				gs = append(gs, g)
			}
		}
		sort.Ints(gs)
		for i := 0; i < len(gs); i++ {
			for j := i + 1; j < len(gs); j++ {
				p := pair{gs[i], gs[j]}
				cross[p] = append(cross[p], k)
			}
		}
	}
	stats := runNullModel(b, comm, valid, opt.Shuffles, rng)
	var allZ []float64
	for _, p := range sortedPairKeys(cross) {
		ks := cross[p]
		st, ok := stats[p]
		if !ok || !st.Valid {
			continue
		}
		z := (float64(len(ks)) - st.Expected) / st.SD
		allZ = append(allZ, z)
		// 合取判据：显著分离 且 跨越稀少。
		// 只看 z 会被星群规模主导；只看跨越次数则丢掉统计意义。
		if z >= opt.WormholeZ || len(ks) > opt.WormholeMaxCross {
			continue
		}
		w := Wormhole{
			A: p.a, B: p.b, NameA: nameOf[p.a], NameB: nameOf[p.b],
			Observed: len(ks), Expected: round1(st.Expected), Z: round2(z),
		}
		for _, k := range ks {
			if len(w.Evidence) >= 3 {
				break
			}
			w.Evidence = append(w.Evidence, WormholeEvidence{
				Title: trimRunes(in.Items[k].Title, 56), URL: in.Items[k].URL,
				SideA: joinSide(b, concepts[k], comm, p.a),
				SideB: joinSide(b, concepts[k], comm, p.b),
			})
		}
		u.Wormholes = append(u.Wormholes, w)
	}
	sort.Slice(u.Wormholes, func(i, j int) bool {
		if u.Wormholes[i].Z != u.Wormholes[j].Z {
			return u.Wormholes[i].Z < u.Wormholes[j].Z
		}
		if u.Wormholes[i].A != u.Wormholes[j].A {
			return u.Wormholes[i].A < u.Wormholes[j].A
		}
		return u.Wormholes[i].B < u.Wormholes[j].B
	})
	if len(u.Wormholes) > 6 {
		u.Wormholes = u.Wormholes[:6]
	}

	// 孤例通道：支持度不足、但挂在成形星群上的稀有概念。
	// 支持度阈值只用于星群成形，桥接检测必须放开 —— 否则会杀掉最好的虫洞。
	rawFreq := map[string]int{}
	for _, cs := range concepts {
		s := map[string]bool{}
		for _, c := range cs {
			if !s[c] {
				s[c] = true
				rawFreq[c]++
			}
		}
	}
	soloNames := make([]string, 0, len(rawFreq))
	for c, n := range rawFreq {
		if n > 2 {
			continue
		}
		if id, ok := b.index[c]; ok && valid[id] {
			continue // 已经成星了，不算孤例
		}
		soloNames = append(soloNames, c)
	}
	sort.Strings(soloNames)
	for _, cn := range soloNames {
		for k, cs := range concepts {
			if !contains(cs, cn) {
				continue
			}
			var hostClusters []string
			var hostPos [3]float64
			bestN := -1
			for _, other := range cs {
				id, ok := b.index[other]
				if !ok || !valid[id] {
					continue
				}
				hostClusters = appendUniqStr(hostClusters, nameOf[comm[id]])
				if b.degConc[id] > bestN {
					bestN, hostPos = b.degConc[id], lay.starPos[id]
				}
			}
			if len(hostClusters) == 0 {
				continue
			}
			sort.Strings(hostClusters)
			u.Solo = append(u.Solo, Solo{
				Concept: cn, N: rawFreq[cn], Title: trimRunes(in.Items[k].Title, 56),
				URL: in.Items[k].URL, Clusters: hostClusters, Pos: hostPos,
			})
			break
		}
	}
	sort.Slice(u.Solo, func(i, j int) bool {
		if u.Solo[i].N != u.Solo[j].N {
			return u.Solo[i].N < u.Solo[j].N
		}
		return u.Solo[i].Concept < u.Solo[j].Concept
	})
	if len(u.Solo) > 8 {
		u.Solo = u.Solo[:8]
	}

	// 熄灭的星与星云
	//
	// 「很久没动」只能相对于用户自己：有人每天在收，有人半年一次。
	// 阈值取该用户自身最后活跃月份的 p10，另加一个绝对下限 darkMinGap ——
	// 上个月刚停的不能叫熄灭。2026-08-28 实测：写死 12 个月的绝对阈值
	// 在样本上只剩 1 颗，写死 0 个月则是全部 83 颗，两头都不成立。
	lastMs := make([]float64, 0, len(b.names))
	newest := 0
	for c := range b.names {
		if valid[c] && b.degConc[c] >= darkMinN {
			lastMs = append(lastMs, float64(temp[c].LastM))
			if temp[c].LastM > newest {
				newest = temp[c].LastM
			}
		}
	}
	darkCut := int(percentile(lastMs, darkQuantile))

	for c, cn := range b.names {
		if !valid[c] {
			continue
		}
		t := temp[c]
		if gap := newest - t.LastM; b.degConc[c] >= darkMinN && t.LastM <= darkCut && gap >= darkMinGap {
			u.Dark = append(u.Dark, Dark{
				Concept: cn, N: b.degConc[c], Fav: t.Fav, Own: t.Own, Gap: gap,
				First: t.First, Last: t.Last,
				Evidence: evidenceFor(in.Items, itemsOf[c], 4),
			})
		}
		if t.Burst > 0.6 && b.degConc[c] >= 5 {
			u.Nebula = append(u.Nebula, Nebula{
				Concept: cn, N: b.degConc[c], Burst: t.Burst, First: t.First, Last: t.Last,
			})
		}
	}
	sort.Slice(u.Dark, func(i, j int) bool {
		if u.Dark[i].Gap != u.Dark[j].Gap {
			return u.Dark[i].Gap > u.Dark[j].Gap
		}
		if u.Dark[i].N != u.Dark[j].N {
			return u.Dark[i].N > u.Dark[j].N
		}
		return u.Dark[i].Concept < u.Dark[j].Concept
	})
	// 这个模式是拿来读的，不是拿来滚的
	if len(u.Dark) > darkMax {
		u.Dark = u.Dark[:darkMax]
	}
	sort.Slice(u.Nebula, func(i, j int) bool {
		if u.Nebula[i].N != u.Nebula[j].N {
			return u.Nebula[i].N > u.Nebula[j].N
		}
		return u.Nebula[i].Concept < u.Nebula[j].Concept
	})

	// Meta
	own, fav := 0, 0
	var lo, hi int64
	for _, it := range in.Items {
		if it.IsCreated() {
			own++
		} else if it.IsCollected() {
			fav++
		}
		if t := it.EffectiveTime(); t > 0 {
			if lo == 0 || t < lo {
				lo = t
			}
			if t > hi {
				hi = t
			}
		}
	}
	u.Meta = Meta{
		Items: len(in.Items), Concepts: len(u.Stars), Clusters: len(u.Clusters),
		Own: own, Fav: fav, Span: [2]int64{lo, hi},
		MedZ: round2(median(allZ)), P10Z: round2(percentile(allZ, 0.1)),
		Splits: splits,
	}
	return u, nil
}

func evidenceFor(items []zhihu.Item, idx []int, n int) []Evidence {
	s := append([]int(nil), idx...)
	sort.Slice(s, func(i, j int) bool { return items[s[i]].EffectiveTime() > items[s[j]].EffectiveTime() })
	if len(s) > n {
		s = s[:n]
	}
	out := make([]Evidence, 0, len(s))
	for _, k := range s {
		it := items[k]
		e := Evidence{Title: trimRunes(it.Title, 52), URL: it.URL}
		if it.IsCreated() {
			e.Own = 1
		}
		if t := it.EffectiveTime(); t > 0 {
			e.When = time.Unix(t, 0).Format("06.01")
		}
		out = append(out, e)
	}
	return out
}

func sampleTitles(items []zhihu.Item, idx []int, n int) []string {
	var out []string
	for _, k := range idx {
		if len(out) >= n {
			break
		}
		out = append(out, items[k].Title)
	}
	return out
}

func joinSide(b *bipartite, cs []string, comm []int, g int) string {
	var parts []string
	for _, c := range cs {
		if id, ok := b.index[c]; ok && comm[id] == g {
			parts = append(parts, c)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for _, p := range parts[1:] {
		out += "+" + p
	}
	return out
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

func appendUniqStr(xs []string, v string) []string {
	if contains(xs, v) {
		return xs
	}
	return append(xs, v)
}

func trimRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5*sign(v))) / 10
}

func sign(v float64) float64 {
	if v < 0 {
		return -1
	}
	return 1
}
