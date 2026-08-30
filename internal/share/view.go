// Package share builds and persists explicitly selected, public-only views.
package share

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/engine"
)

const (
	ViewSchemaVersion = "share.v1"
	TTL               = 30 * 24 * time.Hour
)

var ErrNotFound = errors.New("share not found")

type ShareSelection struct {
	QuestionIDs []string `json:"questionIds"`
}

type Question struct {
	ID         string   `json:"id"`
	QuestionID string   `json:"questionId"`
	Title      string   `json:"title"`
	URL        string   `json:"url"`
	AnswerIDs  []string `json:"answerIds"`
}

type Answer struct {
	ID            string `json:"id"`
	QuestionID    string `json:"questionId"`
	Title         string `json:"title"`
	URL           string `json:"url"`
	AuthorID      string `json:"authorId,omitempty"`
	AuthorName    string `json:"authorName,omitempty"`
	PublishedAt   int64  `json:"publishedAt,omitempty"`
	UpdatedAt     int64  `json:"updatedAt,omitempty"`
	LikeCount     int64  `json:"likeCount,omitempty"`
	CommentCount  int64  `json:"commentCount,omitempty"`
	FavoriteCount int64  `json:"favoriteCount,omitempty"`
}

type ShareView struct {
	SchemaVersion string     `json:"schemaVersion"`
	Legacy        bool       `json:"legacy,omitempty"`
	Questions     []Question `json:"questions"`
	Answers       []Answer   `json:"answers"`
}

func BuildView(u *engine.Universe, selection ShareSelection) (ShareView, error) {
	view := ShareView{SchemaVersion: ViewSchemaVersion, Questions: []Question{}, Answers: []Answer{}}
	if u == nil {
		return view, fmt.Errorf("universe unavailable")
	}
	requested := append([]string(nil), selection.QuestionIDs...)
	sort.Strings(requested)
	requested = compact(requested)
	if len(requested) == 0 {
		return view, nil
	}

	questions := make(map[string]engine.QuestionPlanet, len(u.Questions))
	for _, q := range u.Questions {
		if canonicalQuestion(q) {
			questions[q.ID] = q
		}
	}
	missing := make([]string, 0)
	for _, id := range requested {
		if _, ok := questions[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		return view, fmt.Errorf("unknown or unavailable question IDs: %s", strings.Join(missing, ", "))
	}

	answers := make(map[string]engine.AnswerSatellite, len(u.Answers))
	for _, answer := range u.Answers {
		answers[answer.ID] = answer
	}
	seenAnswers := map[string]struct{}{}
	for _, id := range requested {
		q := questions[id]
		answerIDs := append([]string(nil), q.AnswerIDs...)
		sort.Strings(answerIDs)
		publicAnswerIDs := make([]string, 0, len(answerIDs))
		for _, answerID := range compact(answerIDs) {
			a, ok := answers[answerID]
			if !ok || !canonicalAnswer(a, q) {
				continue
			}
			publicAnswerIDs = append(publicAnswerIDs, a.ID)
			if _, exists := seenAnswers[a.ID]; exists {
				continue
			}
			seenAnswers[a.ID] = struct{}{}
			public := Answer{
				ID: a.ID, QuestionID: a.QuestionID, Title: a.Title, URL: a.URL,
				PublishedAt: a.PublishedAt, UpdatedAt: a.UpdatedAt, LikeCount: a.LikeCount,
				CommentCount: a.CommentCount, FavoriteCount: a.FavoriteCount,
			}
			// A display name without a stable verified identity is not exported.
			if a.AuthorID != "" {
				public.AuthorID, public.AuthorName = a.AuthorID, a.AuthorName
			}
			view.Answers = append(view.Answers, public)
		}
		view.Questions = append(view.Questions, Question{
			ID: q.ID, QuestionID: q.QuestionID, Title: q.Title, URL: q.URL, AnswerIDs: publicAnswerIDs,
		})
	}
	sort.Slice(view.Answers, func(i, j int) bool { return view.Answers[i].ID < view.Answers[j].ID })
	return view, nil
}

func canonicalQuestion(q engine.QuestionPlanet) bool {
	return q.Title != "" && asciiDigits(q.QuestionID) && q.ID == "question:"+q.QuestionID &&
		q.URL == "https://www.zhihu.com/question/"+q.QuestionID
}

func canonicalAnswer(a engine.AnswerSatellite, q engine.QuestionPlanet) bool {
	answerID, ok := strings.CutPrefix(a.ID, "answer:")
	return ok && asciiDigits(answerID) && a.QuestionID == q.ID && a.Title != "" &&
		a.URL == "https://www.zhihu.com/question/"+q.QuestionID+"/answer/"+answerID
}

func asciiDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func compact(values []string) []string {
	if len(values) < 2 {
		return values
	}
	out := values[:1]
	for _, value := range values[1:] {
		if value != out[len(out)-1] {
			out = append(out, value)
		}
	}
	return out
}

type Record struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	OwnerKey  string    `json:"ownerKey,omitempty"`
	Legacy    bool      `json:"legacy,omitempty"`
	View      ShareView `json:"view"`
}

