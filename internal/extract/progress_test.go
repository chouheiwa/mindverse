package extract

import (
	"context"
	"fmt"
	"github.com/chouheiwa/mindverse/internal/progress"
	"sync"
	"testing"
)

func TestBatchProgressReportsActualCompletedItemsAndSourcePreviews(t *testing.T) {
	var mu sync.Mutex
	events := []progress.Event{}
	ctx := progress.WithObserver(context.Background(), func(e progress.Event) { mu.Lock(); defer mu.Unlock(); events = append(events, e) })
	ext := NewLLMExtractor(&fakeLLM{})
	ext.BatchSize, ext.SeedBatches, ext.Workers = 10, 2, 4
	_, err := ext.Extract(ctx, sampleItems(55))
	if err != nil {
		t.Fatal(err)
	}
	last, reports := 0, 0
	for _, e := range events {
		if e.Phase != "analyze" || e.Done == 0 {
			continue
		}
		reports++
		if e.Done < last || e.Total != 55 {
			t.Fatal("concurrent batch progress went backwards")
		}
		last = e.Done
		if len(e.Preview) == 0 || e.Preview[0].URL == "" {
			t.Fatal("missing source-backed preview")
		}
	}
	if reports != 6 || last != 55 || events[len(events)-1].Phase != "normalize" {
		t.Fatalf("reports=%d done=%d", reports, last)
	}
}

func TestConcurrentNamingCacheRetainsEveryEntry(t *testing.T) {
	c, err := NewCache(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	base := NewLLMExtractor(&fakeLLM{})
	x, err := c.Begin(context.Background(), "owner", "v1", base)
	if err != nil {
		t.Fatal(err)
	}
	defer x.Close()
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, err := x.NameCluster(context.Background(), []string{fmt.Sprint(i)}, nil); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if err := x.Commit(); err != nil {
		t.Fatal(err)
	}
	if len(x.record.Names) != 12 || x.NameMisses != 12 {
		t.Fatal("parallel cache writes lost results")
	}
	for i := 0; i < 12; i++ {
		if _, err := x.NameCluster(context.Background(), []string{fmt.Sprint(i)}, nil); err != nil {
			t.Fatal(err)
		}
	}
	if x.NameHits != 12 {
		t.Fatal("completed names were not reused")
	}
}
