package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/share"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

func testServer(t *testing.T, dir string) *Server {
	t.Helper()
	s, err := New(&config.Config{SnapshotDir: dir, WebDir: t.TempDir()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func doRequest(t *testing.T, h http.Handler, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var raw bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&raw).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &raw)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func startSession(t *testing.T, s *Server) *http.Cookie {
	t.Helper()
	rr := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
	for _, cookie := range rr.Result().Cookies() {
		if cookie.Name == cookieName {
			return cookie
		}
	}
	t.Fatal("session cookie not set")
	return nil
}

func installUniverse(t *testing.T, s *Server, cookie *http.Cookie, u *engine.Universe) {
	t.Helper()
	s.mu.Lock()
	sess := s.sess[cookie.Value]
	s.mu.Unlock()
	if sess == nil {
		t.Fatal("test session not found")
	}
	sess.mu.Lock()
	sess.gen = generation{State: genDone, Universe: u}
	sess.mu.Unlock()
}

func serverUniverse() *engine.Universe {
	return &engine.Universe{
		SchemaVersion: engine.CurrentSchemaVersion, AnalysisVersion: engine.CurrentAnalysisVersion,
		Questions: []engine.QuestionPlanet{
			{ID: "question:7", QuestionID: "7", Title: "Question seven", URL: "https://www.zhihu.com/question/7", AnswerIDs: []string{"answer:8"}},
			{ID: "question:9", QuestionID: "9", Title: "Question nine", URL: "https://www.zhihu.com/question/9"},
		},
		Answers: []engine.AnswerSatellite{{ID: "answer:8", QuestionID: "question:7", Title: "Answer eight", URL: "https://www.zhihu.com/question/7/answer/8"}},
	}
}

func decodeView(t *testing.T, rr *httptest.ResponseRecorder) share.ShareView {
	t.Helper()
	var view share.ShareView
	if err := json.Unmarshal(rr.Body.Bytes(), &view); err != nil {
		t.Fatalf("decode share view: %v; body=%s", err, rr.Body.String())
	}
	return view
}

func createShare(t *testing.T, s *Server, cookie *http.Cookie, ids ...string) string {
	t.Helper()
	digest := previewDigest(t, s, cookie, ids...)
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": ids, "digest": digest}, cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("create share status=%d body=%s", rr.Code, rr.Body.String())
	}
	var response struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil || response.ID == "" {
		t.Fatalf("invalid create response: %v %s", err, rr.Body.String())
	}
	return response.ID
}

func previewDigest(t *testing.T, s *Server, cookie *http.Cookie, ids ...string) string {
	t.Helper()
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share/preview", share.ShareSelection{QuestionIDs: ids}, cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("preview status=%d body=%s", rr.Code, rr.Body.String())
	}
	var response struct {
		Digest string `json:"digest"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil || response.Digest == "" {
		t.Fatalf("preview digest missing: %v %s", err, rr.Body.String())
	}
	return response.Digest
}

func TestSharePreviewAndCreateUseSameServerBuiltView(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	selection := share.ShareSelection{QuestionIDs: []string{"question:7"}}

	previewResponse := doRequest(t, s.Routes(), http.MethodPost, "/api/share/preview", selection, cookie)
	if previewResponse.Code != http.StatusOK {
		t.Fatalf("preview status=%d body=%s", previewResponse.Code, previewResponse.Body.String())
	}
	preview := decodeView(t, previewResponse)
	if len(preview.Questions) != 1 || preview.Questions[0].ID != "question:7" {
		t.Fatalf("wrong preview: %+v", preview)
	}

	var previewEnvelope struct {
		Digest string `json:"digest"`
	}
	_ = json.Unmarshal(previewResponse.Body.Bytes(), &previewEnvelope)
	if previewEnvelope.Digest == "" {
		t.Fatal("preview did not include consent digest")
	}
	id := createShare(t, s, cookie, "question:7")
	publicResponse := doRequest(t, s.Routes(), http.MethodGet, "/api/share/"+id, nil, nil)
	if publicResponse.Code != http.StatusOK {
		t.Fatalf("public get status=%d body=%s", publicResponse.Code, publicResponse.Body.String())
	}
	if got := decodeView(t, publicResponse); !reflect.DeepEqual(got, preview) {
		t.Fatalf("persisted public bytes differ semantically from preview:\npreview=%+v\npublic=%+v", preview, got)
	}
}

func TestShareCreateRejectsStalePreviewDigest(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	digest := previewDigest(t, s, cookie, "question:7")
	s.mu.Lock()
	sess := s.sess[cookie.Value]
	s.mu.Unlock()
	sess.mu.Lock()
	sess.gen.Universe.Questions[0].Title = "Changed title"
	sess.mu.Unlock()
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
	if rr.Code != http.StatusConflict {
		t.Fatalf("stale preview status=%d body=%s", rr.Code, rr.Body.String())
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			t.Fatalf("stale preview persisted %s", entry.Name())
		}
	}
}

func TestShareRequestRejectsDuplicateKeysAndOversize(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	for _, body := range []string{
		`{"questionIds":["question:7"],"questionIds":["question:9"]}`,
		`{"digest":"a","digest":"b","questionIds":["question:7"]}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/share/preview", strings.NewReader(body))
		req.AddCookie(cookie)
		rr := httptest.NewRecorder()
		s.Routes().ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("duplicate keys status=%d body=%s", rr.Code, rr.Body.String())
		}
	}
	oversize := `{"questionIds":["` + strings.Repeat("x", 70<<10) + `"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/share/preview", strings.NewReader(oversize))
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	s.Routes().ServeHTTP(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestSessionOwnershipCookieLastsThroughShareTTL(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	if cookie.MaxAge < int(share.TTL/time.Second) {
		t.Fatalf("ownership cookie lasts %s, share lasts %s", time.Duration(cookie.MaxAge)*time.Second, share.TTL)
	}
	if time.Until(cookie.Expires) < share.TTL-time.Minute {
		t.Fatalf("ownership cookie expiry %s is shorter than share TTL", cookie.Expires)
	}
	if cookie.Domain != "" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("ownership cookie lost host-only security attributes: %+v", cookie)
	}
	// Every recognized protected request rolls the ownership window forward, so a share
	// created late in the session remains deletable for its full TTL.
	refreshed := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, cookie).Result().Cookies()
	if len(refreshed) == 0 || refreshed[0].MaxAge < int(share.TTL/time.Second) || time.Until(refreshed[0].Expires) < share.TTL-time.Minute {
		t.Fatalf("recognized ownership cookie was not refreshed: %+v", refreshed)
	}
}

func TestSessionLookupEvictsIdleSessionsBeyondShareTTL(t *testing.T) {
	s := testServer(t, t.TempDir())
	oldID, _ := randomToken()
	s.mu.Lock()
	s.sess[oldID] = &session{id: oldID, lastSeen: time.Now().Add(-share.TTL - time.Minute)}
	s.mu.Unlock()
	_ = startSession(t, s)
	s.mu.Lock()
	_, exists := s.sess[oldID]
	s.mu.Unlock()
	if exists {
		t.Fatal("idle session beyond ownership TTL was not evicted")
	}
}

func TestPublicRoutesDoNotCreateSessions(t *testing.T) {
	s := testServer(t, t.TempDir())
	for _, path := range []string{"/api/health", "/api/share/missing", "/", "/s/missing"} {
		_ = doRequest(t, s.Routes(), http.MethodGet, path, nil, nil)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.sess) != 0 {
		t.Fatalf("public requests created %d sessions", len(s.sess))
	}
}

func TestSessionCleanupIsThrottledAndCeilingBounded(t *testing.T) {
	s := testServer(t, t.TempDir())
	s.maxSessions = 3
	runs := 0
	s.onSessionCleanup = func() { runs++ }
	for i := 0; i < 10; i++ {
		_ = doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if runs != 1 {
		t.Fatalf("cleanup scanned %d times", runs)
	}
	if len(s.sess) > s.maxSessions {
		t.Fatalf("session ceiling exceeded: %d", len(s.sess))
	}
}

func TestSessionCeilingNeverEvictsActiveLease(t *testing.T) {
	s := testServer(t, t.TempDir())
	s.maxSessions = 1
	cookie := startSession(t, s)
	entered, release := make(chan struct{}), make(chan struct{})
	held := s.withSession(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(entered)
		<-release
	}))
	done := make(chan struct{})
	go func() {
		_ = doRequest(t, held, http.MethodGet, "/held", nil, cookie)
		close(done)
	}()
	<-entered
	refused := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
	if refused.Code != http.StatusServiceUnavailable {
		t.Fatalf("all-active ceiling status=%d body=%s", refused.Code, refused.Body.String())
	}
	s.mu.Lock()
	kept := s.sess[cookie.Value]
	s.mu.Unlock()
	if kept == nil {
		t.Fatal("active session was evicted")
	}
	close(release)
	<-done
}

type blockingProvider struct{ corpus *zhihu.Corpus }

func (p blockingProvider) Fetch(context.Context) (*zhihu.Corpus, error) { return p.corpus, nil }
func (p blockingProvider) Kind() string                                 { return "test" }

type blockingExtractor struct {
	entered chan struct{}
	release chan struct{}
}

func (e *blockingExtractor) Extract(ctx context.Context, items []zhihu.Item) ([][]string, error) {
	close(e.entered)
	select {
	case <-e.release:
		out := make([][]string, len(items))
		for i := range out {
			out[i] = []string{"Concept A", "Concept B", "Concept C"}
		}
		return out, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
func (*blockingExtractor) NameCluster(context.Context, []string, []string) (string, error) {
	return "Cluster", nil
}

func TestWipeInvalidatesRunningGeneration(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	extractor := &blockingExtractor{entered: make(chan struct{}), release: make(chan struct{})}
	s.ext = extractor
	items := make([]zhihu.Item, 30)
	for i := range items {
		items[i] = zhihu.Item{Title: "Item", URL: "https://example.com"}
	}
	s.mu.Lock()
	sess := s.sess[cookie.Value]
	s.mu.Unlock()
	sess.mu.Lock()
	sess.gen = generation{State: genRunning}
	sess.mu.Unlock()
	done := make(chan struct{})
	go func() {
		s.generate(sess, blockingProvider{corpus: &zhihu.Corpus{Items: items}})
		close(done)
	}()
	<-extractor.entered
	wiped := doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, cookie)
	if wiped.Code != http.StatusOK {
		t.Fatalf("wipe status=%d", wiped.Code)
	}
	close(extractor.release)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("generation did not terminate")
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.gen.Universe != nil || sess.gen.State != "" {
		t.Fatalf("stale generation restored state after wipe: %+v", sess.gen)
	}
}

func TestBackgroundGenerationLeasePreventsEvictionUntilResultVisible(t *testing.T) {
	s := testServer(t, t.TempDir())
	s.maxSessions = 1
	owner := startSession(t, s)
	extractor := &blockingExtractor{entered: make(chan struct{}), release: make(chan struct{})}
	s.ext = extractor
	items := make([]zhihu.Item, 30)
	for i := range items {
		items[i] = zhihu.Item{Title: fmt.Sprintf("Item %d", i), URL: fmt.Sprintf("https://example.com/%d", i)}
	}
	s.mu.Lock()
	sess := s.sess[owner.Value]
	s.mu.Unlock()
	sess.mu.Lock()
	sess.gen = generation{State: genRunning}
	sess.mu.Unlock()
	done := make(chan struct{})
	go func() { s.generate(sess, blockingProvider{corpus: &zhihu.Corpus{Items: items}}); close(done) }()
	<-extractor.entered
	pressure := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil)
	if pressure.Code != http.StatusServiceUnavailable {
		close(extractor.release)
		<-done
		t.Fatalf("background generation session was evicted: status=%d", pressure.Code)
	}
	close(extractor.release)
	<-done
	visible := doRequest(t, s.Routes(), http.MethodGet, "/api/universe", nil, owner)
	if visible.Code != http.StatusOK || !strings.Contains(visible.Body.String(), `"state":"done"`) {
		t.Fatalf("completed result not visible: status=%d body=%s", visible.Code, visible.Body.String())
	}
	if next := doRequest(t, s.Routes(), http.MethodGet, "/api/oauth/status", nil, nil); next.Code != http.StatusOK {
		t.Fatalf("completed generation lease was not released: status=%d", next.Code)
	}
}

type blockingOAuthTransport struct {
	entered  chan struct{}
	release  chan struct{}
	profiles atomic.Int32
}

func (b *blockingOAuthTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if strings.HasSuffix(request.URL.Path, "/access_token") {
		close(b.entered)
		<-b.release
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"access_token":"secret","expires_in":3600}`)), Request: request}, nil
	}
	b.profiles.Add(1)
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":{"name":"Alice"}}`)), Request: request}, nil
}

