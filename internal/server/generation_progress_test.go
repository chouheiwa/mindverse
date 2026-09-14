package server

import (
	"context"
	"fmt"
	"github.com/chouheiwa/mindverse/internal/progress"
	"github.com/chouheiwa/mindverse/internal/zhihu"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestGenerationEstimateUsesMeasuredWorkAndResetsAtPhaseBoundary(t *testing.T) {
	tr := &generationTracker{}
	now := time.Unix(1000, 0)
	d := tr.observe(progress.Event{Phase: "analyze", Total: 100}, now)
	if d.EstimateHigh != 0 {
		t.Fatal("must not invent estimate before a completed batch")
	}
	d = tr.observe(progress.Event{Phase: "analyze", Done: 20, Total: 100, SampleSeconds: 10, RemainingWaves: 3}, now.Add(10*time.Second))
	if d.EstimateLow != 20 || d.EstimateHigh != 54 {
		t.Fatalf("unexpected measured interval: %+v", d)
	}
	d = tr.observe(progress.Event{Phase: "normalize", Done: 100, Total: 100}, now.Add(time.Minute))
	if d.EstimateHigh != 0 {
		t.Fatal("previous phase estimate must not become a false normalization countdown")
	}
	if d.StartedAt != now.UnixMilli() {
		t.Fatal("start time must survive phase changes")
	}
}

func TestGenerationPreviewsAreBoundedImmutableAndRejectUnsafeLinks(t *testing.T) {
	tr := &generationTracker{}
	p := progress.Preview{Concepts: []string{"算法"}, Title: "原文", URL: "https://www.zhihu.com/question/1"}
	old := tr.observe(progress.Event{Phase: "analyze", Preview: []progress.Preview{p}}, time.Now())
	p.Concepts[0] = "changed"
	for _, u := range []string{"javascript:alert(1)", "https://www.zhihu.com.evil.test/1", "https://name@www.zhihu.com/1", "https://www.zhihu.com:8443/1"} {
		tr.observe(progress.Event{Phase: "analyze", Preview: []progress.Preview{{URL: u, Concepts: []string{"算法"}}}}, time.Now())
	}
	if len(tr.details.Preview) != 1 || old.Preview[0].Concepts[0] != "算法" {
		t.Fatal("preview must be safe and detached from producer")
	}
	for _, u := range []string{"https://www.zhihu.com/question/2", "https://www.zhihu.com/question/3", "https://www.zhihu.com/question/4"} {
		tr.observe(progress.Event{Phase: "analyze", Preview: []progress.Preview{{URL: u, Concepts: []string{"算法"}}}}, time.Now())
	}
	if len(tr.details.Preview) != 3 || old.Preview[0].URL != p.URL {
		t.Fatal("later updates must not mutate published snapshots")
	}
}

type observedExtractor struct{ blockingExtractor }

func (e *observedExtractor) Extract(ctx context.Context, items []zhihu.Item) ([][]string, error) {
	progress.Report(ctx, progress.Event{Phase: "analyze", Done: 10, Total: 30, Preview: []progress.Preview{{Concepts: []string{"算法"}, Title: "private-preview", URL: "https://www.zhihu.com/question/1"}}})
	return e.blockingExtractor.Extract(ctx, items)
}
func TestGenerationPreviewIsSessionScopedAndWipeClearsIt(t *testing.T) {
	s := testServer(t, t.TempDir())
	e := &observedExtractor{blockingExtractor{entered: make(chan struct{}), release: make(chan struct{})}}
	s.ext = e
	cookie := startSession(t, s)
	sess := s.sess[cookie.Value]
	items := make([]zhihu.Item, 30)
	for i := range items {
		items[i] = zhihu.Item{URL: fmt.Sprintf("https://www.zhihu.com/question/%d", i+1), Title: fmt.Sprint(i)}
	}
	done := make(chan struct{})
	go func() {
		s.generate(sess, blockingProvider{corpus: &zhihu.Corpus{Source: "live", Items: items}})
		close(done)
	}()
	<-e.entered
	own := doRequest(t, s.Routes(), http.MethodGet, "/api/universe", nil, cookie)
	if !strings.Contains(own.Body.String(), "private-preview") {
		t.Fatal("owner cannot see real progress")
	}
	other := doRequest(t, s.Routes(), http.MethodGet, "/api/universe", nil, nil)
	if strings.Contains(other.Body.String(), "private-preview") {
		t.Fatal("private progress leaked to another session")
	}
	wiped := doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, cookie)
	if wiped.Code != 200 {
		t.Fatalf("wipe: %d", wiped.Code)
	}
	<-done
	after := doRequest(t, s.Routes(), http.MethodGet, "/api/universe", nil, cookie)
	if strings.Contains(after.Body.String(), "private-preview") {
		t.Fatal("late observations restored deleted progress")
	}
}
