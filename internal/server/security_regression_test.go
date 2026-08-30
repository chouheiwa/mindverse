package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/share"
)

type countingOAuthTransport struct {
	exchanges atomic.Int32
	block     chan struct{}
}

func (c *countingOAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if strings.HasSuffix(req.URL.Path, "/access_token") {
		c.exchanges.Add(1)
		if c.block != nil {
			<-c.block
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"access_token":"token","expires_in":3600}`)), Request: req}, nil
	}
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":{"name":"Alice"}}`)), Request: req}, nil
}

func configureOAuth(s *Server, transport http.RoundTripper) {
	s.cfg.AppID, s.cfg.AppKey, s.cfg.AccessSecret, s.cfg.RedirectURI = "1", "key", "access-secret", "https://example.com/auth/callback"
	s.oauth.AppID, s.oauth.AppKey, s.oauth.RedirectURI = s.cfg.AppID, s.cfg.AppKey, s.cfg.RedirectURI
	s.oauth.HTTP = &http.Client{Transport: transport}
}

func beginOAuth(t *testing.T, s *Server, cookie *http.Cookie) string {
	t.Helper()
	rr := doRequest(t, s.Routes(), http.MethodGet, "/auth/start", nil, cookie)
	if rr.Code != http.StatusFound {
		t.Fatalf("auth start status=%d body=%s", rr.Code, rr.Body.String())
	}
	location, err := url.Parse(rr.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	state := location.Query().Get("state")
	if state == "" {
		t.Fatal("auth start omitted state")
	}
	return state
}

func TestOAuthCallbackRejectsMissingWrongAndCrossSessionStateBeforeExchange(t *testing.T) {
	s := testServer(t, t.TempDir())
	transport := &countingOAuthTransport{}
	configureOAuth(s, transport)
	a, b := startSession(t, s), startSession(t, s)
	stateA := beginOAuth(t, s, a)
	stateB := beginOAuth(t, s, b)

	for _, tc := range []struct {
		name   string
		cookie *http.Cookie
		state  string
	}{
		{"missing", a, ""},
		{"wrong", a, "wrong"},
		{"cross-session", a, stateB},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rr := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=code&state="+url.QueryEscape(tc.state), nil, tc.cookie)
			if rr.Code < 400 {
				t.Fatalf("callback accepted invalid state: status=%d", rr.Code)
			}
		})
	}
	if got := transport.exchanges.Load(); got != 0 {
		t.Fatalf("invalid state reached provider exchange %d times (stateA=%q)", got, stateA)
	}
}

func TestOAuthStateExpiresBeforeExchange(t *testing.T) {
	s := testServer(t, t.TempDir())
	transport := &countingOAuthTransport{}
	configureOAuth(s, transport)
	cookie := startSession(t, s)
	state := beginOAuth(t, s, cookie)
	s.mu.Lock()
	sess := s.sess[cookie.Value]
	s.mu.Unlock()
	sess.mu.Lock()
	sess.stateExpiresAt = time.Now().Add(-time.Second)
	sess.mu.Unlock()

	rr := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=code&state="+url.QueryEscape(state), nil, cookie)
	if rr.Code < 400 || transport.exchanges.Load() != 0 {
		t.Fatalf("expired state accepted: status=%d exchanges=%d", rr.Code, transport.exchanges.Load())
	}
}

