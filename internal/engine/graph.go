package engine

import (
	"math/rand/v2"
	"sort"
)

// pair 是一对概念索引，恒定 a < b。
type pair struct{ a, b int }

func mkPair(a, b int) pair {
	if a > b {
		a, b = b, a
	}
	return pair{a, b}
}

// bipartite 是「内容 ↔ 概念」二部图（管线 ④）。
type bipartite struct {
	names   []string // 概念索引 → 名称
	index   map[string]int
	sets    [][]int // sets[k] 是第 k 条内容的概念索引，升序
	degItem []int   // 每条内容的概念数
	degConc []int   // 每个概念的出现次数
}

// buildBipartite 执行管线 ③（按支持度过滤）与 ④（建二部图）。
//
// 受控词表本身承担了概念归并的职责；有 embedding 服务时，
// 归并应在进入本函数前完成。
func buildBipartite(concepts [][]string, minSupport int) *bipartite {
	freq := map[string]int{}
	for _, cs := range concepts {
		seen := map[string]bool{}
		for _, c := range cs {
			if c == "" || seen[c] {
				continue
			}
			seen[c] = true
			freq[c]++
		}
	}
	kept := make([]string, 0, len(freq))
	for c, n := range freq {
		if n >= minSupport {
			kept = append(kept, c)
		}
	}
	sort.Strings(kept)

	b := &bipartite{index: map[string]int{}, names: kept}
	for i, c := range kept {
		b.index[c] = i
	}
	b.degConc = make([]int, len(kept))
	b.sets = make([][]int, len(concepts))
	for k, cs := range concepts {
		seen := map[int]bool{}
		var s []int
		for _, c := range cs {
			id, ok := b.index[c]
			if !ok || seen[id] {
				continue
			}
			seen[id] = true
			s = append(s, id)
			b.degConc[id]++
		}
		sort.Ints(s)
		b.sets[k] = s
		b.degItem = append(b.degItem, len(s))
	}
	return b
}

// cooccurrence 统计概念对的共现次数。
func (b *bipartite) cooccurrence() map[pair]int {
	co := map[pair]int{}
	for _, s := range b.sets {
		for i := 0; i < len(s); i++ {
			for j := i + 1; j < len(s); j++ {
				co[pair{s[i], s[j]}]++
			}
		}
	}
	return co
}

// project 执行管线 ⑤：一模投影，资源分配加权。
//
// 直接用共现次数会让高频概念与所有东西虚假强相关 ——「生活」「思考」
// 这类泛概念会变成星图正中央的假恒星。此处采用 Zhou et al. 2007
// (Phys. Rev. E 76, 046115) 的资源分配权重抑制枢纽偏置：
//
//	w_ab = Σ_k (a_ak · a_bk) / (d_k · d_a)
//
// 该权重非对称，最终取双向均值。
func (b *bipartite) project() map[pair]float64 {
	w := map[pair]float64{}
	for _, s := range b.sets {
		dk := float64(len(s))
		if dk < 2 {
			continue
		}
		for i := 0; i < len(s); i++ {
			for j := 0; j < len(s); j++ {
				if i == j {
					continue
				}
				a, c := s[i], s[j]
				// w_ac += 1/(d_k · d_a)，随后与 w_ca 取均值 → 对称化
				w[mkPair(a, c)] += 0.5 / (dk * float64(b.degConc[a]))
			}
		}
	}
	return w
}

