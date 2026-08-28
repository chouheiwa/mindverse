package zhihu

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OAuth 承载第三方应用的 OAuth 配置。
//
// 三个凭证职责完全不同，混填是官方文档专门警告的高频错误：
//   - AppID        短数字，可公开，写进项目配置
//   - AppKey       较长字符串，只在后端换 token，走环境变量/密钥库
//   - AccessSecret 开放平台调用方密钥，用于用户数据接口的 Authorization
type OAuth struct {
	AppID       string
	AppKey      string
	RedirectURI string
	HTTP        *http.Client
}

// AuthorizeURL 构造授权页地址。
//
// state 按标准 OAuth 传出，但实测回调不一定带回 —— 见 VerifyState。
func (o *OAuth) AuthorizeURL(state string) (string, error) {
	if o.RedirectURI == "" {
		return "", fmt.Errorf("本地地址无法完成知乎登录，请先部署并配置公网 HTTPS 回调")
	}
	if o.AppID == "" {
		return "", fmt.Errorf("OAuth App ID 未配置")
	}
	u, err := url.Parse(openBase + "/authorize")
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("redirect_uri", o.RedirectURI)
	q.Set("app_id", o.AppID)
	q.Set("response_type", "code")
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// CodeFromCallback 从回调 query 中取出授权码。
//
// 实测回调参数名是 authorization_code，不是旧文档写的 code；
// 为兼容可能的协议修订，同时接受 code，但以 authorization_code 为主路径。
func CodeFromCallback(q url.Values) string {
	if v := strings.TrimSpace(q.Get("authorization_code")); v != "" {
		return v
	}
	return strings.TrimSpace(q.Get("code"))
}

// VerifyState 比较回调带回的 state 与会话中存的 state。
//
// 返回 (通过, 是否真的校验了)。实测回调可能完全不返回 state，
// 此时 checked=false —— 界面必须显示「仅适合黑客松联调」，
// 不得宣称通过了标准 OAuth CSRF 校验。
func VerifyState(returned, expected string) (ok bool, checked bool) {
	if returned == "" {
		return true, false
	}
	if len(returned) != len(expected) {
		return false, true
	}
	return subtle.ConstantTimeCompare([]byte(returned), []byte(expected)) == 1, true
}

// Token 是换取到的用户 OAuth 令牌。
//
// 协议当前没有 refresh token，也没有撤销接口：过期只能重新授权。
type Token struct {
	AccessToken string
	TokenType   string
	ExpiresAt   time.Time
}

// Expired 报告令牌是否已过期。
func (t Token) Expired() bool { return !t.ExpiresAt.IsZero() && time.Now().After(t.ExpiresAt) }

type tokenResp struct {
	AccessToken string          `json:"access_token"`
	TokenType   string          `json:"token_type"`
	ExpiresIn   int64           `json:"expires_in"`
	Code        int             `json:"code"`
	Message     string          `json:"message"`
	Data        json.RawMessage `json:"data"`
}

// Exchange 用授权码换取用户 OAuth token。
//
// 表单字段名仍是 code（承载回调里的 authorization_code 值），
// grant_type 是接口固定枚举值，不从回调读取。
func (o *OAuth) Exchange(ctx context.Context, code string) (*Token, error) {
	if o.AppKey == "" {
		return nil, fmt.Errorf("OAuth App Key 未配置")
	}
	form := url.Values{}
	form.Set("app_id", o.AppID)
	form.Set("app_key", o.AppKey)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", o.RedirectURI)
	form.Set("code", code)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		openBase+"/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	cl := o.HTTP
	if cl == nil {
		cl = &http.Client{Timeout: 20 * time.Second}
	}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, fmt.Errorf("换取 token 失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var tr tokenResp
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("知乎开放平台返回了无法解析的响应")
	}
	tok, exp := tr.AccessToken, tr.ExpiresIn
	if tok == "" && len(tr.Data) > 0 {
		var inner tokenResp
		if json.Unmarshal(tr.Data, &inner) == nil {
			tok, exp = inner.AccessToken, inner.ExpiresIn
		}
	}
	if tok == "" {
		// 业务字段 code:20000 表示成功；不要把它当错误。
		msg := tr.Message
		if msg == "" {
			msg = "未获得 OAuth access token"
		}
		return nil, fmt.Errorf("换取 token 失败: %s", truncate(msg, 200))
	}
	t := &Token{AccessToken: tok, TokenType: tr.TokenType}
	if exp > 0 {
		t.ExpiresAt = time.Now().Add(time.Duration(exp) * time.Second)
	}
	return t, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func fingerprint(s string) string {
	if s == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:12]
}

// CredentialDiagnostic 是可安全外发的凭证诊断，只含长度与哈希前缀。
type CredentialDiagnostic struct {
	Source       string `json:"source"`
	Configured   bool   `json:"configured"`
	Length       int    `json:"length"`
	SHA256Prefix string `json:"sha256Prefix"`
}

// CredentialWarning 指出凭证串位风险。
type CredentialWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Diagnose 生成脱敏诊断与串位告警。
//
// 绝不输出完整 App Key、Access Secret、authorization code 或 access token。
func Diagnose(appID, appKey, accessSecret string) (appKeyDiag, secretDiag CredentialDiagnostic, warns []CredentialWarning) {
	appKeyDiag = CredentialDiagnostic{
		Source: "env:ZHIHU_OAUTH_APP_KEY", Configured: appKey != "",
		Length: len(appKey), SHA256Prefix: fingerprint(appKey),
	}
	secretDiag = CredentialDiagnostic{
		Source: "env:ZHIHU_ACCESS_SECRET", Configured: accessSecret != "",
		Length: len(accessSecret), SHA256Prefix: fingerprint(accessSecret),
	}
	if appKeyDiag.Configured && appKeyDiag.Length <= 8 {
		warns = append(warns, CredentialWarning{"APP_KEY_TOO_SHORT",
			"ZHIHU_OAUTH_APP_KEY 看起来过短，请确认没有填成 App ID。"})
	}
	if appKeyDiag.Configured && appID != "" && appKeyDiag.SHA256Prefix == fingerprint(appID) {
		warns = append(warns, CredentialWarning{"APP_ID_USED_AS_APP_KEY",
			"OAuth app_key 看起来等于 App ID。"})
	}
	if appKeyDiag.Configured && secretDiag.Configured &&
		appKeyDiag.SHA256Prefix == secretDiag.SHA256Prefix {
		warns = append(warns, CredentialWarning{"APP_KEY_USED_AS_ACCESS_SECRET",
			"ZHIHU_ACCESS_SECRET 看起来等于 OAuth App Key。"})
	}
	return
}
