package extract

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

type countingExtractor struct {
	sizes []int
	names int
	fail  bool
}

func (e *countingExtractor) Extract(_ context.Context, items []zhihu.Item) ([][]string, error) {
	e.sizes = append(e.sizes, len(items))
	if e.fail {
		return nil, errors.New("failed")
	}
	out := make([][]string, len(items))
	for i := range out {
		out[i] = []string{"算法", "数学", "底层原理"}
	}
	return out, nil
}
func (e *countingExtractor) NameCluster(context.Context, []string, []string) (string, error) {
	e.names++
	return "数理之光", nil
}

func TestCachePersistsOnlyChangedInputsAndIsolatesOwners(t *testing.T) {
	dir := t.TempDir()
	c, err := NewCache(dir)
	if err != nil {
		t.Fatal(err)
	}
	e := &countingExtractor{}
	items := []zhihu.Item{{URL: "https://example.com/a", Title: "private title A", Summary: "private summary"}, {URL: "https://example.com/b", Title: "private title B"}}
	run := func(owner string, items []zhihu.Item) {
		t.Helper()
		x, err := c.Begin(context.Background(), owner, "test-v1", e)
		if err != nil {
			t.Fatal(err)
		}
		defer x.Close()
		cs, err := x.Extract(context.Background(), items)
		if err != nil || len(cs) != len(items) {
			t.Fatalf("extract: %v %v", cs, err)
		}
		if _, err := x.NameCluster(context.Background(), []string{"数学", "算法"}, []string{items[0].Title}); err != nil {
			t.Fatal(err)
		}
		if err := x.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	run("user-a", items)
	c, err = NewCache(dir) // server restart
	if err != nil {
		t.Fatal(err)
	}
	items[0], items[1] = items[1], items[0] // order does not invalidate item annotations
	run("user-a", items)
	if len(e.sizes) != 1 || e.names != 1 {
		t.Fatalf("unchanged inputs called model: %+v", e)
	}
	items[0].ObservedAt = 123
	items[0].LikeCount = 99
	run("user-a", items)
	if len(e.sizes) != 1 {
		t.Fatal("observation metadata invalidated extraction")
	}
	items = append(items, zhihu.Item{URL: "https://example.com/c", Title: "New"})
	run("user-a", items)
	items[0].Summary = "Changed summary"
	run("user-a", items)
	if len(e.sizes) != 3 || e.sizes[1] != 1 || e.sizes[2] != 1 {
		t.Fatalf("not incremental: %v", e.sizes)
	}
	run("user-b", items)
	if e.sizes[3] != 3 || e.names != 2 {
		t.Fatalf("owner cache leaked: %+v", e)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	for _, file := range files {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(raw), "private") || strings.Contains(string(raw), "https://example.com") {
			t.Fatal("raw source content persisted")
		}
		st, _ := os.Stat(file)
		if st.Mode().Perm() != 0600 {
			t.Fatal("cache permissions")
		}
	}
}

func TestCacheDeletionRejectsInFlightWriteAndVersionChangeInvalidates(t *testing.T) {
	c, _ := NewCache(t.TempDir())
	e := &countingExtractor{}
	items := []zhihu.Item{{URL: "https://example.com", Title: "算法"}}
	x, err := c.Begin(context.Background(), "user", "v1", e)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = x.Extract(context.Background(), items); err != nil {
		t.Fatal(err)
	}
	if err := c.Delete("user"); err != nil {
		t.Fatal(err)
	}
	if err := x.Commit(); err == nil {
		t.Fatal("deleted cache resurrected")
	}
	x.Close()
	for _, version := range []string{"v1", "v2"} {
		x, err = c.Begin(context.Background(), "user", version, e)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := x.Extract(context.Background(), items); err != nil {
			t.Fatal(err)
		}
		if err := x.Commit(); err != nil {
			t.Fatal(err)
		}
		x.Close()
	}
	if len(e.sizes) != 3 {
		t.Fatalf("version change not invalidated: %v", e.sizes)
	}
}

func TestFailedExtractionDoesNotPoisonCache(t *testing.T) {
	c, _ := NewCache(t.TempDir())
	e := &countingExtractor{fail: true}
	items := []zhihu.Item{{Title: "算法"}}
	x, _ := c.Begin(context.Background(), "user", "v1", e)
	if _, err := x.Extract(context.Background(), items); err == nil {
		t.Fatal("expected failure")
	}
	x.Close()
	e.fail = false
	x, _ = c.Begin(context.Background(), "user", "v1", e)
	defer x.Close()
	if _, err := x.Extract(context.Background(), items); err != nil {
		t.Fatal(err)
	}
	if len(e.sizes) != 2 {
		t.Fatal("failure cached")
	}
}

func TestConcurrentAnalysisSharesCommittedResults(t *testing.T) {
	c, _ := NewCache(t.TempDir())
	e := &countingExtractor{}
	items := []zhihu.Item{{Title: "算法"}}
	first, _ := c.Begin(context.Background(), "user", "v1", e)
	if _, err := first.Extract(context.Background(), items); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		second, err := c.Begin(context.Background(), "user", "v1", e)
		if err != nil {
			done <- err
			return
		}
		defer second.Close()
		_, err = second.Extract(context.Background(), items)
		done <- err
	}()
	if err := first.Commit(); err != nil {
		t.Fatal(err)
	}
	first.Close()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("queued analysis stuck")
	}
	if len(e.sizes) != 1 {
		t.Fatalf("duplicate model request: %v", e.sizes)
	}
}

func TestIncrementalExtractionUsesExistingVocabulary(t *testing.T) {
	f := &fakeLLM{}
	e := NewLLMExtractor(f)
	cs, err := e.ExtractWithVocabulary(context.Background(), sampleItems(1), map[string]int{"大模型架构": 20})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(f.seen[0], "【已有词表】") || !strings.Contains(f.seen[0], "大模型架构") {
		t.Fatal("known vocabulary missing from prompt")
	}
	if !strings.Contains(strings.Join(cs[0], ","), "大模型架构") {
		t.Fatalf("new synonym not canonicalized: %v", cs)
	}
}
