package share

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	TTL               = 30 * 24 * time.Hour
	MaxActivePerOwner = 20
	MaxActiveShares   = 1000
	maxClockSkew      = 5 * time.Minute
	quarantineTTL     = 7 * 24 * time.Hour
)

var (
	ErrNotFound = errors.New("share not found")
	ErrQuota    = errors.New("active share quota exceeded")
)

type Record struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	OwnerKey  string    `json:"ownerKey,omitempty"`
	Legacy    bool      `json:"legacy,omitempty"`
	View      ShareView `json:"view"`
}

type Store struct {
	dir            string
	mu             sync.RWMutex
	byOwner        map[string]map[string]struct{}
	legacyIDs      map[string]struct{}
	activeFiles    int
	maxFiles       int
	readFile       func(string) ([]byte, error)
	syncDir        func(string) error
	newID          func() (string, error)
	removeFile     func(string) error
	quarantineFile func(string) error
	warn           func(string, error)
}

func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create share directory: %w", err)
	}
	s := &Store{dir: dir, byOwner: map[string]map[string]struct{}{}, legacyIDs: map[string]struct{}{}, maxFiles: MaxActiveShares, readFile: os.ReadFile, syncDir: syncDir, newID: newID, removeFile: removeAndSync, quarantineFile: quarantine, warn: func(message string, err error) { log.Printf("%s: %v", message, err) }}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.Contains(entry.Name(), ".corrupt") {
			if info, infoErr := entry.Info(); infoErr == nil && time.Since(info.ModTime()) > quarantineTTL {
				if err := removeAndSyncWith(filepath.Join(dir, entry.Name()), s.syncDir); err != nil {
					return nil, err
				}
			}
			continue
		}
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		fileID := strings.TrimSuffix(entry.Name(), ".json")
		b, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil, readErr
		}
		record, legacy, decodeErr := decodeRecord(fileID, b, time.Now())
		if errors.Is(decodeErr, errExpired) {
			if err := removeAndSync(path); err != nil {
				return nil, err
			}
			continue
		}
		if legacy && decodeErr == nil {
			s.legacyIDs[fileID] = struct{}{}
			s.activeFiles++
			continue
		}
		if decodeErr != nil {
			if err := quarantine(path); err != nil {
				return nil, err
			}
			continue
		}
		s.addOwner(record.OwnerKey, record.ID)
		s.activeFiles++
	}
	return s, nil
}

func (s *Store) Create(ownerSession string, view ShareView) (*Record, error) {
	if len(view.Questions) == 0 {
		return nil, fmt.Errorf("empty share selection")
	}
	if err := view.Validate(); err != nil {
		return nil, err
	}
	now := time.Now()
	key := ownerKey(ownerSession)
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.pruneExpiredAll(now); err != nil {
		return nil, err
	}
	if len(s.byOwner[key]) >= MaxActivePerOwner {
		return nil, ErrQuota
	}
	if s.activeFiles >= s.maxFiles {
		return nil, ErrQuota
	}
	for attempts := 0; attempts < 8; attempts++ {
		id, err := s.newID()
		if err != nil {
			return nil, err
		}
		record := &Record{ID: id, CreatedAt: now, ExpiresAt: now.Add(TTL), OwnerKey: key, View: view}
		b, err := json.Marshal(record)
		if err != nil {
			return nil, err
		}
		committed, err := atomicWrite(s.path(id), b, s.syncDir)
		if committed {
			// The identity is externally observable after the atomic link. Return
			// success to avoid retry ambiguity, but report reduced crash durability.
			s.addOwner(key, id)
			s.activeFiles++
			if err != nil {
				s.warn("share committed but directory sync failed", err)
			}
			return record, nil
		}
		if errors.Is(err, os.ErrExist) {
			continue
		}
		return nil, err
	}
	return nil, fmt.Errorf("share ID collision limit exceeded")
}

