package share

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

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
			{ID: "answer:8", QuestionID: "question:7", Title: "Public answer", Summary: "private-ish summary", URL: "https://www.zhihu.com/question/7/answer/8", AuthorID: "alice", AuthorName: "Alice", PublishedAt: 10, UpdatedAt: 20, ObservedAt: 30, LikeCount: 4, CommentCount: 5, FavoriteCount: 6, Bindings: []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated}}, DiscoverySources: []zhihu.DiscoverySource{zhihu.DiscoveryOwnContent}},
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
	legacy := map[string]any{"id": "legacy", "expiresAt": "2099-01-01T00:00:00Z", "universe": map[string]any{}}
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