func TestWipeInvalidatesOAuthCallbackCommit(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	s.oauth.AppID, s.oauth.AppKey, s.oauth.RedirectURI = "1", "key", "https://example.com/callback"
	transport := &blockingOAuthTransport{entered: make(chan struct{}), release: make(chan struct{})}
	s.oauth.HTTP = &http.Client{Transport: transport}
	oldTransport := http.DefaultTransport
	http.DefaultTransport = transport
	defer func() { http.DefaultTransport = oldTransport }()

	s.mu.Lock()
	sess := s.sess[cookie.Value]
	s.mu.Unlock()
	sess.mu.Lock()
	sess.state = "expected-state"
	sess.mu.Unlock()

	callbackDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		callbackDone <- doRequest(t, s.Routes(), http.MethodGet, "/auth/callback?authorization_code=code&state=expected-state", nil, cookie)
	}()
	<-transport.entered
	if wiped := doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, cookie); wiped.Code != http.StatusOK {
		t.Fatalf("wipe status=%d body=%s", wiped.Code, wiped.Body.String())
	}
	close(transport.release)
	callback := <-callbackDone
	if got := transport.profiles.Load(); got != 0 {
		t.Fatalf("wipe allowed %d authenticated profile calls after exchange", got)
	}
	if callback.Code != http.StatusConflict {
		t.Fatalf("stale callback status=%d body=%s", callback.Code, callback.Body.String())
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.token != nil || sess.profile != nil || sess.state != "" {
		t.Fatalf("stale OAuth callback restored credentials: token=%v profile=%v state=%q", sess.token, sess.profile, sess.state)
	}
}

