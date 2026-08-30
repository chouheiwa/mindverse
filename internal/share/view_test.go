package share

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

func shareUniverse() *engine.Universe {
	return &engine.Universe{
		SchemaVersion: engine.CurrentSchemaVersion, AnalysisVersion: engine.CurrentAnalysisVersion,
		Stars: []engine.Star{{
			ID: "star:v1:private:secret", Scope: engine.ScopePrivate, Concept: "private concept",
			QuestionIDs: []string{"question:7"}, Evidence: []engine.Evidence{{Title: "private evidence", URL: "https://example.com/private"}},
		}},
		Questions: []engine.QuestionPlanet{
			{ID: "question:7", QuestionID: "7", Title: "Public question", URL: "https://www.zhihu.com/question/7", AnswerIDs: []string{"answer:8"}},
			{ID: "question:9", QuestionID: "9", Title: "Other question", URL: "https://www.zhihu.com/question/9", AnswerIDs: []string{"answer:10"}},
		},
		Answers: []engine.AnswerSatellite{
			{ID: "answer:8", QuestionID: "question:7", Title: "Public answer", Summary: "private-ish summary", URL: "https://www.zhihu.com/question/7/answer/8", AuthorID: "author:alice", AuthorName: "Alice", PublishedAt: 10, UpdatedAt: 20, ObservedAt: 30, LikeCount: 4, CommentCount: 5, FavoriteCount: 6, Bindings: []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated}}, DiscoverySources: []zhihu.DiscoverySource{zhihu.DiscoveryOwnContent}},
			{ID: "answer:10", QuestionID: "question:9", Title: "Other answer", URL: "https://www.zhihu.com/question/9/answer/10"},
		},
		Probes: []engine.ArticleProbe{{ID: "article:1", Title: "unselected article", URL: "https://zhuanlan.zhihu.com/p/1"}},
	}
}

func TestEmptyShareSelectionBuildsEmptyPreview(t *testing.T) {
	got, err := BuildView(shareUniverse(), ShareSelection{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Questions) != 0 || len(got.Answers) != 0 {
		t.Fatalf("empty selection leaked content: %+v", got)
	}
}

func TestBuildShareViewUsesExplicitPublicWhitelist(t *testing.T) {
	got, err := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Questions) != 1 || got.Questions[0].ID != "question:7" || len(got.Answers) != 1 || got.Answers[0].ID != "answer:8" {
		t.Fatalf("selection was not isolated: %+v", got)
	}
	b, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	text := string(b)
	for _, forbidden := range []string{"private concept", "private evidence", "private-ish summary", "observedAt", "bindings", "discoverySources", "created", "collected", "stars", "clusters", "probes", "Other question", "Other answer"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("share view contains forbidden %q: %s", forbidden, text)
		}
	}
	for _, wanted := range []string{"question:7", "Public question", "answer:8", "Public answer", "Alice", "publishedAt", "favoriteCount"} {
		if !strings.Contains(text, wanted) {
			t.Fatalf("share view lost whitelisted %q: %s", wanted, text)
		}
	}
}

func TestBuildShareViewRejectsUnknownIDsDeterministically(t *testing.T) {
	_, err1 := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:z", "question:a"}})
	_, err2 := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:a", "question:z"}})
	if err1 == nil || err2 == nil || err1.Error() != err2.Error() || !strings.Contains(err1.Error(), "question:a, question:z") {
		t.Fatalf("unknown ID errors are not deterministic: %v / %v", err1, err2)
	}
}

func TestBuildShareViewRejectsDuplicateSelection(t *testing.T) {
	_, err := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7", "question:7"}})
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("duplicate explicit selection should be rejected: %v", err)
	}
}

func TestBuildShareViewRejectsDuplicateUniverseQuestionIDs(t *testing.T) {
	u := shareUniverse()
	u.Questions = append(u.Questions, u.Questions[0])
	if _, err := BuildView(u, ShareSelection{QuestionIDs: []string{"question:7"}}); err == nil {
		t.Fatal("duplicate universe question IDs should not be silently overwritten")
	}
}

