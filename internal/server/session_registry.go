package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/chouheiwa/mindverse/internal/share"
)

const ownerRegistryVersion = "owner-registry.v1"

type sessionRecord struct {
	Owner     string    `json:"owner"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type registryEnvelope struct {
	Version string                   `json:"version"`
	Records map[string]sessionRecord `json:"records"`
}

type registryLoadState string

const (
	registryCurrent registryLoadState = "current"
	registryMissing registryLoadState = "missing"
	registryInvalid registryLoadState = "invalid"
)

// sessionRegistry contains only sessions that currently own persisted public
// shares. Anonymous sessions, OAuth state/token, and private universes never enter it.
type sessionRegistry struct {
	path       string
	records    map[string]sessionRecord
	maxRecords int
	renameFile func(string, string) error
	syncDir    func(string) error
	onPersist  func()
}

func newSessionRegistry(dir string) *sessionRegistry {
	return &sessionRegistry{
		path: filepath.Join(dir, ".sessions"), records: map[string]sessionRecord{},
		maxRecords: share.MaxActiveShares, renameFile: os.Rename, syncDir: syncDirectory,
	}
}

func loadSessionRegistry(dir string, now time.Time) (*sessionRegistry, registryLoadState, error) {
	r := newSessionRegistry(dir)
	raw, err := os.ReadFile(r.path)
	if errors.Is(err, os.ErrNotExist) {
		return r, registryMissing, nil
	}
	if err != nil {
		return nil, registryInvalid, err
	}
	if err := os.Chmod(filepath.Dir(r.path), 0o700); err != nil {
		return nil, registryInvalid, err
	}
	if err := os.Chmod(r.path, 0o600); err != nil {
		return nil, registryInvalid, err
	}
	var envelope registryEnvelope
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	decodeErr := decoder.Decode(&envelope)
	if decodeErr == nil {
		if _, trailing := decoder.Token(); trailing != io.EOF {
			decodeErr = fmt.Errorf("trailing registry JSON")
		}
	}
	if decodeErr != nil || envelope.Version != ownerRegistryVersion || envelope.Records == nil || len(envelope.Records) > r.maxRecords {
		if err := quarantineRegistry(r.path, r.syncDir); err != nil {
			return nil, registryInvalid, err
		}
		return r, registryInvalid, nil
	}
	next := map[string]sessionRecord{}
	changed := false
	for key, record := range envelope.Records {
		if !validHash(key) || !validSessionID(record.Owner) || record.ExpiresAt.IsZero() || !record.ExpiresAt.After(now) || record.ExpiresAt.After(now.Add(share.TTL+time.Minute)) {
			changed = true
			continue
		}
		next[key] = record
	}
	if changed {
		if err := r.persist(next); err != nil {
			return nil, registryInvalid, err
		}
	}
	r.records = next
	return r, registryCurrent, nil
}

func sessionHash(id string) string {
	sum := sha256.Sum256([]byte(id))
	return hex.EncodeToString(sum[:])
}

func validHash(value string) bool {
	b, err := hex.DecodeString(value)
	return err == nil && len(b) == sha256.Size && hex.EncodeToString(b) == value
}

func cloneRecords(source map[string]sessionRecord) map[string]sessionRecord {
	result := make(map[string]sessionRecord, len(source))
	for key, record := range source {
		result[key] = record
	}
	return result
}

func (r *sessionRegistry) lookup(id string, now time.Time) (string, bool) {
	record, ok := r.records[sessionHash(id)]
	return record.Owner, ok && record.Owner != "" && record.ExpiresAt.After(now)
}

func (r *sessionRegistry) promote(id, owner string, expiresAt time.Time) error {
	next := cloneRecords(r.records)
	now := time.Now()
	for key, record := range next {
		if !record.ExpiresAt.After(now) {
			delete(next, key)
		}
	}
	key := sessionHash(id)
	if _, exists := next[key]; !exists && r.maxRecords > 0 && len(next) >= r.maxRecords {
		return errSessionCapacity
	}
	next[key] = sessionRecord{Owner: owner, ExpiresAt: expiresAt}
	if err := r.persist(next); err != nil {
		return err
	}
	r.records = next
	return nil
}

func (r *sessionRegistry) rotateIfPromoted(oldID, newID, owner string, expiresAt time.Time) (bool, error) {
	oldKey := sessionHash(oldID)
	if _, exists := r.records[oldKey]; !exists {
		return false, nil
	}
	next := cloneRecords(r.records)
	delete(next, oldKey)
	next[sessionHash(newID)] = sessionRecord{Owner: owner, ExpiresAt: expiresAt}
	if err := r.persist(next); err != nil {
		return false, err
	}
	r.records = next
	return true, nil
}

func (r *sessionRegistry) removeOwner(owner string) error {
	next := cloneRecords(r.records)
	for key, record := range next {
		if record.Owner == owner {
			delete(next, key)
		}
	}
	if len(next) == len(r.records) {
		return nil
	}
	if err := r.persist(next); err != nil {
		return err
	}
	r.records = next
	return nil
}

func (r *sessionRegistry) retainOwners(ownerKeys map[string]struct{}) error {
	next := cloneRecords(r.records)
	for key, record := range next {
		if _, exists := ownerKeys[sessionHash(record.Owner)]; !exists {
			delete(next, key)
		}
	}
	if len(next) == len(r.records) {
		return nil
	}
	if err := r.persist(next); err != nil {
		return err
	}
	r.records = next
	return nil
}

func (r *sessionRegistry) provenOwnerKeys() map[string]struct{} {
	result := make(map[string]struct{}, len(r.records))
	for _, record := range r.records {
		result[sessionHash(record.Owner)] = struct{}{}
	}
	return result
}

func (r *sessionRegistry) persist(next map[string]sessionRecord) error {
	if r.onPersist != nil {
		r.onPersist()
	}
	dir := filepath.Dir(r.path)
	if len(next) == 0 {
		if err := os.Remove(r.path); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		return r.syncDir(dir)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(registryEnvelope{Version: ownerRegistryVersion, Records: next})
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".sessions-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
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
	if err := r.renameFile(tmpName, r.path); err != nil {
		return err
	}
	return r.syncDir(dir)
}

func quarantineRegistry(path string, syncDir func(string) error) error {
	target := path + ".registry-invalid"
	if _, err := os.Stat(target); err == nil {
		target += fmt.Sprintf("-%d", time.Now().UnixNano())
	}
	if err := os.Rename(path, target); err != nil {
		return err
	}
	return syncDir(filepath.Dir(path))
}

func syncDirectory(dir string) error {
	f, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