type blockingShareStore struct {
	real    *share.Store
	entered chan struct{}
	release chan struct{}
}

func (b *blockingShareStore) Create(owner string, view share.ShareView) (*share.Record, error) {
	close(b.entered)
	<-b.release
	return b.real.Create(owner, view)
}
func (b *blockingShareStore) Load(id string) (*share.Record, error) { return b.real.Load(id) }
func (b *blockingShareStore) DeleteOwned(id, owner string) error {
	return b.real.DeleteOwned(id, owner)
}
func (b *blockingShareStore) DeleteAllOwned(owner string) error { return b.real.DeleteAllOwned(owner) }

func TestWipeSerializesAgainstShareCreate(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	digest := previewDigest(t, s, cookie, "question:7")
	real := s.store.(*share.Store)
	blocking := &blockingShareStore{real: real, entered: make(chan struct{}), release: make(chan struct{})}
	s.store = blocking
	created := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		created <- doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
	}()
	<-blocking.entered
	wiped := make(chan *httptest.ResponseRecorder, 1)
	go func() { wiped <- doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, cookie) }()
	close(blocking.release)
	if rr := <-created; rr.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr := <-wiped; rr.Code != http.StatusOK {
		t.Fatalf("wipe status=%d body=%s", rr.Code, rr.Body.String())
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			t.Fatalf("share survived linearized wipe: %s", entry.Name())
		}
	}
}

