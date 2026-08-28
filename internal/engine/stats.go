package engine

import (
	"math"
	"math/rand/v2"
	"sort"
	"time"
)

// nullModel 是保持度分布的随机重排零模型（管线 ⑧）。
//
// 采用二部图双边交换：随机取两条边 (k1,c1) (k2,c2)，换成 (k1,c2) (k2,c1)。
// 该操作同时保持每条内容的概念数与每个概念的出现次数不变，
// 因此重排后的网络与真实网络在「规模」上完全可比，差异只来自结构。
type nullModel struct {
	sets  []map[int]bool
	edges [][2]int
	rng   *rand.Rand
}

func newNullModel(b *bipartite, rng *rand.Rand) *nullModel {
	nm := &nullModel{rng: rng}
	nm.sets = make([]map[int]bool, len(b.sets))
	for k, s := range b.sets {
		m := make(map[int]bool, len(s))
		for _, c := range s {
			m[c] = true
			nm.edges = append(nm.edges, [2]int{k, c})
		}
		nm.sets[k] = m
	}
	return nm
}

// swap 尝试完成 n 次有效交换。
func (nm *nullModel) swap(n int) {
	E := len(nm.edges)
	if E < 2 {
		return
	}
	done, guard := 0, 0
	for done < n && guard < n*40+1000 {
		guard++
		i, j := nm.rng.IntN(E), nm.rng.IntN(E)
		k1, c1 := nm.edges[i][0], nm.edges[i][1]
		k2, c2 := nm.edges[j][0], nm.edges[j][1]
		if k1 == k2 || c1 == c2 {
			continue
		}
		if nm.sets[k1][c2] || nm.sets[k2][c1] {
			continue // 交换会产生重边，跳过
		}
		delete(nm.sets[k1], c1)
		nm.sets[k1][c2] = true
		delete(nm.sets[k2], c2)
		nm.sets[k2][c1] = true
		nm.edges[i][1] = c2
		nm.edges[j][1] = c1
		done++
	}
}

// clusterPairCounts 统计当前（可能已重排的）网络中，各星群对被同一条内容跨越的次数。
func (nm *nullModel) clusterPairCounts(comm []int, valid []bool) map[pair]int {
	out := map[pair]int{}
	seen := map[int]bool{}
	var gs []int
	for _, s := range nm.sets {
		gs = gs[:0]
		clear(seen)
		for c := range s {
			if !valid[c] {
				continue
			}
			g := comm[c]
			if !seen[g] {
				seen[g] = true
				gs = append(gs, g)
			}
		}
		sort.Ints(gs)
		for i := 0; i < len(gs); i++ {
			for j := i + 1; j < len(gs); j++ {
				out[pair{gs[i], gs[j]}]++
			}
		}
	}
	return out
}

// zStat 是一对星群的检验结果。
type zStat struct {
	Expected float64
	SD       float64
	Z        float64
	Valid    bool
}

// runNullModel 跑 shuffles 次重排，返回各星群对的期望与标准差。
//
// 先做 5·|E| 次交换充分混合（burn-in），此后每 |E| 次交换取一个样本。
func runNullModel(b *bipartite, comm []int, valid []bool, shuffles int, rng *rand.Rand) map[pair]zStat {
	nm := newNullModel(b, rng)
	E := len(nm.edges)
	nm.swap(5 * E)

	sum := map[pair]float64{}
	sumSq := map[pair]float64{}
	for i := 0; i < shuffles; i++ {
		nm.swap(E)
		for p, v := range nm.clusterPairCounts(comm, valid) {
			f := float64(v)
			sum[p] += f
			sumSq[p] += f * f
		}
	}
	n := float64(shuffles)
	out := make(map[pair]zStat, len(sum))
	for p, s := range sum {
		mu := s / n
		varr := sumSq[p]/n - mu*mu
		if varr < 0 {
			varr = 0
		}
		sd := math.Sqrt(varr)
		out[p] = zStat{Expected: mu, SD: sd, Valid: sd > 1e-9}
	}
	return out
}

// temporal 是一个概念的时间刻画（管线 ⑦）。
type temporal struct {
	N       int
	Own     int
	Fav     int
	Persist float64 // 有内容的自然月数 / 跨度自然月数 → 恒星亮度
	Burst   float64 // 最密集 30 天窗口内的占比 → 星云判据
	First   string
	Last    string
	SpanM   int
}

// computeTemporal 计算持续性、集中度与消化度。
//
// 持续性的分母必须是自然月跨度（含首尾），不能用 round(秒差/30天) ——
// 后者会在内容跨两个自然月但间隔不足一个月时算出大于 1 的持续性。
func computeTemporal(times []int64, own, fav int) temporal {
	t := temporal{Own: own, Fav: fav, N: len(times)}
	if len(times) == 0 {
		return t
	}
	sorted := append([]int64(nil), times...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	lo, hi := sorted[0], sorted[len(sorted)-1]
	d0, d1 := time.Unix(lo, 0), time.Unix(hi, 0)

	months := map[string]bool{}
	for _, ts := range sorted {
		months[time.Unix(ts, 0).Format("2006-01")] = true
	}
	span := (d1.Year()-d0.Year())*12 + int(d1.Month()) - int(d0.Month()) + 1
	if span < 1 {
		span = 1
	}
	t.SpanM = span
	t.Persist = round3(float64(len(months)) / float64(span))
	if t.Persist > 1 {
		t.Persist = 1
	}

	// 最密集的 30 天滑窗
	best, j := 0, 0
	for i := range sorted {
		for j < len(sorted) && sorted[j] < sorted[i]+30*86400 {
			j++
		}
		if j-i > best {
			best = j - i
		}
	}
	t.Burst = round3(float64(best) / float64(len(sorted)))
	t.First = d0.Format("2006.01")
	t.Last = d1.Format("2006.01")
	return t
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

// spectrum 把「创作占比」映射为恒星色温。
//
// 只收藏 → 琥珀(32°)，只创作 → 蓝白(218°)，中间穿过白色。
// 关键：不在两个色相之间线性插值 —— 那会经过绿色，星空里没有绿星。
// 真实恒星靠去饱和穿白，这里照做。
func spectrum(ratio float64) (hue, sat int) {
	if ratio < 0.5 {
		return 32, int(math.Round((0.5 - ratio) * 2 * 68))
	}
	return 218, int(math.Round((ratio - 0.5) * 2 * 62))
}

// percentile 返回升序排列后位于 p（0~1）处的值。
func percentile(xs []float64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	i := int(float64(len(s)) * p)
	if i >= len(s) {
		i = len(s) - 1
	}
	if i < 0 {
		i = 0
	}
	return s[i]
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	m := len(s) / 2
	if len(s)%2 == 1 {
		return s[m]
	}
	return (s[m-1] + s[m]) / 2
}