func TestShareViewValidateRejectsMalformedPublicData(t *testing.T) {
	valid, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	tests := []struct {
		name   string
		mutate func(*ShareView)
	}{
		{"schema", func(v *ShareView) { v.SchemaVersion = "share.v2" }},
		{"question URL", func(v *ShareView) { v.Questions[0].URL = "https://example.com/7" }},
		{"answer ref", func(v *ShareView) { v.Questions[0].AnswerIDs = []string{"answer:9"} }},
		{"negative count", func(v *ShareView) { v.Answers[0].LikeCount = -1 }},
		{"unverified author display", func(v *ShareView) { v.Answers[0].AuthorID = "" }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			view := valid
			view.Questions = append([]Question(nil), valid.Questions...)
			view.Answers = append([]Answer(nil), valid.Answers...)
			view.Questions[0].AnswerIDs = append([]string(nil), valid.Questions[0].AnswerIDs...)
			tc.mutate(&view)
			if err := view.Validate(); err == nil {
				t.Fatalf("malformed %s passed validation", tc.name)
			}
		})
	}
}

func TestBuildShareViewRejectsUnavailableNonCanonicalQuestion(t *testing.T) {
	u := shareUniverse()
	u.Questions[0].URL = "https://example.com/question/7"
	_, err := BuildView(u, ShareSelection{QuestionIDs: []string{"question:7"}})
	if err == nil || !strings.Contains(err.Error(), "question:7") {
		t.Fatalf("non-canonical public question should be unavailable: %v", err)
	}
}

func TestShareStorePersistsHashedOwnerAndRestoresOwnership(t *testing.T) {
	dir := t.TempDir()
	owner := "high-entropy-session-id"
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	store, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Create(owner, view)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(dir, record.ID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), owner) || record.OwnerKey == "" {
		t.Fatalf("raw owner leaked or owner key missing: %s", b)
	}

	restarted, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarted.DeleteOwned(record.ID, "different-owner"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-owner delete should look absent: %v", err)
	}
	if _, err := restarted.Load(record.ID); err != nil {
		t.Fatalf("non-owner delete removed content: %v", err)
	}
	if err := restarted.DeleteOwned(record.ID, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.Load(record.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("owner delete did not persist: %v", err)
	}
}

func TestDeleteAllOwnedLeavesOtherOwnersShares(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	a, _ := store.Create("owner-a", view)
	b, _ := store.Create("owner-a", view)
	c, _ := store.Create("owner-b", view)
	if err := store.DeleteAllOwned("owner-a"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{a.ID, b.ID} {
		if _, err := store.Load(id); !errors.Is(err, ErrNotFound) {
			t.Fatalf("owned share %q survived: %v", id, err)
		}
	}
	if _, err := store.Load(c.ID); err != nil {
		t.Fatalf("other owner's share was deleted: %v", err)
	}
}

func TestLegacyOwnerlessShareIsReadableButNotDeletable(t *testing.T) {
	dir := t.TempDir()
	created := time.Now().Add(-time.Hour)
	legacy := map[string]any{"id": "legacy", "createdAt": created, "expiresAt": created.Add(TTL), "universe": map[string]any{}}
	b, _ := json.Marshal(legacy)
	_ = os.WriteFile(filepath.Join(dir, "legacy.json"), b, 0o600)
	store, _ := NewStore(dir)
	record, err := store.Load("legacy")
	if err != nil || !record.Legacy {
		t.Fatalf("legacy share unreadable: %+v %v", record, err)
	}
	if err := store.DeleteOwned("legacy", "anyone"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ownerless legacy share was deletable: %v", err)
	}
}

func TestStoredViewEqualsPreview(t *testing.T) {
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	store, _ := NewStore(t.TempDir())
	record, err := store.Create("owner", view)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load(record.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded.View, view) {
		t.Fatalf("persisted view differs from preview:\nwant %+v\ngot  %+v", view, loaded.View)
	}
}

func TestNewStoreQuarantinesCorruptCurrentRecords(t *testing.T) {
	dir := t.TempDir()
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	now := time.Now()
	validOwner := strings.Repeat("a", 64)
	cases := []struct {
		fileID string
		record Record
	}{
		{"missing_owner", Record{ID: "missing_owner", CreatedAt: now, ExpiresAt: now.Add(TTL), View: view}},
		{"mismatch", Record{ID: "different", CreatedAt: now, ExpiresAt: now.Add(TTL), OwnerKey: validOwner, View: view}},
		{"invalid_view", Record{ID: "invalid_view", CreatedAt: now, ExpiresAt: now.Add(TTL), OwnerKey: validOwner, View: ShareView{SchemaVersion: "share.v2"}}},
	}
	for _, tc := range cases {
		b, _ := json.Marshal(tc.record)
		if err := os.WriteFile(filepath.Join(dir, tc.fileID+".json"), b, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	store, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		if _, err := store.Load(tc.fileID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("corrupt record %s remains loadable: %v", tc.fileID, err)
		}
		if _, err := os.Stat(filepath.Join(dir, tc.fileID+".json")); !os.IsNotExist(err) {
			t.Fatalf("corrupt record %s remains in public namespace", tc.fileID)
		}
	}
	entries, _ := os.ReadDir(dir)
	quarantined := 0
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".corrupt") {
			quarantined++
		}
	}
	if quarantined != len(cases) {
		t.Fatalf("quarantined %d records, want %d", quarantined, len(cases))
	}
}

