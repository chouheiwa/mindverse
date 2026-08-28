// Package snapshot 存取分享快照。
//
// 核心约束：只存派生结构与公开链接，绝不存 Title、Summary 或任何正文。
// 打开分享页时星图由快照重建；证据条目只显示链接，标题需访问者自行点开。
package snapshot

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/engine"
)

// TTL 是快照的存活期。用户也可以随时销毁。
const TTL = 30 * 24 * time.Hour

// Snapshot 是可分享的派生结构。
type Snapshot struct {
	ID        string          `json:"id"`
	CreatedAt time.Time       `json:"createdAt"`
	ExpiresAt time.Time       `json:"expiresAt"`
	Universe  engine.Universe `json:"universe"`
}

// Store 是快照存储。
type Store struct {
	dir string
	mu  sync.RWMutex
}

func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("创建快照目录失败: %w", err)
	}
	return &Store{dir: dir}, nil
}

func newID() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// validID 防止路径穿越。
func validID(id string) bool {
	if id == "" || len(id) > 32 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

func (s *Store) path(id string) string { return filepath.Join(s.dir, id+".json") }

// Save 剥掉原文后落盘。
func (s *Store) Save(u *engine.Universe) (*Snapshot, error) {
	id, err := newID()
	if err != nil {
		return nil, err
	}
	stripped := strip(*u)
	snap := &Snapshot{
		ID: id, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(TTL), Universe: stripped,
	}
	b, err := json.Marshal(snap)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.WriteFile(s.path(id), b, 0o600); err != nil {
		return nil, fmt.Errorf("写入快照失败: %w", err)
	}
	return snap, nil
}

// Load 读取快照；过期即视为不存在。
func (s *Store) Load(id string) (*Snapshot, error) {
	if !validID(id) {
		return nil, fmt.Errorf("非法的快照编号")
	}
	s.mu.RLock()
	b, err := os.ReadFile(s.path(id))
	s.mu.RUnlock()
	if err != nil {
		return nil, fmt.Errorf("快照不存在或已过期")
	}
	var snap Snapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return nil, fmt.Errorf("快照已损坏")
	}
	if time.Now().After(snap.ExpiresAt) {
		_ = s.Delete(id)
		return nil, fmt.Errorf("快照不存在或已过期")
	}
	return &snap, nil
}

// Delete 立即销毁快照。对应界面上的「立即删除我的宇宙」。
func (s *Store) Delete(id string) error {
	if !validID(id) {
		return fmt.Errorf("非法的快照编号")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(s.path(id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// strip 移除一切原文，只留结构与公开链接。
//
// 这是「不存原文也能再次打开」的全部实现：标题一律清空，
// 分享页只显示链接，访问者要看内容必须点回知乎。
//
// 必须逐层复制，不能就地改。
//
// 参数虽然是按值传的，但 engine.Universe 里全是切片 —— 复制的只是切片头，
// 底层数组仍与调用方共用。旧实现直接写 u.Stars[i].Evidence，改的就是会话里
// 那一份真实宇宙：用户只要生成过一次分享卡，自己星图上的原文标题就全没了。
// 2026-08-27 实测复现。
func strip(u engine.Universe) engine.Universe {
	cleanEv := func(evs []engine.Evidence) []engine.Evidence {
		out := make([]engine.Evidence, 0, len(evs))
		for _, e := range evs {
			out = append(out, engine.Evidence{URL: e.URL, Own: e.Own, When: e.When})
		}
		return out
	}

	stars := make([]engine.Star, len(u.Stars))
	copy(stars, u.Stars)
	for i := range stars {
		stars[i].Evidence = cleanEv(u.Stars[i].Evidence)
	}
	u.Stars = stars

	dark := make([]engine.Dark, len(u.Dark))
	copy(dark, u.Dark)
	for i := range dark {
		dark[i].Evidence = cleanEv(u.Dark[i].Evidence)
	}
	u.Dark = dark

	worms := make([]engine.Wormhole, len(u.Wormholes))
	copy(worms, u.Wormholes)
	for i := range worms {
		evs := make([]engine.WormholeEvidence, len(u.Wormholes[i].Evidence))
		copy(evs, u.Wormholes[i].Evidence)
		for j := range evs {
			evs[j].Title = ""
		}
		worms[i].Evidence = evs
	}
	u.Wormholes = worms

	solo := make([]engine.Solo, len(u.Solo))
	copy(solo, u.Solo)
	for i := range solo {
		solo[i].Title = ""
	}
	u.Solo = solo

	return u
}

// ContainsProse 报告快照里是否残留了正文，用于测试与发布前自检。
func ContainsProse(u *engine.Universe) bool {
	for _, s := range u.Stars {
		for _, e := range s.Evidence {
			if strings.TrimSpace(e.Title) != "" {
				return true
			}
		}
	}
	for _, d := range u.Dark {
		for _, e := range d.Evidence {
			if strings.TrimSpace(e.Title) != "" {
				return true
			}
		}
	}
	for _, w := range u.Wormholes {
		for _, e := range w.Evidence {
			if strings.TrimSpace(e.Title) != "" {
				return true
			}
		}
	}
	for _, s := range u.Solo {
		if strings.TrimSpace(s.Title) != "" {
			return true
		}
	}
	return false
}
