package engine

import (
	"math"
	"math/rand/v2"
	"sort"
)

// 两级 3D 布局。
//
// 为什么不用降维出坐标：UMAP / t-SNE 的簇间距离没有意义 —— 实测非相邻簇
// 的降维距离与真实高维距离 Spearman 相关仅约 0.3。星图的全部说服力
// 建立在「位置有含义」之上，若用降维，评委问「为什么这两个星群离得远」，
// 诚实的答案是「没有原因」。
//
// 力导向的距离由真实的边算出，因此每一段距离都能回答
// 「它们靠近是因为共享了这 N 个概念」。
//
// 为什么分两级：单层力导向会把所有星群压成一个球，星群之间没有分离。
// 先铺开星群质心（L1），再在星群内部布点（L2）。
const (
	l1Scale = 186.0
	l1Steps = 900
	l2Steps = 220
)

type layout struct {
	starPos    [][3]float64
	clusterPos map[int][3]float64
}

func computeLayout(b *bipartite, comm []int, valid []bool, weights map[pair]float64,
	clusterOf map[int][]int, degConc []int, rng *rand.Rand) layout {

	maxW := 0.0
	for _, w := range weights {
		if w > maxW {
			maxW = w
		}
	}
	if maxW == 0 {
		maxW = 1
	}

	// ── L1：星群质心力导向 ──
	gids := make([]int, 0, len(clusterOf))
	for g := range clusterOf {
		gids = append(gids, g)
	}
	sort.Ints(gids)

	cw := map[pair]float64{}
	for _, p := range sortedPairKeys(weights) {
		w := weights[p]
		if !valid[p.a] || !valid[p.b] {
			continue
		}
		ga, gb := comm[p.a], comm[p.b]
		if ga != gb {
			cw[mkPair(ga, gb)] += w / maxW
		}
	}

	gpos := map[int][3]float64{}
	for _, g := range gids {
		gpos[g] = [3]float64{rng.NormFloat64() * 40, rng.NormFloat64() * 40, rng.NormFloat64() * 40}
	}
	cwKeys := sortedPairKeys(cw)
	const kg = 46.0
	for step := 0; step < l1Steps; step++ {
		temp := kg*(1-float64(step)/l1Steps)*0.3 + 0.5
		disp := map[int][3]float64{}
		for i, a := range gids {
			for _, bb := range gids[i+1:] {
				d, r := delta(gpos[a], gpos[bb])
				f := kg * kg / (r * r) * 2.7 // 斥力：加大以拉开星群
				addScaled(disp, a, d, f/r)
				addScaled(disp, bb, d, -f/r)
			}
		}
		for _, p := range cwKeys {
			w := cw[p]
			d, r := delta(gpos[p.a], gpos[p.b])
			f := r * r / kg * (0.16 + 1.5*w)
			addScaled(disp, p.a, d, -f/r)
			addScaled(disp, p.b, d, f/r)
		}
		for _, g := range gids {
			v := disp[g]
			p := gpos[g]
			for k := 0; k < 3; k++ {
				v[k] -= p[k] * 0.016 // 向心，避免飞散
			}
			m := norm(v)
			if m == 0 {
				continue
			}
			s := math.Min(m, temp) / m
			gpos[g] = [3]float64{p[0] + v[0]*s, p[1] + v[1]*s, p[2] + v[2]*s}
		}
	}
	maxR := 0.0
	for _, p := range gpos {
		if r := norm(p); r > maxR {
			maxR = r
		}
	}
	if maxR > 0 {
		s := l1Scale / maxR
		for g, p := range gpos {
			gpos[g] = [3]float64{p[0] * s, p[1] * s, p[2] * s}
		}
	}

	// ── L2：星群内部布点 ──
	pos := make([][3]float64, len(b.names))
	for _, g := range gids {
		mem := append([]int(nil), clusterOf[g]...)
		sort.Slice(mem, func(i, j int) bool { return degConc[mem[i]] > degConc[mem[j]] })
		weight := 0
		for _, c := range mem {
			weight += degConc[c]
		}
		// 半径放大到公转在屏幕上可见的量级
		R := 11.5 + 5.4*math.Sqrt(float64(len(mem))) + 0.09*math.Sqrt(float64(weight))

		loc := make([][3]float64, len(mem))
		for i := range mem { // 斐波那契球面初值
			a := float64(i) * 2.39996
			y := 1 - (float64(i)+0.5)/float64(len(mem))*2
			rr := math.Sqrt(math.Max(0, 1-y*y))
			loc[i] = [3]float64{math.Cos(a) * rr * R, y * R * 0.78, math.Sin(a) * rr * R}
		}
		for step := 0; step < l2Steps; step++ {
			d2 := make([][3]float64, len(mem))
			for i := range mem {
				for j := i + 1; j < len(mem); j++ {
					dv, r := delta(loc[i], loc[j])
					w := weights[mkPair(mem[i], mem[j])] / maxW
					f := (R*R*0.16)/(r*r) - r*0.05*(0.25+2.4*w)
					for k := 0; k < 3; k++ {
						d2[i][k] += dv[k] / r * f
						d2[j][k] -= dv[k] / r * f
					}
				}
			}
			for i := range mem {
				pull := 0.026
				if i == 0 {
					pull = 0.10 // 中心概念更靠核心
				}
				for k := 0; k < 3; k++ {
					d2[i][k] -= loc[i][k] * pull
				}
				m := norm(d2[i])
				if m == 0 {
					continue
				}
				s := math.Min(m, R*0.09) / m
				for k := 0; k < 3; k++ {
					loc[i][k] += d2[i][k] * s
				}
			}
		}
		gp := gpos[g]
		for i, c := range mem {
			pos[c] = [3]float64{gp[0] + loc[i][0], gp[1] + loc[i][1], gp[2] + loc[i][2]}
		}
	}

	// 质心归零，避免整张图偏离视野中心
	var cx [3]float64
	n := 0
	for c := range b.names {
		if valid[c] {
			for k := 0; k < 3; k++ {
				cx[k] += pos[c][k]
			}
			n++
		}
	}
	if n > 0 {
		for k := 0; k < 3; k++ {
			cx[k] /= float64(n)
		}
		for c := range pos {
			for k := 0; k < 3; k++ {
				pos[c][k] = round2(pos[c][k] - cx[k])
			}
		}
		for g, p := range gpos {
			gpos[g] = [3]float64{round2(p[0] - cx[0]), round2(p[1] - cx[1]), round2(p[2] - cx[2])}
		}
	}
	return layout{starPos: pos, clusterPos: gpos}
}

func delta(a, b [3]float64) ([3]float64, float64) {
	d := [3]float64{a[0] - b[0], a[1] - b[1], a[2] - b[2]}
	r := norm(d)
	if r < 0.01 {
		r = 0.01
	}
	return d, r
}

func norm(v [3]float64) float64 { return math.Sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) }

func addScaled(m map[int][3]float64, k int, d [3]float64, s float64) {
	v := m[k]
	m[k] = [3]float64{v[0] + d[0]*s, v[1] + d[1]*s, v[2] + d[2]*s}
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
