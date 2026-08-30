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
	s.cfg.AppID, s.cfg.AppKey, s.cfg.RedirectURI = "1", "key", "https://example.com/auth/callback"
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
	raw, err := os.ReadFile(filepath.Join(dir, ".sessions"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), cookies[0].Value) {
		t.Fatal("persistent session registry stored the bearer cookie in plaintext")
	}
}

func TestPersistentSessionRegistryIsCapacityBounded(t *testing.T) {
	r := &sessionRegistry{path: filepath.Join(t.TempDir(), ".sessions"), records: map[string]sessionRecord{}, maxRecords: 1}
	a, _ := randomToken()
	b, _ := randomToken()
	if err := r.put(a, "owner-a", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := r.put(b, "owner-b", time.Now().Add(time.Hour)); !errors.Is(err, errSessionCapacity) {
		t.Fatalf("second registry entry error=%v, want capacity", err)
	}
	if len(r.records) != 1 {
		t.Fatalf("registry exceeded bound: %d", len(r.records))
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

func TestOAuthSuccessRotatesSessionAndPreservesOnlyNewCookieOwnership(t *testing.T) {
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
	var newCookie *http.Cookie
	for _, c := range rr.Result().Cookies() {
		if c.Name == cookieName {
			newCookie = c
		}
	}
	if newCookie == nil || newCookie.Value == oldCookie.Value {
		t.Fatalf("session was not rotated: %+v", newCookie)
	}
	replay := doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=second&state="+url.QueryEscape(state), nil, oldCookie)
	if replay.Code < 400 || transport.exchanges.Load() != 1 {
		t.Fatalf("consumed state replayed: status=%d exchanges=%d", replay.Code, transport.exchanges.Load())
	}
	newStatus := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, newCookie)
	if !strings.Contains(newStatus.Body.String(), `"authorized":true`) || !strings.Contains(newStatus.Body.String(), `"stateVerified":true`) {
		t.Fatalf("new session did not receive verified authorization: %s", newStatus.Body.String())
	}
	oldStatus := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, oldCookie)
	if strings.Contains(oldStatus.Body.String(), `"authorized":true`) {
		t.Fatalf("old cookie retained authorization: %s", oldStatus.Body.String())
	}
	if deleted := doRequest(t, s.Routes(), http.MethodDelete, "/api/share/"+shareID, nil, oldCookie); deleted.Code != http.StatusNotFound {
		t.Fatalf("old cookie retained share ownership: status=%d", deleted.Code)
	}
	if deleted := doRequest(t, s.Routes(), http.MethodDelete, "/api/share/"+shareID, nil, newCookie); deleted.Code != http.StatusOK {
		t.Fatalf("rotated cookie lost share ownership: status=%d body=%s", deleted.Code, deleted.Body.String())
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
	s.cfg.AppKey = "super-secret-app-key"
	s.cfg.AccessSecret = "super-secret-access-secret"
	rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
	body := rr.Body.String()
	for _, forbidden := range []string{"credentials", "sha256Prefix", "length", "ZHIHU_OAUTH_APP_KEY", "ZHIHU_ACCESS_SECRET", "super-secret"} {
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
