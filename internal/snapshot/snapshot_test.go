package snapshot

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/engine"
)

func sample() *engine.Universe {
	ev := []engine.Evidence{{Title: "一条真实标题", URL: "https://www.zhihu.com/answer/1", Own: 1, When: "26.08"}}
	starID, _ := engine.StableStarID(engine.ScopePrivate, "并发")
	return &engine.Universe{
		SchemaVersion: engine.CurrentSchemaVersion, AnalysisVersion: engine.CurrentAnalysisVersion,
		Meta:     engine.Meta{Items: 1, Clusters: 1},
		Clusters: []engine.Cluster{{ID: 0, Name: "把底层讲明白"}},
		Stars:    []engine.Star{{ID: starID, Scope: engine.ScopePrivate, Concept: "并发", QuestionIDs: []string{"question:7"}, ProbeIDs: []string{"article:21"}, Evidence: ev}},
		Dark:     []engine.Dark{{Concept: "网文写作", Fav: 11, Evidence: ev}},
		Solo:     []engine.Solo{{Concept: "分布式系统", Title: "为什么你总是抓不到狼", URL: "https://zhuanlan.zhihu.com/p/2"}},
		Wormholes: []engine.Wormhole{{NameA: "A", NameB: "B",
			Evidence: []engine.WormholeEvidence{{Title: "标题", URL: "https://www.zhihu.com/answer/3"}}}},
		Questions: []engine.QuestionPlanet{{ID: "question:7", QuestionID: "7", Title: "公开问题", URL: "https://www.zhihu.com/question/7", AnswerIDs: []string{"answer:8"}}},
		Answers:   []engine.AnswerSatellite{{ID: "answer:8", QuestionID: "question:7", Title: "公开回答", Summary: "摘要", URL: "https://www.zhihu.com/question/7/answer/8", ObservedAt: 10}},
		Probes:    []engine.ArticleProbe{{ID: "article:21", Title: "公开文章", Summary: "文章摘要", URL: "https://zhuanlan.zhihu.com/p/21", ObservedAt: 11}},
	}
}

func TestNewSnapshotCarriesVersions(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	snap, err := s.Save(sample())
	if err != nil {
		t.Fatal(err)
	}
	if snap.Legacy || snap.Universe.SchemaVersion == "" || snap.Universe.AnalysisVersion == "" {
		t.Fatalf("new snapshot was not versioned: %+v", snap)
	}
}

func TestLegacySnapshotRemainsReadableWithoutUpgradingEvidence(t *testing.T) {
	for _, tc := range []struct {
		name     string
		schema   string
		analysis string
	}{{name: "both missing"}} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			universe := map[string]any{
				"stars":     []any{map[string]any{"c": "legacy", "questionIds": []string{"question:7"}, "probeIds": []string{"article:9"}, "ev": []any{map[string]any{"t": "old", "u": "https://www.zhihu.com/question/7"}}}},
				"questions": []any{map[string]any{"id": "question:7"}},
				"answers":   []any{map[string]any{"id": "answer:8"}},
				"probes":    []any{map[string]any{"id": "article:9"}},
			}
			if tc.schema != "" {
				universe["schemaVersion"] = tc.schema
			}
			if tc.analysis != "" {
				universe["analysisVersion"] = tc.analysis
			}
			legacy := map[string]any{
				"id": "legacy_1", "createdAt": "2026-08-01T00:00:00Z", "expiresAt": "2099-08-01T00:00:00Z",
				"universe": universe,
			}
			b, _ := json.Marshal(legacy)
			if err := os.WriteFile(filepath.Join(dir, "legacy_1.json"), b, 0o600); err != nil {
				t.Fatal(err)
			}
			s, _ := NewStore(dir)
			got, err := s.Load("legacy_1")
			if err != nil {
				t.Fatal(err)
			}
			if !got.Legacy {
				t.Fatal("snapshot missing either version must be explicitly marked legacy")
			}
			if len(got.Universe.Questions) != 0 || len(got.Universe.Answers) != 0 || len(got.Universe.Probes) != 0 {
				t.Fatalf("legacy evidence or new fields were auto-upgraded: %+v", got.Universe)
			}
			if len(got.Universe.Stars[0].QuestionIDs) != 0 || len(got.Universe.Stars[0].ProbeIDs) != 0 {
				t.Fatalf("legacy star retained new public references: %+v", got.Universe.Stars[0])
			}
		})
	}
}