func TestCapacityPressureCannotReplaceInFlightShareSession(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	s.maxSessions = 2
	owner := startSession(t, s)
	installUniverse(t, s, owner, serverUniverse())
	digest := previewDigest(t, s, owner, "question:7")
	real := s.store.(*share.Store)
	blocking := &blockingShareStore{real: real, entered: make(chan struct{}), release: make(chan struct{})}
	s.store = blocking
	s.mu.Lock()
	original := s.sess[owner.Value]
	s.mu.Unlock()
	original.mu.Lock()
	original.lastSeen = time.Now().Add(-time.Hour)
	original.state = "active-auth-state"
	original.mu.Unlock()
	created := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		created <- doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, owner)
	}()
	<-blocking.entered
	_ = startSession(t, s)
	_ = startSession(t, s)
	s.mu.Lock()
	kept := s.sess[owner.Value]
	s.mu.Unlock()
	if kept != original {
		close(blocking.release)
		<-created
		t.Fatal("capacity pressure replaced an in-flight session object")
	}
	wipeLeased := make(chan struct{})
	s.onSessionLease = func(sess *session) {
		if sess == original {
			close(wipeLeased)
		}
	}
	wiped := make(chan *httptest.ResponseRecorder, 1)
	go func() { wiped <- doRequest(t, s.Routes(), http.MethodDelete, "/api/session/data", nil, owner) }()
	<-wipeLeased
	select {
	case rr := <-wiped:
		close(blocking.release)
		<-created
		t.Fatalf("wipe bypassed in-flight session lock: status=%d", rr.Code)
	default:
	}
	close(blocking.release)
	if rr := <-created; rr.Code != http.StatusOK {
		t.Fatalf("create status=%d", rr.Code)
	}
	if rr := <-wiped; rr.Code != http.StatusOK {
		t.Fatalf("wipe status=%d", rr.Code)
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			t.Fatalf("share survived wipe: %s", entry.Name())
		}
	}
	original.mu.Lock()
	defer original.mu.Unlock()
	if original.state != "" {
		t.Fatalf("wipe did not clear active auth state: %q", original.state)
	}
}