func TestOAuthStateIsSingleUseAcrossConcurrentCallbacks(t *testing.T) {
	s := testServer(t, t.TempDir())
	block := make(chan struct{})
	transport := &countingOAuthTransport{block: block}
	configureOAuth(s, transport)
	cookie := startSession(t, s)
	state := beginOAuth(t, s, cookie)
	path := "/auth/callback?authorization_code=code&state=" + url.QueryEscape(state)
	responses := make(chan *httptest.ResponseRecorder, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	for range 2 {
		go func() {
			defer wg.Done()
			responses <- doRequest(t, s.Routes(), http.MethodGet, path, nil, cookie)
		}()
	}
	deadline := time.Now().Add(time.Second)
	for transport.exchanges.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	close(block)
	wg.Wait()
	close(responses)
	if got := transport.exchanges.Load(); got != 1 {
		t.Fatalf("single OAuth state exchanged %d times", got)
	}
	accepted := 0
	for rr := range responses {
		if rr.Code == http.StatusFound {
			accepted++
		}
	}
	if accepted != 1 {
		t.Fatalf("successful callbacks=%d", accepted)
	}
}

func TestAttackerChosenFormatValidCookieGetsFreshServerID(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	chosen, err := randomToken()
	if err != nil {
		t.Fatal(err)
	}
	rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, &http.Cookie{Name: cookieName, Value: chosen})
	cookies := rr.Result().Cookies()
	if len(cookies) == 0 || cookies[0].Value == chosen {
		t.Fatalf("server adopted attacker cookie %q: %+v", chosen, cookies)
	}
	s.mu.Lock()
	_, adopted := s.sess[chosen]
	s.mu.Unlock()
	if adopted {
		t.Fatal("attacker-chosen ID became a server session")
	}
	if _, err := os.Stat(filepath.Join(dir, ".sessions")); !os.IsNotExist(err) {
		t.Fatalf("anonymous request persisted a registry: %v", err)
	}
}

func TestTenThousandAnonymousStatusesNeverPersistOwnerRegistry(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	s.maxSessions = 10_001
	writes := 0
	s.registry.onPersist = func() { writes++ }
	for range 10_000 {
		if rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil); rr.Code != http.StatusOK {
			t.Fatalf("anonymous status=%d", rr.Code)
		}
	}
	if writes != 0 || len(s.registry.records) != 0 {
		t.Fatalf("anonymous statuses persisted owners: writes=%d records=%d", writes, len(s.registry.records))
	}
	if _, err := os.Stat(filepath.Join(dir, ".sessions")); !os.IsNotExist(err) {
		t.Fatalf("anonymous statuses created registry file: %v", err)
	}
}

func TestOwnerRegistryPromotesOnShareAndDemotesAfterLastDelete(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	writes := 0
	s.registry.onPersist = func() { writes++ }
	cookie := startSession(t, s)
	for range 20 {
		if rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, cookie); rr.Code != http.StatusOK {
			t.Fatal(rr.Code)
		}
	}
	if writes != 0 {
		t.Fatalf("ordinary GET persisted registry %d times", writes)
	}
	installUniverse(t, s, cookie, serverUniverse())
	id := createShare(t, s, cookie, "question:7")
	if writes == 0 || len(s.registry.records) != 1 {
		t.Fatalf("share owner not promoted: writes=%d records=%d", writes, len(s.registry.records))
	}
	if _, err := os.Stat(filepath.Join(dir, ".sessions")); err != nil {
		t.Fatal(err)
	}
	if rr := doRequest(t, s.Routes(), http.MethodDelete, "/api/share/"+id, nil, cookie); rr.Code != http.StatusOK {
		t.Fatal(rr.Code)
	}
	if len(s.registry.records) != 0 {
		t.Fatalf("last share deletion retained owner: %d", len(s.registry.records))
	}
	if _, err := os.Stat(filepath.Join(dir, ".sessions")); !os.IsNotExist(err) {
		t.Fatalf("empty registry file survived: %v", err)
	}
}

