package zhihu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func quotaServer(t *testing.T, calls *int, items []map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		*calls++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"Code": 0, "Data": items})
	}))
}

// 额度查询不消耗业务额度，但仍是一次往返：TTL 内必须复用快照。
func TestQuotaGateCachesWithinTTL(t *testing.T) {
	var calls int
	srv := quotaServer(t, &calls, []map[string]any{
		{"APIID": "user_data", "APIName": "知乎用户数据", "TotalQuota": 10000, "TotalUsed": 0, "RemainingQuota": 10000},
	})
	defer srv.Close()

	c := NewClient("secret", "")
	c.BaseURL = srv.URL
	now := time.Unix(1_800_000_000, 0)
	g := NewQuotaGate(c, time.Minute)
	g.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if _, err := g.Snapshot(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("TTL 内应只查一次，实际 %d 次", calls)
	}
	now = now.Add(61 * time.Second)
	if _, err := g.Snapshot(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("过期后应重查，实际共 %d 次", calls)
	}
}

func TestQuotaSnapshotLowAndEnough(t *testing.T) {
	var calls int
	srv := quotaServer(t, &calls, []map[string]any{
		{"APIID": "user_data", "APIName": "知乎用户数据", "TotalQuota": 10000, "TotalUsed": 9900, "RemainingQuota": 100},
		{"APIID": "question_answers", "APIName": "知乎问题回答", "TotalQuota": 100, "TotalUsed": 96, "RemainingQuota": 4},
		{"APIID": "zhihu_search", "APIName": "知乎搜索", "TotalQuota": 5000, "TotalUsed": 0, "RemainingQuota": 5000},
	})
	defer srv.Close()

	c := NewClient("secret", "")
	c.BaseURL = srv.URL
	snap, err := NewQuotaGate(c, time.Minute).Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	low := snap.Low(LowQuotaRatio)
	if len(low) != 2 {
		t.Fatalf("应有 2 项低于 15%%，实际 %d: %+v", len(low), low)
	}
	// 按剩余比例升序：question_answers 4%% 在 user_data 1%% 之后。
	if low[0].APIID != "user_data" || low[1].APIID != "question_answers" {
		t.Errorf("排序应按剩余比例升序，实际 %s, %s", low[0].APIID, low[1].APIID)
	}
	if !snap.EnoughFor(QuotaUserData, 14) {
		t.Error("剩余 100 次应够 14 次")
	}
	if snap.EnoughFor(QuotaUserData, 101) {
		t.Error("剩余 100 次不该够 101 次")
	}
	// 查不到的能力不构成拒绝理由。
	if !snap.EnoughFor("creator", 1_000_000) {
		t.Error("未返回的能力应放行")
	}
}

// 额度查询失败不该阻断主流程。
func TestQuotaGateSurvivesQueryFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := NewClient("secret", "")
	c.BaseURL = srv.URL
	snap, err := NewQuotaGate(c, time.Minute).Snapshot(context.Background())
	if err == nil {
		t.Fatal("应把错误带出来")
	}
	// 拿不到快照时所有判断都放行。
	if !snap.EnoughFor(QuotaUserData, 1_000_000) {
		t.Error("无快照应放行")
	}
	if len(snap.Low(LowQuotaRatio)) != 0 {
		t.Error("无快照不该报低额度")
	}
}

// 下界必须真的是下界：收藏夹数量事前不可知，真实开销只会更高。
func TestFetchPlanMinimumCalls(t *testing.T) {
	if got, want := DefaultPlan().MinimumCalls(), int64(14); got != want {
		t.Fatalf("MinimumCalls = %d, want %d", got, want)
	}
}
