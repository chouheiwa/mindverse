package extract

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// Cache stores derived labels and names, never source titles, summaries or tokens.
// One transaction spans extraction, naming and generation for an owner. Deletion
// invalidates running and queued transactions without waiting for model requests.
type Cache struct {
	dir    string
	mu     sync.Mutex
	owners map[string]*cacheOwner
}
type cacheOwner struct {
	gate     chan struct{}
	revision uint64
	refs     int
}
type cacheRecord struct {
	Version string              `json:"version"`
	Labels  map[string][]string `json:"labels"`
	Names   map[string]string   `json:"names"`
	// Artifact is used only for public mock universes by the server.
	ArtifactKey string          `json:"artifactKey,omitempty"`
	Artifact    json.RawMessage `json:"artifact,omitempty"`
}
type CachedExtractor struct {
	cache                              *Cache
	owner                              string
	state                              *cacheOwner
	revision                           uint64
	ctx                                context.Context
	base                               Extractor
	record                             cacheRecord
	closed                             bool
	Hits, Misses, NameHits, NameMisses int
}

func NewCache(dir string) (*Cache, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	return &Cache{dir: dir, owners: map[string]*cacheOwner{}}, nil
}

func digest(raw []byte) string            { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func (c *Cache) path(owner string) string { return filepath.Join(c.dir, digest([]byte(owner))+".json") }

// CacheVersion includes prompts and the model endpoint, but never credentials.
func CacheVersion(ext Extractor) (string, error) {
	version := "incremental-v1\n" + systemPrompt + canonPrompt + namePrompt
	switch e := ext.(type) {
	case *LLMExtractor:
		if llm, ok := e.LLM.(*LLM); ok {
			version += llm.BaseURL + "\n" + llm.Model
		} else {
			version += fmt.Sprintf("%T", e.LLM)
		}
	case *FileExtractor:
		raw, err := os.ReadFile(e.Path)
		if err != nil {
			return "", err
		}
		version += string(raw)
	default:
		version += fmt.Sprintf("%T", ext)
	}
	return digest([]byte(version)), nil
}

func (c *Cache) Begin(ctx context.Context, owner, version string, base Extractor) (*CachedExtractor, error) {
	if owner == "" || base == nil {
		return nil, errors.New("missing analysis owner or extractor")
	}
	c.mu.Lock()
	st := c.owners[owner]
	if st == nil {
		st = &cacheOwner{gate: make(chan struct{}, 1)}
		c.owners[owner] = st
	}
	st.refs++
	revision := st.revision
	c.mu.Unlock()
	x := &CachedExtractor{cache: c, owner: owner, state: st, revision: revision, ctx: ctx, base: base}
	select {
	case st.gate <- struct{}{}:
	case <-ctx.Done():
		c.release(owner, st)
		return nil, ctx.Err()
	}
	c.mu.Lock()
	if err := x.valid(); err != nil {
		c.mu.Unlock()
		x.Close()
		return nil, err
	}
	raw, err := os.ReadFile(c.path(owner))
	c.mu.Unlock()
	if err != nil && !os.IsNotExist(err) {
		x.Close()
		return nil, err
	}
	if err == nil {
		if err := json.Unmarshal(raw, &x.record); err != nil {
			x.Close()
			return nil, fmt.Errorf("invalid analysis cache: %w", err)
		}
	}
	if x.record.Version != version {
		x.record = cacheRecord{Version: version}
	}
	if x.record.Labels == nil {
		x.record.Labels = map[string][]string{}
	}
	if x.record.Names == nil {
		x.record.Names = map[string]string{}
	}
	return x, nil
}

func (c *Cache) release(owner string, st *cacheOwner) {
	c.mu.Lock()
	defer c.mu.Unlock()
	st.refs--
	if st.refs == 0 {
		delete(c.owners, owner)
	}
}
func (x *CachedExtractor) Close() {
	if x.closed {
		return
	}
	x.closed = true
	<-x.state.gate
	x.cache.release(x.owner, x.state)
}

// valid is called while holding cache.mu.
func (x *CachedExtractor) valid() error {
	if err := x.ctx.Err(); err != nil {
		return err
	}
	if x.closed || x.revision != x.state.revision {
		return errors.New("analysis invalidated")
	}
	return nil
}

func (c *Cache) Delete(owner string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if st := c.owners[owner]; st != nil {
		st.revision++
	}
	err := os.Remove(c.path(owner))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func annotationKey(it zhihu.Item) string {
	// Include identity and exactly the prompt input, not fetch timestamps or votes.
	// The full-text filter outcome matters even outside the truncated prompt.
	return digest([]byte(it.Identity.ContentID + "\n" + it.URL + "\n" + renderBatch([]zhihu.Item{it}, 0, nil) + fmt.Sprint(IsSensitiveItem(it.Title, it.Summary))))
}

func (x *CachedExtractor) Extract(ctx context.Context, items []zhihu.Item) ([][]string, error) {
	result := make([][]string, len(items))
	keys := make([]string, len(items))
	missing := []zhihu.Item{}
	missingKeys := []string{}
	seen := map[string]bool{}
	vocab := map[string]int{}
	for i, it := range items {
		key := annotationKey(it)
		keys[i] = key
		if cs, ok := x.record.Labels[key]; ok {
			result[i] = append([]string(nil), cs...)
			x.Hits++
			for _, c := range cs {
				vocab[c]++
			}
		} else if IsSensitiveItem(it.Title, it.Summary) {
			x.record.Labels[key] = []string{}
		} else if !seen[key] {
			seen[key] = true
			missing = append(missing, it)
			missingKeys = append(missingKeys, key)
		}
	}
	if len(missing) == 0 {
		return result, nil
	}
	x.Misses += len(missing)
	var cs [][]string
	var err error
	if e, ok := x.base.(interface {
		ExtractWithVocabulary(context.Context, []zhihu.Item, map[string]int) ([][]string, error)
	}); ok {
		cs, err = e.ExtractWithVocabulary(ctx, missing, vocab)
	} else {
		cs, err = x.base.Extract(ctx, missing)
	}
	if err != nil {
		return nil, err
	}
	if len(cs) != len(missing) {
		return nil, errors.New("incomplete extraction result")
	}
	for i, key := range missingKeys {
		// Failed/missing batches must be retried rather than cached as valid empties.
		if len(cs[i]) > 0 {
			x.record.Labels[key] = append([]string(nil), cs[i]...)
		}
	}
	for i, key := range keys {
		result[i] = append([]string(nil), x.record.Labels[key]...)
	}
	return result, nil
}

func (x *CachedExtractor) NameCluster(ctx context.Context, members, samples []string) (string, error) {
	sorted := append([]string(nil), members...)
	sort.Strings(sorted)
	raw, _ := json.Marshal(sorted)
	key := digest(raw)
	if name, ok := x.record.Names[key]; ok {
		x.NameHits++
		return name, nil
	}
	x.NameMisses++
	name, err := x.base.NameCluster(ctx, members, samples)
	if err == nil && name != "" {
		x.record.Names[key] = name
	}
	return name, err
}

func (x *CachedExtractor) Artifact(key string) []byte {
	if key == x.record.ArtifactKey {
		return x.record.Artifact
	}
	return nil
}
func (x *CachedExtractor) SetArtifact(key string, raw []byte) {
	x.record.ArtifactKey, x.record.Artifact = key, raw
}

func (x *CachedExtractor) Commit() error {
	raw, err := json.Marshal(x.record)
	if err != nil {
		return err
	}
	c := x.cache
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := x.valid(); err != nil {
		return err
	}
	f, err := os.CreateTemp(c.dir, ".analysis-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), c.path(x.owner))
}
