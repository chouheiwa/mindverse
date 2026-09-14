package server

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/extract"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// analysisOwner must only use a server-verified identity, never request fields,
// display names or an arbitrary browser cookie. Anonymous analyses stay scoped
// to the issued session; authenticated analyses survive login and server restart.
func analysisOwner(sess *session) string {
	if sess.token != nil && !sess.token.Expired() && sess.profile != nil {
		if uid := strings.TrimSpace(sess.profile.UID); uid != "" {
			return "zhihu:uid:" + uid
		}
		if id := strings.TrimSpace(sess.profile.HashID); id != "" {
			return "zhihu:hash:" + id
		}
	}
	return "session:" + sessionOwner(sess)
}

func (s *Server) beginAnalysis(ctx context.Context, sess *session, epoch uint64, source string) (*extract.CachedExtractor, error) {
	sess.mu.Lock()
	if sess.epoch != epoch {
		sess.mu.Unlock()
		return nil, context.Canceled
	}
	owner := analysisOwner(sess)
	ext := s.ext
	if source == "mock" {
		owner = "public:mock"
		ext = &extract.FileExtractor{Path: s.cfg.ConceptsPath}
	}
	// Guest choices must not replace an authenticated account's vocabulary.
	if source == "seed" {
		owner = "session:" + sessionOwner(sess)
	}
	// Capture ownership before releasing the session lock. Begin may wait on a
	// different session's generation, so never keep sess.mu while it waits.
	sess.analysisOwner = owner
	sess.mu.Unlock()
	version, err := extract.CacheVersion(ext)
	if err != nil {
		return nil, err
	}
	x, err := s.analysis.Begin(ctx, owner, version, ext)
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if err == nil && sess.epoch != epoch {
		x.Close()
		return nil, context.Canceled
	}
	return x, err
}

func mockArtifactKey(items, public []zhihu.Item) string {
	// Public answers are assembled from a map, so normalize their order.
	public = append([]zhihu.Item(nil), public...)
	sort.Slice(public, func(i, j int) bool { return public[i].URL < public[j].URL })
	raw, _ := json.Marshal(struct {
		Items, Public    []zhihu.Item
		Schema, Analysis string
	}{items, public, fmt.Sprint(engine.CurrentSchemaVersion), fmt.Sprint(engine.CurrentAnalysisVersion)})
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}
