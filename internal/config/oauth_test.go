package config

import "testing"

func TestRedirectClassificationUsesParsedHostAndScheme(t *testing.T) {
	tests := []struct {
		name, uri    string
		local, ready bool
	}{
		{"empty", "", true, false},
		{"localhost preview", "http://localhost:4173/auth/callback", true, false},
		{"localhost trailing dot preview", "http://LOCALHOST.:4173/auth/callback", true, false},
		{"ipv4 preview", "http://127.0.0.1:4173/auth/callback", true, false},
		{"ipv6 preview", "http://[::1]:4173/auth/callback", true, false},
		{"https production", "https://app.example/auth/callback", false, true},
		{"public http", "http://app.example/auth/callback", false, false},
		{"localhost substring", "https://localhost.evil.example/auth/callback", false, true},
		{"localhost in path", "https://app.example/localhost/callback", false, true},
		{"userinfo", "https://user@app.example/auth/callback", false, false},
		{"missing host", "https:///auth/callback", false, false},
		{"invalid leading hyphen", "https://-bad.example/auth/callback", false, false},
		{"invalid underscore", "https://bad_host.example/auth/callback", false, false},
		{"invalid empty label", "https://bad..example/auth/callback", false, false},
		{"loopback https", "https://127.0.0.1/auth/callback", false, false},
		{"localhost trailing dot production", "https://localhost./auth/callback", false, false},
		{"noncanonical loopback", "https://127.1/auth/callback", false, false},
		{"integer loopback", "https://2130706433/auth/callback", false, false},
		{"fragment", "https://app.example/auth/callback#token", false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := Config{AppID: "id", AppKey: "key", AccessSecret: "secret", RedirectURI: tc.uri}
			if got := cfg.LocalOnly(); got != tc.local {
				t.Errorf("LocalOnly=%v want %v", got, tc.local)
			}
			if got := cfg.OAuthReady(); got != tc.ready {
				t.Errorf("OAuthReady=%v want %v", got, tc.ready)
			}
		})
	}
}