func TestMissingRegistryQuarantinesPreRegistryShares(t *testing.T) {
	dir := t.TempDir()
	store, err := share.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	view, err := share.BuildView(serverUniverse(), share.ShareSelection{QuestionIDs: []string{"question:7"}})
	if err != nil {
		t.Fatal(err)
	}
	record, err := store.Create("81fb-owner-session", view)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(&config.Config{SnapshotDir: dir, WebDir: t.TempDir()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rr := doRequest(t, s.Routes(), http.MethodGet, "/api/share/"+record.ID, nil, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("unprovable pre-registry share stayed public: %d", rr.Code)
	}
	matches, _ := filepath.Glob(filepath.Join(dir, record.ID+".owner-proof-missing*"))
	if len(matches) != 1 {
		t.Fatalf("missing auditable quarantine: %v", matches)
	}
}

func TestPreOwnerRegistryFormatQuarantines81fbShare(t *testing.T) {
	dir := t.TempDir()
	store, err := share.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	view, _ := share.BuildView(serverUniverse(), share.ShareSelection{QuestionIDs: []string{"question:7"}})
	record, err := store.Create("81fb-owner-session", view)
	if err != nil {
		t.Fatal(err)
	}
	// 81fb257 persisted a bare session-hash map without a version envelope.
	oldRegistry := `{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"owner":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","expiresAt":"2099-01-01T00:00:00Z"}}`
	if err := os.WriteFile(filepath.Join(dir, ".sessions"), []byte(oldRegistry), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := New(&config.Config{SnapshotDir: dir, WebDir: t.TempDir()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rr := doRequest(t, s.Routes(), http.MethodGet, "/api/share/"+record.ID, nil, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("81fb share survived unverifiable migration: %d", rr.Code)
	}
	registryQuarantine, _ := filepath.Glob(filepath.Join(dir, ".sessions.registry-invalid*"))
	shareQuarantine, _ := filepath.Glob(filepath.Join(dir, record.ID+".owner-proof-missing*"))
	if len(registryQuarantine) != 1 || len(shareQuarantine) != 1 {
		t.Fatalf("old-format migration was not auditable: registry=%v share=%v", registryQuarantine, shareQuarantine)
	}
}

func TestCorruptRegistryStartsFailClosedAndQuarantinesShares(t *testing.T) {
	dir := t.TempDir()
	store, err := share.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	view, _ := share.BuildView(serverUniverse(), share.ShareSelection{QuestionIDs: []string{"question:7"}})
	record, err := store.Create("owner", view)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".sessions"), []byte(`{"version":"broken"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := New(&config.Config{SnapshotDir: dir, WebDir: t.TempDir()}, nil)
	if err != nil {
		t.Fatalf("corrupt registry prevented safe startup: %v", err)
	}
	if rr := doRequest(t, s.Routes(), http.MethodGet, "/api/share/"+record.ID, nil, nil); rr.Code != http.StatusNotFound {
		t.Fatal(rr.Code)
	}
	registryQuarantine, _ := filepath.Glob(filepath.Join(dir, ".sessions.registry-invalid*"))
	shareQuarantine, _ := filepath.Glob(filepath.Join(dir, record.ID+".owner-proof-missing*"))
	if len(registryQuarantine) != 1 || len(shareQuarantine) != 1 {
		t.Fatalf("missing corrupt migration audit files: registry=%v share=%v", registryQuarantine, shareQuarantine)
	}
}

func TestRegistryPersistenceFailuresRollbackMemoryAndBlockShareCreation(t *testing.T) {
	dir := t.TempDir()
	r := newSessionRegistry(dir)
	id, _ := randomToken()
	owner, _ := randomToken()
	r.renameFile = func(string, string) error { return errors.New("rename failed") }
	if err := r.promote(id, owner, time.Now().Add(time.Hour)); err == nil {
		t.Fatal("rename failure accepted")
	}
	if len(r.records) != 0 {
		t.Fatalf("rename failure mutated memory: %v", r.records)
	}

	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	digest := previewDigest(t, s, cookie, "question:7")
	s.registry.renameFile = func(string, string) error { return errors.New("rename failed") }
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("share created without owner proof: %d %s", rr.Code, rr.Body.String())
	}
	entries, _ := filepath.Glob(filepath.Join(s.cfg.SnapshotDir, "*.json"))
	if len(entries) != 0 {
		t.Fatalf("owner persistence failure created public share: %v", entries)
	}
}

func TestRegistryRenameCommitKeepsDiskAndMemoryAlignedWhenDirectorySyncFails(t *testing.T) {
	dir := t.TempDir()
	r := newSessionRegistry(dir)
	id, _ := randomToken()
	owner, _ := randomToken()
	if err := r.promote(id, owner, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, ".sessions"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("registry permissions=%o", info.Mode().Perm())
	}

	r2 := newSessionRegistry(t.TempDir())
	r2.syncDir = func(string) error { return errors.New("dir sync failed") }
	err = r2.promote(id, owner, time.Now().Add(time.Hour))
	var uncertain interface{ DurabilityUncertain() bool }
	if !errors.As(err, &uncertain) || !uncertain.DurabilityUncertain() {
		t.Fatalf("directory sync error=%v, want durability uncertain", err)
	}
	if len(r2.records) != 1 {
		t.Fatalf("rename-committed candidate missing from memory: %v", r2.records)
	}
	reloaded, state, err := loadSessionRegistry(filepath.Dir(r2.path), time.Now())
	if err != nil || state != registryCurrent || len(reloaded.records) != 1 {
		t.Fatalf("rename-committed candidate missing on reload: state=%q records=%v err=%v", state, reloaded.records, err)
	}
}

func TestRegistryCommittedDemotionAndRotationStayAlignedOnDirectorySyncFailure(t *testing.T) {
	t.Run("demotion", func(t *testing.T) {
		r := newSessionRegistry(t.TempDir())
		id, _ := randomToken()
		owner, _ := randomToken()
		if err := r.promote(id, owner, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		r.syncDir = func(string) error { return errors.New("dir sync failed") }
		err := r.removeOwner(owner)
		var uncertain interface{ DurabilityUncertain() bool }
		if !errors.As(err, &uncertain) || len(r.records) != 0 {
			t.Fatalf("committed demotion diverged: records=%v err=%v", r.records, err)
		}
		if _, err := os.Stat(r.path); !os.IsNotExist(err) {
			t.Fatalf("committed demotion left registry file: %v", err)
		}
	})

	t.Run("rotation", func(t *testing.T) {
		r := newSessionRegistry(t.TempDir())
		oldID, _ := randomToken()
		newID, _ := randomToken()
		owner, _ := randomToken()
		if err := r.promote(oldID, owner, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		r.syncDir = func(string) error { return errors.New("dir sync failed") }
		rotated, err := r.rotateIfPromoted(oldID, newID, owner, time.Now().Add(time.Hour))
		var uncertain interface{ DurabilityUncertain() bool }
		if !rotated || !errors.As(err, &uncertain) {
			t.Fatalf("committed rotation result: rotated=%v err=%v", rotated, err)
		}
		if _, oldExists := r.records[sessionHash(oldID)]; oldExists {
			t.Fatalf("committed rotation retained old ID: %v", r.records)
		}
		if _, newExists := r.records[sessionHash(newID)]; !newExists {
			t.Fatalf("committed rotation missing new ID: %v", r.records)
		}
		reloaded, state, reloadErr := loadSessionRegistry(filepath.Dir(r.path), time.Now())
		if reloadErr != nil || state != registryCurrent {
			t.Fatalf("committed rotation did not reload: state=%q err=%v", state, reloadErr)
		}
		if _, oldExists := reloaded.lookup(oldID, time.Now()); oldExists {
			t.Fatal("committed rotation restored old ID after reload")
		}
		if reloadedOwner, newExists := reloaded.lookup(newID, time.Now()); !newExists || reloadedOwner != owner {
			t.Fatalf("committed rotation lost new ID after reload: owner=%q exists=%v", reloadedOwner, newExists)
		}
	})
}

func TestDurabilityUncertainPromotionCannotCreateShareOrLeaveOwnerProof(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	digest := previewDigest(t, s, cookie, "question:7")
	realSync := s.registry.syncDir
	calls := 0
	s.registry.syncDir = func(path string) error {
		calls++
		if calls == 1 {
			return errors.New("dir sync failed")
		}
		return realSync(path)
	}
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("durability-uncertain promotion created share: %d %s", rr.Code, rr.Body.String())
	}
	if len(s.registry.records) != 0 {
		t.Fatalf("orphan owner proof remained in memory: %v", s.registry.records)
	}
	if _, err := os.Stat(filepath.Join(dir, ".sessions")); !os.IsNotExist(err) {
		t.Fatalf("orphan owner proof remained on disk: %v", err)
	}
	if matches, _ := filepath.Glob(filepath.Join(dir, "*.json")); len(matches) != 0 {
		t.Fatalf("durability-uncertain promotion persisted share: %v", matches)
	}
	if restarted := testServer(t, dir); len(restarted.registry.records) != 0 {
		t.Fatalf("orphan owner proof revived after restart: %v", restarted.registry.records)
	}
}

func TestRegistryLoadRepairsFileAndDirectoryPermissions(t *testing.T) {
	dir := t.TempDir()
	r := newSessionRegistry(dir)
	id, _ := randomToken()
	owner, _ := randomToken()
	if err := r.promote(id, owner, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(dir, ".sessions"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, state, err := loadSessionRegistry(dir, time.Now()); err != nil || state != registryCurrent {
		t.Fatalf("reload state=%q err=%v", state, err)
	}
	dirInfo, _ := os.Stat(dir)
	fileInfo, _ := os.Stat(filepath.Join(dir, ".sessions"))
	if dirInfo.Mode().Perm() != 0o700 || fileInfo.Mode().Perm() != 0o600 {
		t.Fatalf("unsafe repaired permissions: dir=%o registry=%o", dirInfo.Mode().Perm(), fileInfo.Mode().Perm())
	}
}

func TestProductionSessionCookieIsSecureAndOAuthCompatible(t *testing.T) {
	s := testServer(t, t.TempDir())
	s.cfg.RedirectURI = "https://example.com/auth/callback"
	cookie := startSession(t, s)
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Domain != "" {
		t.Fatalf("unsafe production OAuth cookie: %+v", cookie)
	}
}

func TestOAuthPromotedSessionKeepsServerIDSoLostResponseCannotStrandShare(t *testing.T) {
	s := testServer(t, t.TempDir())
	transport := &countingOAuthTransport{}
	configureOAuth(s, transport)
	oldDefault := http.DefaultTransport
	http.DefaultTransport = transport
	defer func() { http.DefaultTransport = oldDefault }()
	oldCookie := startSession(t, s)
	installUniverse(t, s, oldCookie, serverUniverse())
	shareID := createShare(t, s, oldCookie, "question:7")
	state := beginOAuth(t, s, oldCookie)
	rr := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=code&state="+url.QueryEscape(state), nil, oldCookie)
	if rr.Code != http.StatusFound {
		t.Fatalf("callback status=%d body=%s", rr.Code, rr.Body.String())
	}
	var responseCookie *http.Cookie
	for _, c := range rr.Result().Cookies() {
		if c.Name == cookieName {
			responseCookie = c
		}
	}
	if responseCookie == nil || responseCookie.Value != oldCookie.Value {
		t.Fatalf("promoted session ID changed: old=%q response=%+v", oldCookie.Value, responseCookie)
	}
	replay := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=second&state="+url.QueryEscape(state), nil, oldCookie)
	if replay.Code < 400 || transport.exchanges.Load() != 1 {
		t.Fatalf("consumed state replayed: status=%d exchanges=%d", replay.Code, transport.exchanges.Load())
	}
	status := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, oldCookie)
	if !strings.Contains(status.Body.String(), `"authorized":true`) || !strings.Contains(status.Body.String(), `"stateVerified":true`) {
		t.Fatalf("promoted session did not receive verified authorization: %s", status.Body.String())
	}

	// Simulate the redirect/Set-Cookie response being lost followed by a process restart.
	restarted := testServer(t, s.cfg.SnapshotDir)
	if deleted := doRequest(t, restarted.Routes(), http.MethodDelete, "/api/share/"+shareID, nil, oldCookie); deleted.Code != http.StatusOK {
		t.Fatalf("lost callback response stranded share after restart: status=%d body=%s", deleted.Code, deleted.Body.String())
	}
}

func TestOAuthUnpromotedSessionStillRotatesAndInvalidatesOldCookie(t *testing.T) {
	s := testServer(t, t.TempDir())
	transport := &countingOAuthTransport{}
	configureOAuth(s, transport)
	oldCookie := startSession(t, s)
	state := beginOAuth(t, s, oldCookie)
	rr := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=code&state="+url.QueryEscape(state), nil, oldCookie)
	if rr.Code != http.StatusFound {
		t.Fatalf("callback status=%d body=%s", rr.Code, rr.Body.String())
	}
	var newCookie *http.Cookie
	for _, c := range rr.Result().Cookies() {
		if c.Name == cookieName {
			newCookie = c
		}
	}
	if newCookie == nil || newCookie.Value == oldCookie.Value {
		t.Fatalf("unpromoted session did not rotate: old=%q new=%+v", oldCookie.Value, newCookie)
	}
	oldStatus := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, oldCookie)
	if strings.Contains(oldStatus.Body.String(), `"authorized":true`) {
		t.Fatalf("old cookie retained authorization: %s", oldStatus.Body.String())
	}
	newStatus := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, newCookie)
	if !strings.Contains(newStatus.Body.String(), `"authorized":true`) || !strings.Contains(newStatus.Body.String(), `"stateVerified":true`) {
		t.Fatalf("rotated session lost verified authorization: %s", newStatus.Body.String())
	}
}

func TestPrivateAndRevocablePublicAPIsNeverCacheResponses(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	paths := []struct {
		method, path string
		body         any
		cookie       *http.Cookie
	}{
		{http.MethodGet, "/api/oauth/status", nil, cookie},
		{http.MethodGet, "/auth/start", nil, cookie},
		{http.MethodGet, "/auth/callback", nil, cookie},
		{http.MethodPost, "/auth/logout", nil, cookie},
		{http.MethodGet, "/api/seed/topics", nil, cookie},
		{http.MethodPost, "/api/seed", map[string]any{}, cookie},
		{http.MethodPost, "/api/universe", nil, cookie},
		{http.MethodGet, "/api/universe", nil, cookie},
		{http.MethodPost, "/api/share", map[string]any{}, cookie},
		{http.MethodPost, "/api/share/preview", map[string]any{}, cookie},
		{http.MethodDelete, "/api/share/missing", nil, cookie},
		{http.MethodGet, "/api/share/missing", nil, nil},
		{http.MethodDelete, "/api/session/data", nil, cookie},
	}
	for _, tc := range paths {
		rr := doRequest(t, s.Routes(), tc.method, tc.path, tc.body, tc.cookie)
		if got := rr.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s %s status=%d Cache-Control=%q", tc.method, tc.path, rr.Code, got)
		}
	}
}

func TestStateChangingRoutesRejectCrossOriginBrowsersBeforeCreatingSession(t *testing.T) {
	s := testServer(t, t.TempDir())
	for _, path := range []string{"/auth/logout", "/api/universe", "/api/share", "/api/share/preview", "/api/seed"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
		req.Header.Set("Origin", "https://attacker.example")
		req.Header.Set("Sec-Fetch-Site", "cross-site")
		rr := httptest.NewRecorder()
		s.Routes().ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("POST %s status=%d", path, rr.Code)
		}
		if got := rr.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("POST %s cache=%q", path, got)
		}
		if len(rr.Result().Cookies()) != 0 {
			t.Errorf("POST %s created session cookie", path)
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.sess) != 0 {
		t.Fatalf("cross-origin requests created %d sessions", len(s.sess))
	}
}

func TestOAuthStatusDoesNotExposeCredentialDiagnostics(t *testing.T) {
	s := testServer(t, t.TempDir())
	for _, credentials := range [][2]string{{"x", "different"}, {"same-secret", "same-secret"}, {"super-secret-app-key", "super-secret-access-secret"}} {
		s.cfg.AppKey, s.cfg.AccessSecret = credentials[0], credentials[1]
		rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
		body := rr.Body.String()
		for _, forbidden := range []string{"credentials", "sha256Prefix", "length", "ZHIHU_OAUTH_APP_KEY", "ZHIHU_ACCESS_SECRET", "APP_KEY_TOO_SHORT", "APP_KEY_USED", "super-secret", "same-secret"} {
			if strings.Contains(body, forbidden) {
				t.Fatalf("OAuth status leaked %q: %s", forbidden, body)
			}
		}
		var response map[string]json.RawMessage
		if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		allowed := map[string]bool{"configured": true, "localOnly": true, "authorized": true, "appId": true, "redirectUri": true, "profile": true, "stateVerified": true, "csrfClaimAllowed": true, "source": true, "warnings": true}
		for key := range response {
			if !allowed[key] {
				t.Fatalf("unexpected OAuth status field %q", key)
			}
		}
	}
}