func TestSnapshotWithExactlyOneMissingVersionIsCorrupt(t *testing.T) {
	for _, tc := range []struct {
		name     string
		schema   string
		analysis string
	}{
		{name: "schema missing", analysis: engine.CurrentAnalysisVersion},
		{name: "analysis missing", schema: engine.CurrentSchemaVersion},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			u := sample()
			u.SchemaVersion, u.AnalysisVersion = tc.schema, tc.analysis
			snap := Snapshot{ID: "partial", CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour), Universe: *u}
			b, _ := json.Marshal(snap)
			if err := os.WriteFile(filepath.Join(dir, "partial.json"), b, 0o600); err != nil {
				t.Fatal(err)
			}
			s, _ := NewStore(dir)
			if _, err := s.Load("partial"); err == nil {
				t.Fatal("exactly one missing version must be corruption")
			}
		})
	}
}

func TestSaveRequiresExplicitCurrentVersions(t *testing.T) {
	s, _ := NewStore(t.TempDir())
	u := sample()
	u.SchemaVersion, u.AnalysisVersion = "", ""
	if _, err := s.Save(u); err == nil {
		t.Fatal("Save must not stamp missing versions as current")
	}
}

func TestNewSchemaInvalidUniverseIsRejected(t *testing.T) {
	dir := t.TempDir()
	bad := sample()
	bad.Stars[0].Scope = ""
	snap := Snapshot{ID: "invalid_1", CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour), Universe: *bad}
	b, _ := json.Marshal(snap)
	if err := os.WriteFile(filepath.Join(dir, "invalid_1.json"), b, 0o600); err != nil {
		t.Fatal(err)
	}
	s, _ := NewStore(dir)
	if _, err := s.Load("invalid_1"); err == nil || !strings.Contains(err.Error(), "invalid") {
		t.Fatalf("new-schema invalid universe should be rejected, got %v", err)
	}
}

func TestCurrentSnapshotMissingStableStarIDIsRejected(t *testing.T) {
	dir := t.TempDir()
	u := sample()
	u.Stars[0].ID = ""
	snap := Snapshot{ID: "invalid_id", CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour), Universe: *u}
	b, _ := json.Marshal(snap)
	if err := os.WriteFile(filepath.Join(dir, "invalid_id.json"), b, 0o600); err != nil {
		t.Fatal(err)
	}
	s, _ := NewStore(dir)
	if _, err := s.Load("invalid_id"); err == nil || !strings.Contains(err.Error(), "star") {
		t.Fatalf("current snapshot missing stable star ID should be rejected: %v", err)
	}
}

func TestSnapshotRejectsMismatchedEnvelopeID(t *testing.T) {
	dir := t.TempDir()
	snap := Snapshot{ID: "different_id", CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour), Universe: *sample()}
	b, _ := json.Marshal(snap)
	if err := os.WriteFile(filepath.Join(dir, "requested_id.json"), b, 0o600); err != nil {
		t.Fatal(err)
	}
	s, _ := NewStore(dir)
	if _, err := s.Load("requested_id"); err == nil {
		t.Fatal("snapshot with mismatched envelope ID should be rejected as corrupted")
	}
}

func TestSaveRejectsUnsupportedVersion(t *testing.T) {
	s, _ := NewStore(t.TempDir())
	u := sample()
	u.SchemaVersion = "universe.future"
	if _, err := s.Save(u); err == nil {
		t.Fatal("unsupported schema version should not be silently rewritten")
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
	if len(got.Universe.Questions) != 0 || len(got.Universe.Answers) != 0 || len(got.Universe.Probes) != 0 ||
		len(got.Universe.Stars[0].QuestionIDs) != 0 || len(got.Universe.Stars[0].ProbeIDs) != 0 {
		t.Fatalf("旧快照边界保留了新公开实体或引用: %+v", got.Universe)
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
	if len(live.Questions) != 1 || live.Questions[0].Title != "公开问题" || len(live.Answers) != 1 || live.Answers[0].Summary != "摘要" ||
		len(live.Probes) != 1 || live.Probes[0].Summary != "文章摘要" || len(live.Stars[0].QuestionIDs) != 1 || len(live.Stars[0].ProbeIDs) != 1 {
		t.Fatal("保存快照修改了调用方的新实体或引用")
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
