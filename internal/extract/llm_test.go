package extract

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiniMaxM3DisablesThinkingForStructuredExtraction(t *testing.T) {
	for _, model := range []string{"MiniMax-M3", "other-model"} {
		t.Run(model, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req map[string]any
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				thinking, _ := req["thinking"].(map[string]any)
				content := `{"name":"数理之光"}`
				if model == "MiniMax-M3" && thinking["type"] != "disabled" {
					// Reproduce M3 exhausting the naming budget on reasoning.
					content = "<think>Let me consider a name...</think>"
				}
				if model == "other-model" && req["thinking"] != nil {
					t.Error("provider-specific thinking parameter sent to another model")
				}
				json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
			}))
			defer srv.Close()
			ext := NewLLMExtractor(&LLM{BaseURL: srv.URL, APIKey: "test", Model: model, HTTP: srv.Client()})
			name, err := ext.NameCluster(context.Background(), []string{"算法", "数学", "计算"}, nil)
			if err != nil || name != "数理之光" {
				t.Fatalf("name = %q, err = %v", name, err)
			}
		})
	}
}
