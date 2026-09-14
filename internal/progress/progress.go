// Package progress carries request-scoped, ephemeral generation observations.
package progress

import "context"

type Preview struct {
	Concepts []string `json:"concepts"`
	Title    string   `json:"title"`
	URL      string   `json:"url"`
}

type Event struct {
	Phase                         string
	Done, Total, Cached, Failed   int
	FoldersDone, FoldersTotal     int
	Preview                       []Preview
	SampleSeconds, RemainingWaves float64
}

type key struct{}

func WithObserver(ctx context.Context, fn func(Event)) context.Context {
	return context.WithValue(ctx, key{}, fn)
}
func Report(ctx context.Context, e Event) {
	if ctx.Err() != nil {
		return
	}
	if fn, ok := ctx.Value(key{}).(func(Event)); ok {
		fn(e)
	}
}