// louvain 执行管线 ⑥：模块度优化的社区发现。
//
// 返回 概念索引 → 社区号。
func louvain(n int, edges map[pair]float64, rng *rand.Rand, passes int) []int {
	// 邻接表
	adj := make([]map[int]float64, n)
	for i := range adj {
		adj[i] = map[int]float64{}
	}
	for p, w := range edges {
		if p.a == p.b {
			continue
		}
		adj[p.a][p.b] += w
		adj[p.b][p.a] += w
	}

	comm := make([]int, n)
	for i := range comm {
		comm[i] = i
	}
	// 当前层的节点 → 底层节点集合
	members := make([][]int, n)
	for i := range members {
		members[i] = []int{i}
	}

	for pass := 0; pass < passes; pass++ {
		cur := len(adj)
		k := make([]float64, cur)
		var m2 float64
		for i := 0; i < cur; i++ {
			for _, w := range adj[i] {
				k[i] += w
			}
			m2 += k[i]
		}
		if m2 == 0 {
			break
		}
		lab := make([]int, cur)
		for i := range lab {
			lab[i] = i
		}
		tot := make([]float64, cur)
		copy(tot, k)

		order := rng.Perm(cur)
		moved := false
		for _, node := range order {
			cn := lab[node]
			// 必须按固定顺序累加：map 迭代顺序随机，而浮点加法不满足结合律，
			// 末位差异会一路放大到聚类与布局，导致星图不可复现。
			links := map[int]float64{}
			for _, nb := range sortedIntKeys(adj[node]) {
				links[lab[nb]] += adj[node][nb]
			}
			tot[cn] -= k[node]
			best, bestGain := cn, links[cn]-tot[cn]*k[node]/m2
			// 按社区号排序遍历，保证确定性
			cands := make([]int, 0, len(links))
			for c := range links {
				cands = append(cands, c)
			}
			sort.Ints(cands)
			for _, c := range cands {
				if c == cn {
					continue
				}
				g := links[c] - tot[c]*k[node]/m2
				if g > bestGain+1e-12 {
					best, bestGain = c, g
				}
			}
			tot[best] += k[node]
			if best != cn {
				lab[node] = best
				moved = true
			}
		}

		// 归并出本层社区
		remap := map[int]int{}
		var groups [][]int
		for i := 0; i < cur; i++ {
			g, ok := remap[lab[i]]
			if !ok {
				g = len(groups)
				remap[lab[i]] = g
				groups = append(groups, nil)
			}
			groups[g] = append(groups[g], i)
		}
		if !moved || len(groups) == cur {
			break
		}

		// 聚合成新图
		newAdj := make([]map[int]float64, len(groups))
		for i := range newAdj {
			newAdj[i] = map[int]float64{}
		}
		for i := 0; i < cur; i++ {
			gi := remap[lab[i]]
			for _, nb := range sortedIntKeys(adj[i]) {
				newAdj[gi][remap[lab[nb]]] += adj[i][nb]
			}
		}
		newMembers := make([][]int, len(groups))
		for gi, gs := range groups {
			for _, old := range gs {
				newMembers[gi] = append(newMembers[gi], members[old]...)
			}
		}
		adj, members = newAdj, newMembers
	}

	out := make([]int, n)
	for gi, ms := range members {
		for _, leaf := range ms {
			out[leaf] = gi
		}
	}
	return out
}

// splitDisconnected 修复断裂社区（管线 ⑥ 的必要补丁）。
//
// Louvain 会产出连接极差甚至完全断裂的社区，实测最多 25% 连接不良、
// 16% 完全断裂（Traag et al., Sci Rep 2019）。断裂社区意味着我们指着
// 两团其实无关的东西说它们是一个主题 —— 路演会被当场问倒。
// Leiden 从算法上保证连通；退回 Louvain 时必须补这一步。
//
// 返回修正后的社区标号与被拆开的次数。
func splitDisconnected(comm []int, edges map[pair]float64) ([]int, int) {
	n := len(comm)
	adj := make([]map[int]bool, n)
	for i := range adj {
		adj[i] = map[int]bool{}
	}
	for p := range edges {
		adj[p.a][p.b] = true
		adj[p.b][p.a] = true
	}
	byComm := map[int][]int{}
	for i, c := range comm {
		byComm[c] = append(byComm[c], i)
	}
	keys := make([]int, 0, len(byComm))
	for c := range byComm {
		keys = append(keys, c)
	}
	sort.Ints(keys)

	out := make([]int, n)
	next, splits := 0, 0
	for _, c := range keys {
		mem := byComm[c]
		inComm := map[int]bool{}
		for _, x := range mem {
			inComm[x] = true
		}
		seen := map[int]bool{}
		parts := 0
		for _, start := range mem {
			if seen[start] {
				continue
			}
			parts++
			stack := []int{start}
			seen[start] = true
			for len(stack) > 0 {
				x := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				out[x] = next
				for y := range adj[x] {
					if inComm[y] && !seen[y] {
						seen[y] = true
						stack = append(stack, y)
					}
				}
			}
			next++
		}
		if parts > 1 {
			splits += parts - 1
		}
	}
	return out, splits
}

// sortedIntKeys 返回升序的 map 键，用于让浮点累加顺序可复现。
func sortedIntKeys(m map[int]float64) []int {
	ks := make([]int, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Ints(ks)
	return ks
}

// sortedPairKeys 同上，用于概念对。
func sortedPairKeys[V any](m map[pair]V) []pair {
	ks := make([]pair, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Slice(ks, func(i, j int) bool {
		if ks[i].a != ks[j].a {
			return ks[i].a < ks[j].a
		}
		return ks[i].b < ks[j].b
	})
	return ks
}
