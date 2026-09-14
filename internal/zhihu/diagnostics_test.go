package zhihu

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOAuthRequestDiagnosticsDoNotExposeCredentialsOrContent(t *testing.T) {
	var output bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(previous) })
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer private-secret" || r.Header.Get("X-OAuth-Token") != "private-oauth-token" {
			t.Error("diagnostics must preserve both OAuth request credentials")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"Code":90001,"Message":"private-upstream-message","Data":{"Items":[{"Title":"private-title"}]}}`)
	}))
	defer srv.Close()
	c := NewClient("private-secret", "private-oauth-token")
	c.BaseURL, c.HTTP = srv.URL, srv.Client()
	_, err := c.RecentCollections(context.Background())
	if err == nil {
		t.Fatal("diagnostics must not turn an upstream failure into success")
	}
	got := output.String()
	for _, want := range []string{"endpoint=/api/v1/user/collections", "oauth=true", "http=200", "code=90001", "limit=50", "elapsed_ms="} {
		if !strings.Contains(got, want) {
			t.Errorf("missing diagnostic %q in %q", want, got)
		}
	}
	for _, secret := range []string{"private-secret", "private-oauth-token", "private-upstream-message", "private-title"} {
		if strings.Contains(got, secret) {
			t.Errorf("diagnostics leaked private material: %q", secret)
		}
	}
}