func (s *Store) Load(id string) (*Record, error) {
	if !validID(id) {
		return nil, ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path := s.path(id)
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, ErrNotFound
	}
	record, _, err := decodeRecord(id, b, time.Now())
	if errors.Is(err, errExpired) {
		if cleanupErr := s.removeFile(path); cleanupErr != nil {
			return nil, fmt.Errorf("remove expired share: %w", cleanupErr)
		}
		s.removeIDFromOwners(id)
		delete(s.legacyIDs, id)
		s.activeFiles--
		return nil, ErrNotFound
	}
	if err != nil {
		if cleanupErr := s.quarantineFile(path); cleanupErr != nil {
			return nil, fmt.Errorf("quarantine corrupt share: %w", cleanupErr)
		}
		s.removeIDFromOwners(id)
		delete(s.legacyIDs, id)
		s.activeFiles--
		return nil, ErrNotFound
	}
	return record, nil
}

func (s *Store) DeleteOwned(id, ownerSession string) error {
	if !validID(id) {
		return ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	b, err := s.readFile(s.path(id))
	if err != nil {
		return ErrNotFound
	}
	record, _, err := decodeRecord(id, b, time.Now())
	if err != nil || record.OwnerKey == "" || !sameOwner(record.OwnerKey, ownerKey(ownerSession)) {
		return ErrNotFound
	}
	if err := removeAndSync(s.path(id)); err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	s.removeOwner(record.OwnerKey, id)
	s.activeFiles--
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
		if err := removeAndSync(s.path(id)); err != nil && !os.IsNotExist(err) {
			return err
		}
		s.removeOwner(key, id)
		s.activeFiles--
	}
	return nil
}

var errExpired = errors.New("expired share")

func decodeRecord(fileID string, b []byte, now time.Time) (*Record, bool, error) {
	if err := validateJSONKeys(b); err != nil {
		return nil, false, err
	}
	var envelope map[string]json.RawMessage
	if json.Unmarshal(b, &envelope) != nil {
		return nil, false, fmt.Errorf("invalid JSON")
	}
	_, hasUniverse := envelope["universe"]
	_, hasView := envelope["view"]
	_, hasOwner := envelope["ownerKey"]
	if hasUniverse && !hasView && !hasOwner {
		for key := range envelope {
			switch key {
			case "id", "createdAt", "expiresAt", "legacy", "universe":
			default:
				return nil, false, fmt.Errorf("unknown legacy share field %q", key)
			}
		}
		var old struct {
			ID        string    `json:"id"`
			CreatedAt time.Time `json:"createdAt"`
			ExpiresAt time.Time `json:"expiresAt"`
		}
		if json.Unmarshal(b, &old) != nil || old.ID != fileID || !validID(old.ID) || old.CreatedAt.IsZero() ||
			old.ExpiresAt.IsZero() || !old.ExpiresAt.After(old.CreatedAt) || old.ExpiresAt.Sub(old.CreatedAt) > TTL {
			return nil, false, fmt.Errorf("invalid legacy share")
		}
		if old.CreatedAt.After(now.Add(maxClockSkew)) {
			return nil, false, fmt.Errorf("legacy share created in future")
		}
		if !old.ExpiresAt.IsZero() && !now.Before(old.ExpiresAt) {
			return nil, true, errExpired
		}
		return &Record{ID: old.ID, CreatedAt: old.CreatedAt, ExpiresAt: old.ExpiresAt, Legacy: true,
			View: ShareView{SchemaVersion: ViewSchemaVersion, Legacy: true, Questions: []Question{}, Answers: []Answer{}}}, true, nil
	}
	if hasUniverse {
		return nil, false, fmt.Errorf("ambiguous legacy/current share")
	}
	var record Record
	decoder := json.NewDecoder(bytes.NewReader(b))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&record) != nil || record.ID != fileID || !validID(record.ID) || !validOwnerKey(record.OwnerKey) || record.Legacy {
		return nil, false, fmt.Errorf("invalid current share envelope")
	}
	if record.CreatedAt.IsZero() || record.ExpiresAt.IsZero() || !record.ExpiresAt.After(record.CreatedAt) ||
		record.ExpiresAt.Sub(record.CreatedAt) > TTL+time.Minute || record.CreatedAt.After(now.Add(time.Minute)) {
		return nil, false, fmt.Errorf("invalid current share lifetime")
	}
	if !now.Before(record.ExpiresAt) {
		return nil, false, errExpired
	}
	if len(record.View.Questions) == 0 || record.View.Validate() != nil {
		return nil, false, fmt.Errorf("invalid current share view")
	}
	return &record, false, nil
}

func validateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := consumeJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	return nil
}

func consumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delimiter {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("invalid object key")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate JSON key %q", key)
			}
			seen[key] = struct{}{}
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return fmt.Errorf("invalid object")
		}
	case '[':
		for decoder.More() {
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return fmt.Errorf("invalid array")
		}
	default:
		return fmt.Errorf("unexpected delimiter")
	}
	return nil
}

func (s *Store) pruneExpiredOwned(key string, now time.Time) error {
	for id := range s.byOwner[key] {
		b, err := s.readFile(s.path(id))
		if err != nil {
			if os.IsNotExist(err) {
				s.removeOwner(key, id)
				s.activeFiles--
				continue
			}
			return err
		}
		_, _, err = decodeRecord(id, b, now)
		if errors.Is(err, errExpired) {
			if err := s.removeFile(s.path(id)); err != nil && !os.IsNotExist(err) {
				return err
			}
			s.removeOwner(key, id)
			s.activeFiles--
			continue
		}
		if err != nil {
			if quarantineErr := s.quarantineFile(s.path(id)); quarantineErr != nil {
				return quarantineErr
			}
			s.removeOwner(key, id)
			s.activeFiles--
		}
	}
	return nil
}

func (s *Store) pruneExpiredAll(now time.Time) error {
	if err := s.pruneLegacy(now); err != nil {
		return err
	}
	keys := make([]string, 0, len(s.byOwner))
	for key := range s.byOwner {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if err := s.pruneExpiredOwned(key, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) pruneLegacy(now time.Time) error {
	ids := make([]string, 0, len(s.legacyIDs))
	for id := range s.legacyIDs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		b, err := s.readFile(s.path(id))
		if err != nil {
			if os.IsNotExist(err) {
				delete(s.legacyIDs, id)
				s.activeFiles--
				continue
			}
			return err
		}
		record, legacy, decodeErr := decodeRecord(id, b, now)
		if errors.Is(decodeErr, errExpired) {
			if err := s.removeFile(s.path(id)); err != nil && !os.IsNotExist(err) {
				return err
			}
			delete(s.legacyIDs, id)
			s.activeFiles--
			continue
		}
		if decodeErr != nil {
			if err := s.quarantineFile(s.path(id)); err != nil {
				return err
			}
			delete(s.legacyIDs, id)
			s.activeFiles--
			continue
		}
		if !legacy {
			delete(s.legacyIDs, id)
			s.addOwner(record.OwnerKey, id)
		}
	}
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

func (s *Store) removeIDFromOwners(id string) {
	for key := range s.byOwner {
		s.removeOwner(key, id)
	}
}

func ownerKey(sessionID string) string {
	sum := sha256.Sum256([]byte(sessionID))
	return hex.EncodeToString(sum[:])
}

func validOwnerKey(key string) bool {
	b, err := hex.DecodeString(key)
	return err == nil && len(key) == 64 && len(b) == sha256.Size && hex.EncodeToString(b) == key
}

func sameOwner(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }

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

func atomicWrite(path string, data []byte, syncDirectory func(string) error) (bool, error) {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".share-*.tmp")
	if err != nil {
		return false, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return false, err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return false, err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return false, err
	}
	if err := tmp.Close(); err != nil {
		return false, err
	}
	if err := os.Link(tmpName, path); err != nil {
		return false, err
	}
	if err := syncDirectory(dir); err != nil {
		return true, err
	}
	return true, nil
}

func removeAndSyncWith(path string, syncDirectory func(string) error) error {
	if err := os.Remove(path); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(path))
}

func removeAndSync(path string) error {
	if err := os.Remove(path); err != nil {
		return err
	}
	return syncDir(filepath.Dir(path))
}

func quarantine(path string) error {
	target := strings.TrimSuffix(path, ".json") + ".corrupt"
	if _, err := os.Stat(target); err == nil {
		target += fmt.Sprintf("-%d", time.Now().UnixNano())
	}
	if err := os.Rename(path, target); err != nil {
		return err
	}
	return syncDir(filepath.Dir(path))
}

func syncDir(dir string) error {
	f, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
