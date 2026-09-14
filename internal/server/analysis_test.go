package server

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

type analysisCounter struct{ items, names int }

func (e *analysisCounter) Extract(_ context.Context, items []zhihu.Item) ([][]string, error) {
	e.items += len(items)
	out := make([][]string, len(items))
	for i := range out {
		out[i] = []string{"算法", "数学", "底层原理"}
	}
	return out, nil
}
func (e *analysisCounter) NameCluster(context.Context, []string, []string) (string, error) {
	e.names++
	return "数理之光", nil
}

func TestMockNeverCallsConfiguredModelAndReusesArtifactAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	e := &analysisCounter{}
	run := func() {
		s := testServer(t, dir)
		s.ext = e
		s.cfg.ConceptsPath = "../../testdata/concepts_sample.json"
		cookie := startSession(t, s)
		sess := s.sess[cookie.Value]
		s.generate(sess, &zhihu.MockProvider{Path: "../../testdata/corpus_sample.json"})
		if sess.gen.State != genDone {
			t.Fatalf("generation: %+v", sess.gen)
		}
	}
	run()
	files, _ := filepath.Glob(filepath.Join(dir, ".analysis", "*.json"))
	if len(files) != 1 {
		t.Fatalf("cache files: %v", files)
	}
	st, _ := os.Stat(files[0])
	run()
	after, _ := os.Stat(files[0])
	if !after.ModTime().Equal(st.ModTime()) {
		t.Fatal("mock artifact rebuilt on restart")
	}
	if e.items != 0 || e.names != 0 {
		t.Fatalf("mock used model: %+v", e)
	}
}

func TestAuthenticatedAnalysisSurvivesRestartIsIncrementalAndWipeDeletes(t *testing.T) {
	dir := t.TempDir()
	e := &analysisCounter{}
	items := make([]zhihu.Item, 30)
	for i := range items {
		items[i] = zhihu.Item{URL: fmt.Sprintf("https://example.com/%d", i), Title: fmt.Sprintf("算法 %d", i)}
	}
	run := func(uid string) (*Server, *http.Cookie) {
		s := testServer(t, dir)
		s.ext = e
		cookie := startSession(t, s)
		sess := s.sess[cookie.Value]
		sess.token = &zhihu.Token{AccessToken: "test"}
		sess.profile = &zhihu.Profile{UID: uid}
		s.generate(sess, blockingProvider{corpus: &zhihu.Corpus{Source: "live", Items: items}})
		if sess.gen.State != genDone {
			t.Fatalf("generation: %+v", sess.gen)
		}
		return s, cookie
	}
	run("user-a")
	run("user-a")
	if e.items != 30 || e.names != 1 {
		t.Fatalf("repeat called model: %+v", e)
	}
	items = append(items, zhihu.Item{URL: "https://example.com/new", Title: "新增算法内容"})
	s, cookie := run("user-a")
	if e.items != 31 || e.names != 1 {
		t.Fatalf("not incremental: %+v", e)
	}
	run("user-b")
	if e.items != 62 || e.names != 2 {
		t.Fatalf("cross-owner reuse: %+v", e)
	}
	resp := doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, cookie)
	if resp.Code != 200 {
		t.Fatalf("wipe: %s", resp.Body)
	}
	run("user-a")
	if e.items != 93 || e.names != 3 {
		t.Fatalf("wipe did not clear cache: %+v", e)
	}
}
