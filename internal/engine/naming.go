package engine

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/progress"
)

type namingJob struct{ members, samples []string }

// Callbacks may run concurrently, but results retain their deterministic graph order.
func nameClusters(ctx context.Context, jobs []namingJob, name Namer, workers int) ([]string, error) {
	results := make([]string, len(jobs))
	workers = max(1, min(workers, 4))
	progress.Report(ctx, progress.Event{Phase: "name", Total: len(jobs)})
	var wg sync.WaitGroup
	var mu sync.Mutex
	done := 0
	sem := make(chan struct{}, workers)
	for i, j := range jobs {
		if ctx.Err() != nil {
			break
		}
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			wg.Wait()
			return results, ctx.Err()
		}
		if ctx.Err() != nil {
			<-sem
			break
		}
		wg.Add(1)
		go func(i int, j namingJob) {
			defer wg.Done()
			defer func() { <-sem }()
			started := time.Now()
			results[i] = name(j.members, j.samples)
			mu.Lock()
			defer mu.Unlock()
			done++
			progress.Report(ctx, progress.Event{Phase: "name", Done: done, Total: len(jobs), SampleSeconds: time.Since(started).Seconds(), RemainingWaves: math.Ceil(float64(len(jobs)-done) / float64(workers))})
		}(i, j)
	}
	wg.Wait()
	return results, ctx.Err()
}
