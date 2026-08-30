package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/share"
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
	rr := doRequest(t, s.Routes(), http.MethodGet, "/api/health", nil, nil)
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
	rr := doRequest(t, s.Routes(), http.MethodPost, "/api/share", share.ShareSelection{QuestionIDs: ids}, cookie)
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

	id := createShare(t, s, cookie, "question:7")
	publicResponse := doRequest(t, s.Routes(), http.MethodGet, "/api/share/"+id, nil, nil)
	if publicResponse.Code != http.StatusOK {
		t.Fatalf("public get status=%d body=%s", publicResponse.Code, publicResponse.Body.String())
	}
	if got := decodeView(t, publicResponse); !reflect.DeepEqual(got, preview) {
		t.Fatalf("persisted public bytes differ semantically from preview:\npreview=%+v\npublic=%+v", preview, got)
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
