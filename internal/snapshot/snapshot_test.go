package snapshot

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/engine"
)

func sample() *engine.Universe {
	ev := []engine.Evidence{{Title: "一条真实标题", URL: "https://www.zhihu.com/answer/1", Own: 1, When: "26.08"}}
	return &engine.Universe{
		Meta:     engine.Meta{Items: 1, Clusters: 1},
		Clusters: []engine.Cluster{{ID: 0, Name: "把底层讲明白"}},
		Stars:    []engine.Star{{ID: "star:v1:private:sample", Scope: engine.ScopePrivate, Concept: "并发", Evidence: ev}},
		Dark:     []engine.Dark{{Concept: "网文写作", Fav: 11, Evidence: ev}},
		Solo:     []engine.Solo{{Concept: "分布式系统", Title: "为什么你总是抓不到狼", URL: "https://zhuanlan.zhihu.com/p/2"}},
		Wormholes: []engine.Wormhole{{NameA: "A", NameB: "B",
			Evidence: []engine.WormholeEvidence{{Title: "标题", URL: "https://www.zhihu.com/answer/3"}}}},
	}
}

func TestLoadRejectsPrivateStarWithExternalQueryCapability(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	snap := Snapshot{
		ID: "unsafe", CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour),
		Universe: engine.Universe{Stars: []engine.Star{{
			ID: "star:v1:private:unsafe", Scope: engine.ScopePrivate, ExternalQueryAllowed: true,
		}}},
	}
	if _, err := store.Save(&snap.Universe); err == nil {
		t.Fatal("private star with external query capability must be rejected before persistence")
	}
	encoded, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.path(snap.ID), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(snap.ID); err == nil {
		t.Fatal("serialized private star with external query capability must be rejected")
	}
}

// TestSnapshotStripsAllProse 是产品承诺的自动化版本：
// 「我们不存你的收藏，只存算出来的结构」。
func TestSnapshotStripsAllProse(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	snap, err := s.Save(sample())
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Load(snap.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ContainsProse(&got.Universe) {
		t.Fatal("快照里残留了原文标题 —— 违反「不存原文」的产品承诺")
	}
	// 结构与公开链接必须保留，否则分享页重建不出星图
	if len(got.Universe.Clusters) != 1 || got.Universe.Clusters[0].Name != "把底层讲明白" {
		t.Fatal("星群结构丢失")
	}
	if got.Universe.Stars[0].Evidence[0].URL == "" {
		t.Fatal("公开链接被误删，访问者就点不回原文了")
	}
	if got.Universe.Dark[0].Fav != 11 {
		t.Fatal("暗物质计数丢失")
	}
}

// TestSaveDoesNotMutateCaller 锁住一个曾经真实发生的 bug。
//
// strip 按值收 engine.Universe，但里面全是切片 —— 复制的只是切片头，
// 底层数组仍与调用方共用。旧实现就地清标题，于是用户只要生成过一次
// 分享卡，自己星图上的原文标题就全没了：面板里「构成它的内容」
// 变成一列空行，行星卡也没东西可显示。
func TestSaveDoesNotMutateCaller(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	live := sample()
	if _, err := s.Save(live); err != nil {
		t.Fatal(err)
	}

	if got := live.Stars[0].Evidence[0].Title; got != "一条真实标题" {
		t.Fatalf("恒星证据的标题被就地清空了: %q", got)
	}
	if got := live.Dark[0].Evidence[0].Title; got != "一条真实标题" {
		t.Fatalf("暗物质证据的标题被就地清空了: %q", got)
	}
	if got := live.Wormholes[0].Evidence[0].Title; got != "标题" {
		t.Fatalf("虫洞证据的标题被就地清空了: %q", got)
	}
	if got := live.Solo[0].Title; got != "为什么你总是抓不到狼" {
		t.Fatalf("边缘微光的标题被就地清空了: %q", got)
	}
	// 连存两次也不能出问题：第二次拿到的必须还是完整数据
	if _, err := s.Save(live); err != nil {
		t.Fatal(err)
	}
	if ContainsProse(live) != true {
		t.Fatal("第二次保存后调用方的数据被清空了")
	}
}

func TestSnapshotRejectsPathTraversal(t *testing.T) {
	s, _ := NewStore(t.TempDir())
	for _, bad := range []string{"../etc/passwd", "a/b", "", "..", "x.json"} {
		if _, err := s.Load(bad); err == nil {
			t.Fatalf("非法编号 %q 应被拒绝", bad)
		}
	}
}

func TestDeleteIsImmediate(t *testing.T) {
	s, _ := NewStore(t.TempDir())
	snap, err := s.Save(sample())
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(snap.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Load(snap.ID); err == nil {
		t.Fatal("删除后仍能读到 —— 「立即删除我的宇宙」必须即时生效")
	}
}
