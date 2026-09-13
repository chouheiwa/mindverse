package zhihu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// openapi.zhihu.com/user 只认 OAuth access token。旧实现发的是 Access Secret 加
// X-OAuth-Token 与 X-Request-Timestamp，服务端不认，而失败被降级成 nil，所以
// 这个接口从来没成功过也没人发现。这条用例钉住请求形态。
func TestProfileSendsOnlyOAuthBearer(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"fullname": "阿岛", "uid": 969570047710216200})
	}))
	defer srv.Close()

	c := NewClient("secret-must-not-be-sent", "oauth-token")
	c.BaseURL = srv.URL
	if p := c.Profile(context.Background()); p == nil {
		t.Fatal("Profile 应当解析成功")
	}
	if want := "Bearer oauth-token"; got.Get("Authorization") != want {
		t.Fatalf("Authorization = %q, want %q", got.Get("Authorization"), want)
	}
	for _, h := range []string{"X-OAuth-Token", "X-Request-Timestamp"} {
		if v := got.Get(h); v != "" {
			t.Errorf("%s 不该出现在该接口，实际 %q", h, v)
		}
	}
}

// 没有 OAuth token 时不该拿 Access Secret 去试，直接降级。
func TestProfileWithoutOAuthTokenDegrades(t *testing.T) {
	var called bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient("secret", "")
	c.BaseURL = srv.URL
	if p := c.Profile(context.Background()); p != nil {
		t.Fatalf("应降级为 nil，实际 %+v", p)
	}
	if called {
		t.Error("不该发出请求")
	}
}

// 文档字段是 fullname 与 avatar_path；旧实现取的 name 与 avatar_url 只作兼容回退。
func TestProfileParsesDocumentedFields(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantName   string
		wantAvatar string
	}{
		{"文档字段", `{"fullname":"阿岛","avatar_path":"https://pic/a.jpg"}`, "阿岛", "https://pic/a.jpg"},
		{"旧字段回退", `{"name":"Alice","avatar_url":"https://pic/b.jpg"}`, "Alice", "https://pic/b.jpg"},
		{"同时出现时以文档字段为准", `{"fullname":"阿岛","name":"Alice"}`, "阿岛", ""},
		{"data 包裹", `{"data":{"fullname":"阿岛"}}`, "阿岛", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			c := NewClient("secret", "token")
			c.BaseURL = srv.URL
			p := c.Profile(context.Background())
			if p == nil {
				t.Fatal("应解析成功")
			}
			if p.Name != tc.wantName {
				t.Errorf("Name = %q, want %q", p.Name, tc.wantName)
			}
			if p.AvatarURL != tc.wantAvatar {
				t.Errorf("AvatarURL = %q, want %q", p.AvatarURL, tc.wantAvatar)
			}
		})
	}
}

// uid 是 int64，超出 JavaScript 安全整数范围；必须按字面量无损保留。
func TestProfileKeepsUIDLossless(t *testing.T) {
	const uid = "969570047710216200" // > 2^53
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"uid":` + uid + `,"hash_id":"0e4f7a","fullname":"阿岛"}`))
	}))
	defer srv.Close()
	c := NewClient("secret", "token")
	c.BaseURL = srv.URL
	p := c.Profile(context.Background())
	if p == nil {
		t.Fatal("应解析成功")
	}
	if p.UID != uid {
		t.Errorf("UID = %q, want %q（经 float64 会变成 969570047710216192）", p.UID, uid)
	}
	if p.HashID != "0e4f7a" {
		t.Errorf("HashID = %q", p.HashID)
	}
}

// HTTP 200 但业务失败：{"code":404,"data":"User don't exist"}，不能据此建立会话。
func TestProfileRejectsBusinessError(t *testing.T) {
	for _, body := range []string{
		`{"code":404,"data":"User don't exist"}`,
		`{"fullname":"","uid":0}`,
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(body))
		}))
		c := NewClient("secret", "token")
		c.BaseURL = srv.URL
		if p := c.Profile(context.Background()); p != nil {
			t.Errorf("body %s 应降级为 nil，实际 %+v", body, p)
		}
		srv.Close()
	}
}

// 非 2xx 一律降级，不能只看响应体。
func TestProfileRejectsNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"fullname":"阿岛"}`))
	}))
	defer srv.Close()
	c := NewClient("secret", "token")
	c.BaseURL = srv.URL
	if p := c.Profile(context.Background()); p != nil {
		t.Errorf("401 应降级为 nil，实际 %+v", p)
	}
}
