// Package config 汇总运行配置。
//
// 凭证边界（官方文档专门警告的高频错误）：
//   - App ID        短数字，可公开，写在 hackathon.config.json
//   - App Key       只走环境变量 ZHIHU_OAUTH_APP_KEY，绝不进配置文件与代码
//   - Access Secret 只走环境变量 ZHIHU_ACCESS_SECRET
package config

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Source 是语料来源。
type Source string

const (
	SourceLive Source = "live" // 真实 OAuth 用户
	SourceMock Source = "mock" // 本地样本，凭证未到位时使用
	SourceSeed Source = "seed" // 游客模式，现场挑选问题
)

// Config 是应用配置。
type Config struct {
	Port int

	AppID        string
	RedirectURI  string
	AppKey       string // 环境变量注入，永不序列化
	AccessSecret string // 环境变量注入，永不序列化

	Source       Source
	MockPath     string
	ConceptsPath string // 离线概念标注，模型不可用时的兜底

	WebDir        string
	SnapshotDir   string
	MaxPerUserDay int // 每用户每日生成上限，防刷
}

type fileConfig struct {
	ProjectName string `json:"projectName"`
	Port        int    `json:"port"`
	OAuth       struct {
		AppID       string `json:"appId"`
		RedirectURI string `json:"redirectUri"`
	} `json:"oauth"`
}

// Load 读取 hackathon.config.json（可选）并用环境变量覆盖。
func Load(path string) (*Config, error) {
	c := &Config{
		Port: 4173, Source: SourceMock,
		MockPath: "testdata/corpus_sample.json", ConceptsPath: "testdata/concepts_sample.json",
		WebDir: "web", SnapshotDir: "data/snapshots", MaxPerUserDay: 3,
	}
	if b, err := os.ReadFile(path); err == nil {
		var fc fileConfig
		if err := json.Unmarshal(b, &fc); err != nil {
			return nil, fmt.Errorf("解析 %s 失败: %w", path, err)
		}
		if fc.Port > 0 {
			c.Port = fc.Port
		}
		c.AppID = fc.OAuth.AppID
		c.RedirectURI = fc.OAuth.RedirectURI
	}

	env := func(k, cur string) string {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
		return cur
	}
	c.AppID = env("ZHIHU_OAUTH_APP_ID", c.AppID)
	c.RedirectURI = env("ZHIHU_OAUTH_REDIRECT_URI", c.RedirectURI)
	c.AppKey = os.Getenv("ZHIHU_OAUTH_APP_KEY")
	c.AccessSecret = os.Getenv("ZHIHU_ACCESS_SECRET")
	c.MockPath = env("MINDVERSE_MOCK_PATH", c.MockPath)
	c.ConceptsPath = env("MINDVERSE_CONCEPTS_PATH", c.ConceptsPath)
	c.WebDir = env("MINDVERSE_WEB_DIR", c.WebDir)
	c.SnapshotDir = env("MINDVERSE_SNAPSHOT_DIR", c.SnapshotDir)
	if v := env("MINDVERSE_SOURCE", string(c.Source)); v != "" {
		c.Source = Source(v)
	}
	if v := os.Getenv("PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			c.Port = n
		}
	}
	return c, nil
}

// LocalOnly 报告当前回调是否为本地地址。
//
// 官方文档明确：localhost / 127.0.0.1 只能预览页面，无法完成知乎登录。
// 真实联调必须部署到公网 HTTPS。界面据此显示「等待部署」而不是假装能登录。
func (c *Config) LocalOnly() bool {
	if strings.TrimSpace(c.RedirectURI) == "" {
		return true
	}
	u, ok := parsedRedirect(c.RedirectURI)
	return ok && u.Scheme == "http" && isLoopbackHost(u.Hostname())
}

// OAuthReady 报告 OAuth 是否具备真实登录条件。
func (c *Config) OAuthReady() bool {
	u, ok := parsedRedirect(c.RedirectURI)
	return c.AppID != "" && c.AppKey != "" && c.AccessSecret != "" && ok &&
		u.Scheme == "https" && !isLoopbackHost(u.Hostname())
}

func parsedRedirect(raw string) (*url.URL, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" || u.Hostname() == "" || u.User != nil ||
		u.Fragment != "" || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") ||
		!validRedirectHost(u.Hostname()) {
		return nil, false
	}
	return u, true
}

func validRedirectHost(host string) bool {
	if net.ParseIP(host) != nil {
		return true
	}
	if strings.Trim(host, "0123456789.") == "" {
		// Reject browser-specific shorthand/integer IPv4 spellings that net.ParseIP
		// does not classify, instead of risking a loopback address looking public.
		return false
	}
	host = strings.TrimSuffix(host, ".")
	if host == "" || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for i := range len(label) {
			c := label[i]
			if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-') {
				return false
			}
		}
	}
	return true
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