func TestShareCreateReturnsQuotaStatus(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())
	digest := previewDigest(t, s, cookie, "question:7")
	for i := 0; i < share.MaxActivePerOwner; i++ {
		rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
		if rr.Code != http.StatusOK {
			t.Fatalf("create %d status=%d", i, rr.Code)
		}
	}
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", map[string]any{"questionIds": []string{"question:7"}, "digest": digest}, cookie)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("quota status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestShareEmptyAndUnknownSelectionAreRejected(t *testing.T) {
	s := testServer(t, t.TempDir())
	cookie := startSession(t, s)
	installUniverse(t, s, cookie, serverUniverse())

	emptyPreview := doRequest(t, s.Routes(), http.MethodPost, "/api/share/preview", share.ShareSelection{}, cookie)
	if emptyPreview.Code != http.StatusOK || len(decodeView(t, emptyPreview).Questions) != 0 {
		t.Fatalf("empty preview status=%d body=%s", emptyPreview.Code, emptyPreview.Body.String())
	}
	emptyCreate := doRequest(t, s.Routes(), http.MethodPost, "/api/share", share.ShareSelection{}, cookie)
	if emptyCreate.Code != http.StatusBadRequest {
		t.Fatalf("empty create status=%d body=%s", emptyCreate.Code, emptyCreate.Body.String())
	}
	unknown := doRequest(t, s.Routes(), http.MethodPost, "/api/share/preview", share.ShareSelection{QuestionIDs: []string{"question:missing"}}, cookie)
	if unknown.Code != http.StatusBadRequest {
		t.Fatalf("unknown selection status=%d body=%s", unknown.Code, unknown.Body.String())
	}
}

func TestShareDeleteRequiresOwnerAndSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	owner := startSession(t, s)
	other := startSession(t, s)
	installUniverse(t, s, owner, serverUniverse())
	id := createShare(t, s, owner, "question:7")

	// Simulate the browser retaining the ownership cookie beyond the old
	// eight-hour authentication window, but still within the share TTL.
	owner.MaxAge = int((share.TTL - 9*time.Hour) / time.Second)
	owner.Expires = time.Now().Add(share.TTL - 9*time.Hour)
	restarted := testServer(t, dir)
	nonOwnerDelete := doRequest(t, restarted.Routes(), http.MethodDelete, "/api/share/"+id, nil, other)
	if nonOwnerDelete.Code != http.StatusNotFound {
		t.Fatalf("non-owner status=%d body=%s", nonOwnerDelete.Code, nonOwnerDelete.Body.String())
	}
	if got := doRequest(t, restarted.Routes(), http.MethodGet, "/api/share/"+id, nil, nil); got.Code != http.StatusOK {
		t.Fatalf("non-owner removed share: status=%d body=%s", got.Code, got.Body.String())
	}
	ownerDelete := doRequest(t, restarted.Routes(), http.MethodDelete, "/api/share/"+id, nil, owner)
	if ownerDelete.Code != http.StatusOK {
		t.Fatalf("owner delete status=%d body=%s", ownerDelete.Code, ownerDelete.Body.String())
	}
	if got := doRequest(t, restarted.Routes(), http.MethodGet, "/api/share/"+id, nil, nil); got.Code != http.StatusNotFound {
		t.Fatalf("single delete did not persist: status=%d", got.Code)
	}
}

func TestShareDeleteTraversalReturnsNotFoundAndPreservesOutsideFile(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "shares")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside.json")
	if err := os.WriteFile(outside, []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	s := testServer(t, dir)
	cookie := startSession(t, s)
	rr := doRequest(t, s.Routes(), http.MethodDelete, "/api/share/%2e%2e%2foutside", nil, cookie)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("traversal status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got, err := os.ReadFile(outside); err != nil || string(got) != "private" {
		t.Fatalf("outside file changed: %q err=%v", got, err)
	}
}

type loadErrorStore struct{ err error }

func (l loadErrorStore) Create(string, share.ShareView) (*share.Record, error) { return nil, l.err }
func (l loadErrorStore) Load(string) (*share.Record, error)                    { return nil, l.err }
func (l loadErrorStore) DeleteOwned(string, string) error                      { return l.err }
func (l loadErrorStore) DeleteAllOwned(string) error                           { return l.err }

func TestPublicShareGetHidesInternalLoadErrors(t *testing.T) {
	s := testServer(t, t.TempDir())
	s.store = loadErrorStore{err: errors.New("read /secret/path: permission denied")}
	rr := doRequest(t, s.Routes(), http.MethodGet, "/api/share/public_id", nil, nil)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "secret") || strings.Contains(rr.Body.String(), "permission") {
		t.Fatalf("internal load error leaked: %s", rr.Body.String())
	}
}

func TestDeleteSessionDataCascadesOwnedSharesAfterRestart(t *testing.T) {
	dir := t.TempDir()
	s := testServer(t, dir)
	owner := startSession(t, s)
	other := startSession(t, s)
	installUniverse(t, s, owner, serverUniverse())
	installUniverse(t, s, other, serverUniverse())
	owned := []string{createShare(t, s, owner, "question:7"), createShare(t, s, owner, "question:9")}
	otherID := createShare(t, s, other, "question:7")

	restarted := testServer(t, dir)
	wiped := doRequest(t, restarted.Routes(), http.MethodDelete, "/api/session/data", nil, owner)
	if wiped.Code != http.StatusOK {
		t.Fatalf("wipe status=%d body=%s", wiped.Code, wiped.Body.String())
	}
	for _, id := range owned {
		if got := doRequest(t, restarted.Routes(), http.MethodGet, "/api/share/"+id, nil, nil); got.Code != http.StatusNotFound {
			t.Fatalf("owned share %s survived wipe: status=%d", id, got.Code)
		}
	}
	if got := doRequest(t, restarted.Routes(), http.MethodGet, "/api/share/"+otherID, nil, nil); got.Code != http.StatusOK {
		t.Fatalf("other owner's share was removed: status=%d body=%s", got.Code, got.Body.String())
	}
}
