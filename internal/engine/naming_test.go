package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

func TestNamingIsBoundedConcurrentAndPreservesOrder(t *testing.T) {
	jobs := make([]namingJob, 9)
	for i := range jobs {
		jobs[i].members = []string{fmt.Sprint(i)}
	}
	started := make(chan struct{}, 9)
	release := make(chan struct{})
	var active, peak atomic.Int32
	name := func(members, _ []string) string {
		n := active.Add(1)
		for old := peak.Load(); n > old; old = peak.Load() {
			if peak.CompareAndSwap(old, n) {
				break
			}
		}
		started <- struct{}{}
		<-release
		active.Add(-1)
		return members[0]
	}
	done := make(chan []string, 1)
	go func() { r, _ := nameClusters(context.Background(), jobs, name, 4); done <- r }()
	for i := 0; i < 4; i++ {
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			close(release)
			t.Fatal("four naming requests should overlap")
		}
	}
	close(release)
	r := <-done
	if peak.Load() != 4 {
		t.Fatalf("concurrency=%d", peak.Load())
	}
	for i, v := range r {
		if v != fmt.Sprint(i) {
			t.Fatal("completion order changed graph identities")
		}
	}
}

func TestParallelNamingProducesIdenticalUniverse(t *testing.T) {
	input := loadSample(t)
	name := func(members, _ []string) string { return members[0] + "星群" }
	a, err := Run(input, Options{}, name)
	if err != nil {
		t.Fatal(err)
	}
	b, err := RunContext(context.Background(), input, Options{}, name)
	if err != nil {
		t.Fatal(err)
	}
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	if string(x) != string(y) {
		t.Fatal("parallel naming changed universe topology or names")
	}
}

func TestCanceledNamingDoesNotStartQueuedCalls(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	_, err := nameClusters(ctx, make([]namingJob, 10), func([]string, []string) string { calls++; cancel(); return "done" }, 1)
	if err != context.Canceled || calls != 1 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}
