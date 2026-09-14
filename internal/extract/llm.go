// Package extract 实现管线 ① 敏感过滤、② 概念抽取、③ 概念归并与 ⑨ 星群命名。
//
// 这是整条链路里唯一真正依赖大模型的部分。知乎直答每日仅 100 次，
// 绝不可用于此 —— 它只留给用户主动点击时的单点解释。
package extract

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// LLM 是 OpenAI 兼容的对话补全客户端。
//
// 刻意不锁死供应商：知乎直答、通义、DeepSeek、Kimi 以及任何兼容
// /chat/completions 的网关都能直接插，只改环境变量。
type LLM struct {
	BaseURL string // 例如 https://api.deepseek.com/v1
	APIKey  string
	Model   string
	HTTP    *http.Client
}

// LLMFromEnv 从环境变量构造客户端。
func LLMFromEnv() (*LLM, error) {
	base := strings.TrimRight(os.Getenv("MINDVERSE_LLM_BASE_URL"), "/")
	key := os.Getenv("MINDVERSE_LLM_API_KEY")
	model := os.Getenv("MINDVERSE_LLM_MODEL")
	if base == "" || key == "" || model == "" {
		return nil, fmt.Errorf("未配置 LLM：需要 MINDVERSE_LLM_BASE_URL / MINDVERSE_LLM_API_KEY / MINDVERSE_LLM_MODEL")
	}
	return &LLM{
		BaseURL: base, APIKey: key, Model: model,
		HTTP: &http.Client{Timeout: 120 * time.Second},
	}, nil
}

type chatReq struct {
	Model       string          `json:"model"`
	Messages    []message       `json:"messages"`
	Temperature float64         `json:"temperature"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Stream      bool            `json:"stream"`
	Thinking    *thinkingConfig `json:"thinking,omitempty"`
}

type thinkingConfig struct {
	Type string `json:"type"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResp struct {
	Choices []struct {
		Message message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Complete 发一次对话补全。temperature 固定为 0，保证同一输入尽量稳定 ——
// 星图必须可复现，分享快照才能重建。
func (l *LLM) Complete(ctx context.Context, system, user string, maxTokens int) (string, error) {
	payload := chatReq{
		Model: l.Model, Temperature: 0, MaxTokens: maxTokens,
		Messages: []message{{Role: "system", Content: system}, {Role: "user", Content: user}},
	}
	// M3 defaults to thinking in the content field, consuming the small JSON
	// output budget before answering. Extraction and naming need only the answer.
	if strings.EqualFold(l.Model, "MiniMax-M3") {
		payload.Thinking = &thinkingConfig{Type: "disabled"}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		l.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+l.APIKey)

	cl := l.HTTP
	if cl == nil {
		cl = &http.Client{Timeout: 120 * time.Second}
	}
	resp, err := cl.Do(req)
	if err != nil {
		return "", fmt.Errorf("调用模型失败: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("模型返回 HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	var cr chatResp
	if err := json.Unmarshal(raw, &cr); err != nil {
		return "", fmt.Errorf("模型返回无法解析的响应")
	}
	if cr.Error != nil {
		return "", fmt.Errorf("模型报错: %s", truncate(cr.Error.Message, 300))
	}
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("模型未返回任何结果")
	}
	return cr.Choices[0].Message.Content, nil
}

// Completer 抽象一次补全，便于用假实现做测试。
type Completer interface {
	Complete(ctx context.Context, system, user string, maxTokens int) (string, error)
}

// jsonBlock 从模型输出里抠出第一个完整的 JSON 对象。
//
// 模型经常裹 ```json 围栏或加前后缀寒暄，直接 Unmarshal 会失败。
func jsonBlock(s string) (string, error) {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "```"); i >= 0 {
		rest := s[i+3:]
		if j := strings.IndexByte(rest, '\n'); j >= 0 {
			rest = rest[j+1:]
		}
		if k := strings.Index(rest, "```"); k >= 0 {
			rest = rest[:k]
		}
		s = strings.TrimSpace(rest)
	}
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return "", fmt.Errorf("模型输出中没有 JSON 对象")
	}
	depth, inStr, esc := 0, false, false
	for i := start; i < len(s); i++ {
		c := s[i]
		switch {
		case esc:
			esc = false
		case c == '\\' && inStr:
			esc = true
		case c == '"':
			inStr = !inStr
		case inStr:
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth == 0 {
				return s[start : i+1], nil
			}
		}
	}
	return "", fmt.Errorf("模型输出的 JSON 不完整")
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
