package seed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

func fakeZhihu(t *testing.T, hits *int) *zhihu.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*hits++
		q := r.URL.Query().Get("Query")
		items := make([]map[string]any, 0, 10)
		for i := 0; i < 10; i++ {
			items = append(items, map[string]any{
				"Title": q + " 结果 " + string(rune('A'+i)), "ContentType": "Answer",
				"ContentText": "摘要", "Url": "https://www.zhihu.com/answer/" + q + string(rune('A'+i)),
				"EditTime": 1700000000 + i*86400,
			})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Code": 0, "Message": "success", "Data": map[string]any{"Items": items},
		})
	}))
	t.Cleanup(srv.Close)
	c := zhihu.NewClient("secret", "")
	c.BaseURL = srv.URL
	return c
}

func TestBuildExpandsPicksIntoCorpus(t *testing.T) {
	hits := 0
	b := NewBuilder(fakeZhihu(t, &hits))
	picks := []string{"ai", "game", "write", "history", "math", "life", "design"}
	c, err := b.Build(context.Background(), picks)
	if err != nil {
		t.Fatalf("展开失败: %v", err)
	}
	if c.Source != "seed" {
		t.Errorf("来源必须标为 seed，界面靠它显示「不是你的知乎历史」，实际 %q", c.Source)
	}
	if len(c.Items) < 60 {
		t.Errorf("7 个方向应展开出足量语料，实际 %d 条", len(c.Items))
	}
	if hits != len(picks) {
		t.Errorf("每个方向一次搜索，应调用 %d 次，实际 %d", len(picks), hits)
	}
	for _, it := range c.Items {
		if it.IsCreated() {
			t.Fatal("种子星语料不能标成本人创作")
		}
	}
}

func TestBuildCachesPerTopic(t *testing.T) {
	hits := 0
	b := NewBuilder(fakeZhihu(t, &hits))
	picks := []string{"ai", "game", "write", "history", "math", "life"}
	if _, err := b.Build(context.Background(), picks); err != nil {
		t.Fatal(err)
	}
	first := hits
	if _, err := b.Build(context.Background(), picks); err != nil {
		t.Fatal(err)
	}
	if hits != first {
		t.Errorf("重复挑选必须命中缓存，配额有限；实际又调了 %d 次", hits-first)
	}
}

func TestBuildRejectsTooFewPicks(t *testing.T) {
	hits := 0
	b := NewBuilder(fakeZhihu(t, &hits))
	_, err := b.Build(context.Background(), []string{"ai", "game"})
	if err == nil || !strings.Contains(err.Error(), "至少") {
		t.Fatalf("低于下限必须拒绝并说清原因，实际 %v", err)
	}
	if hits != 0 {
		t.Error("参数不合法时不该消耗接口配额")
	}
}

func TestTopicsDoNotLeakQueries(t *testing.T) {
	b, _ := json.Marshal(Topics())
	if strings.Contains(string(b), "Query") || strings.Contains(string(b), "query") {
		t.Error("搜索关键词是实现细节，不该外发给前端")
	}
	if len(Topics()) < MaxPicks {
		t.Error("方向池要多于可选上限，否则用户没得挑")
	}
}
