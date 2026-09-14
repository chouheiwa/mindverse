package server

import (
	"math"
	"net/url"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/progress"
)

type generationDetails struct {
	Phase        string             `json:"phase"`
	Done         int                `json:"done"`
	Total        int                `json:"total"`
	Cached       int                `json:"cached"`
	Failed       int                `json:"failed"`
	Collected    int                `json:"collected"`
	FoldersDone  int                `json:"foldersDone"`
	FoldersTotal int                `json:"foldersTotal"`
	StartedAt    int64              `json:"startedAt"`
	UpdatedAt    int64              `json:"updatedAt"`
	EstimateLow  int                `json:"estimateLow"`
	EstimateHigh int                `json:"estimateHigh"`
	Preview      []progress.Preview `json:"preview"`
}

type generationTracker struct {
	mu      sync.Mutex
	details generationDetails
	average float64
}

// Caller holds the tracker lock through publication to preserve concurrent event order.
func (t *generationTracker) observe(e progress.Event, now time.Time) generationDetails {
	d := t.details
	if d.StartedAt == 0 {
		d.StartedAt = now.UnixMilli()
	}
	if e.Phase != d.Phase {
		t.average = 0
	}
	d.Phase, d.Done, d.Total, d.Failed = e.Phase, e.Done, e.Total, e.Failed
	d.UpdatedAt = now.UnixMilli()
	if e.Phase == "collect" {
		d.Collected = e.Done
		if e.FoldersTotal > 0 {
			d.FoldersDone, d.FoldersTotal = e.FoldersDone, e.FoldersTotal
		}
	}
	if e.Phase == "cache" {
		d.Cached = e.Cached
	}
	d.EstimateLow, d.EstimateHigh = 0, 0
	if e.SampleSeconds > 0 {
		if t.average == 0 {
			t.average = e.SampleSeconds
		} else {
			t.average = .7*t.average + .3*e.SampleSeconds
		}
	}
	if t.average > 0 && e.RemainingWaves > 0 {
		d.EstimateLow = max(1, int(math.Ceil(t.average*e.RemainingWaves*.65)))
		d.EstimateHigh = max(d.EstimateLow+1, int(math.Ceil(t.average*e.RemainingWaves*1.8)))
	}
	// A bounded immutable snapshot: only source-backed HTTPS Zhihu links, never shared snapshots.
	previews := append([]progress.Preview(nil), d.Preview...)
	for _, p := range e.Preview {
		u, err := url.Parse(p.URL)
		if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" ||
			(u.Hostname() != "www.zhihu.com" && u.Hostname() != "zhihu.com" && u.Hostname() != "zhuanlan.zhihu.com") || len(p.Concepts) == 0 {
			continue
		}
		duplicate := false
		for _, old := range previews {
			if old.URL == p.URL {
				duplicate = true
				break
			}
		}
		if duplicate {
			continue
		}
		title := []rune(p.Title)
		p.Title = string(title[:min(120, len(title))])
		p.Concepts = append([]string(nil), p.Concepts[:min(3, len(p.Concepts))]...)
		previews = append(previews, p)
		if len(previews) > 3 {
			previews = previews[len(previews)-3:]
		}
	}
	d.Preview = previews
	t.details = d
	return d
}