func TestNewStoreQuarantinesLegacyRecordCreatedInFuture(t *testing.T) {
	dir := t.TempDir()
	created := time.Now().Add(10 * time.Minute)
	legacy := map[string]any{
		"id": "future_legacy", "createdAt": created, "expiresAt": created.Add(time.Hour),
		"universe": map[string]any{},
	}
	b, _ := json.Marshal(legacy)
	path := filepath.Join(dir, "future_legacy.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load("future_legacy"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("future-dated legacy record remains publicly loadable: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("future-dated legacy record was not quarantined: %v", err)
	}
}

func TestNewStoreQuarantinesLegacyRecordBeyondTTL(t *testing.T) {
	dir := t.TempDir()
	created := time.Now().Add(-time.Hour)
	legacy := map[string]any{
		"id": "long_legacy", "createdAt": created, "expiresAt": created.Add(TTL + time.Second),
		"universe": map[string]any{},
	}
	b, _ := json.Marshal(legacy)
	path := filepath.Join(dir, "long_legacy.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load("long_legacy"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("overlong legacy record remains publicly loadable: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("overlong legacy record was not quarantined: %v", err)
	}
}

func TestShareStoreEnforcesPerOwnerQuota(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	for i := 0; i < MaxActivePerOwner; i++ {
		if _, err := store.Create("owner", view); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}
	if _, err := store.Create("owner", view); !errors.Is(err, ErrQuota) {
		t.Fatalf("over-quota create should return ErrQuota: %v", err)
	}
}

func TestPruneReadFailurePreservesOwnerIndex(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	first, _ := store.Create("owner", view)
	realRead := store.readFile
	store.readFile = func(path string) ([]byte, error) {
		if strings.HasSuffix(path, first.ID+".json") {
			return nil, errors.New("transient read")
		}
		return realRead(path)
	}
	if _, err := store.Create("owner", view); err == nil {
		t.Fatal("create ignored transient prune read failure")
	}
	if _, exists := store.byOwner[ownerKey("owner")][first.ID]; !exists {
		t.Fatal("transient read orphaned owner index")
	}
}

func TestPruneParseFailurePreservesOwnerIndex(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	first, _ := store.Create("owner", view)
	store.readFile = func(string) ([]byte, error) { return []byte("{"), nil }
	if _, err := store.Create("owner", view); err == nil {
		t.Fatal("create ignored transient prune parse failure")
	}
	if _, exists := store.byOwner[ownerKey("owner")][first.ID]; !exists {
		t.Fatal("transient parse failure orphaned owner index")
	}
}

func TestCreateReturnsCommittedRecordWhenDirectorySyncFails(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	store.syncDir = func(string) error { return errors.New("sync failed") }
	record, err := store.Create("owner", view)
	if err != nil || record == nil {
		t.Fatalf("committed create became ambiguous: record=%v err=%v", record, err)
	}
	if _, exists := store.byOwner[ownerKey("owner")][record.ID]; !exists {
		t.Fatal("committed record missing owner index")
	}
}

func TestStoreEnforcesGlobalActiveShareCeiling(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	store.maxFiles = 1
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	if _, err := store.Create("owner-a", view); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create("owner-b", view); !errors.Is(err, ErrQuota) {
		t.Fatalf("global quota not enforced: %v", err)
	}
}

func TestCreateRetriesIDCollisionWithoutOverwrite(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	view, _ := BuildView(shareUniverse(), ShareSelection{QuestionIDs: []string{"question:7"}})
	first, _ := store.Create("owner-a", view)
	ids := []string{first.ID, "unique_id"}
	store.newID = func() (string, error) { id := ids[0]; ids = ids[1:]; return id, nil }
	second, err := store.Create("owner-b", view)
	if err != nil || second.ID != "unique_id" {
		t.Fatalf("collision retry failed: record=%v err=%v", second, err)
	}
	loaded, err := store.Load(first.ID)
	if err != nil || !sameOwner(loaded.OwnerKey, ownerKey("owner-a")) {
		t.Fatal("collision overwrote existing share")
	}
}

func TestNewStoreRemovesExpiredQuarantineFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "old.corrupt")
	if err := os.WriteFile(path, []byte("bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-quarantineTTL - time.Hour)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expired quarantine retained: %v", err)
	}
}