type Store struct {
	dir     string
	mu      sync.RWMutex
	byOwner map[string]map[string]struct{}
}

func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create share directory: %w", err)
	}
	s := &Store{dir: dir, byOwner: map[string]map[string]struct{}{}}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var record Record
		fileID := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		if json.Unmarshal(b, &record) == nil && record.ID == fileID && validID(record.ID) && record.OwnerKey != "" {
			s.addOwner(record.OwnerKey, record.ID)
		}
	}
	return s, nil
}

func (s *Store) Create(ownerSession string, view ShareView) (*Record, error) {
	if len(view.Questions) == 0 {
		return nil, fmt.Errorf("empty share selection")
	}
	id, err := newID()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	record := &Record{ID: id, CreatedAt: now, ExpiresAt: now.Add(TTL), OwnerKey: ownerKey(ownerSession), View: view}
	b, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := atomicWrite(s.path(id), b); err != nil {
		return nil, err
	}
	s.addOwner(record.OwnerKey, id)
	return record, nil
}

func (s *Store) Load(id string) (*Record, error) {
	if !validID(id) {
		return nil, ErrNotFound
	}
	s.mu.RLock()
	b, err := os.ReadFile(s.path(id))
	s.mu.RUnlock()
	if err != nil {
		return nil, ErrNotFound
	}
	var envelope map[string]json.RawMessage
	if json.Unmarshal(b, &envelope) != nil {
		return nil, ErrNotFound
	}
	if _, legacy := envelope["universe"]; legacy {
		var old struct {
			ID        string    `json:"id"`
			CreatedAt time.Time `json:"createdAt"`
			ExpiresAt time.Time `json:"expiresAt"`
		}
		if json.Unmarshal(b, &old) != nil || old.ID != id {
			return nil, ErrNotFound
		}
		if !old.ExpiresAt.IsZero() && time.Now().After(old.ExpiresAt) {
			s.removeExpired(id)
			return nil, ErrNotFound
		}
		return &Record{ID: old.ID, CreatedAt: old.CreatedAt, ExpiresAt: old.ExpiresAt, Legacy: true, View: ShareView{SchemaVersion: ViewSchemaVersion, Legacy: true, Questions: []Question{}, Answers: []Answer{}}}, nil
	}
	var record Record
	if json.Unmarshal(b, &record) != nil || record.ID != id {
		return nil, ErrNotFound
	}
	if time.Now().After(record.ExpiresAt) {
		s.removeExpired(id)
		return nil, ErrNotFound
	}
	return &record, nil
}

func (s *Store) DeleteOwned(id, ownerSession string) error {
	record, err := s.Load(id)
	if err != nil || record.OwnerKey == "" || !sameOwner(record.OwnerKey, ownerKey(ownerSession)) {
		return ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(s.path(id)); err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	s.removeOwner(record.OwnerKey, id)
	return nil
}

func (s *Store) DeleteAllOwned(ownerSession string) error {
	key := ownerKey(ownerSession)
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := make([]string, 0, len(s.byOwner[key]))
	for id := range s.byOwner[key] {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if err := os.Remove(s.path(id)); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	delete(s.byOwner, key)
	return nil
}

func (s *Store) path(id string) string { return filepath.Join(s.dir, id+".json") }

func (s *Store) addOwner(key, id string) {
	if s.byOwner[key] == nil {
		s.byOwner[key] = map[string]struct{}{}
	}
	s.byOwner[key][id] = struct{}{}
}

func (s *Store) removeOwner(key, id string) {
	delete(s.byOwner[key], id)
	if len(s.byOwner[key]) == 0 {
		delete(s.byOwner, key)
	}
}

func (s *Store) removeExpired(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = os.Remove(s.path(id))
	for key := range s.byOwner {
		s.removeOwner(key, id)
	}
}

func ownerKey(sessionID string) string {
	sum := sha256.Sum256([]byte(sessionID))
	return hex.EncodeToString(sum[:])
}

func sameOwner(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func newID() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

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

func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".share-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
