package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

type sessionRecord struct {
	Owner     string    `json:"owner"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// sessionRegistry remembers only hashes of server-issued bearer IDs. This lets
// share ownership survive a restart without accepting an attacker-chosen ID.
// Access tokens and personal universe data remain memory-only.
type sessionRegistry struct {
	path       string
	records    map[string]sessionRecord
	maxRecords int
}

func loadSessionRegistry(dir string, now time.Time) (*sessionRegistry, error) {
	r := &sessionRegistry{path: filepath.Join(dir, ".sessions"), records: map[string]sessionRecord{}, maxRecords: maxSessionCount}
	raw, err := os.ReadFile(r.path)
	if errors.Is(err, os.ErrNotExist) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &r.records); err != nil {
		return nil, err
	}
	changed := false
	for key, record := range r.records {
		if record.Owner == "" || !record.ExpiresAt.After(now) {
			delete(r.records, key)
			changed = true
		}
	}
	if changed {
		if err := r.save(); err != nil {
			return nil, err
		}
	}
	return r, nil
}

func sessionHash(id string) string {
	sum := sha256.Sum256([]byte(id))
	return hex.EncodeToString(sum[:])
}

func (r *sessionRegistry) lookup(id string, now time.Time) (string, bool) {
	record, ok := r.records[sessionHash(id)]
	return record.Owner, ok && record.Owner != "" && record.ExpiresAt.After(now)
}

func (r *sessionRegistry) put(id, owner string, expiresAt time.Time) error {
	key := sessionHash(id)
	if _, exists := r.records[key]; !exists && r.maxRecords > 0 && len(r.records) >= r.maxRecords {
		now := time.Now()
		for recordKey, record := range r.records {
			if !record.ExpiresAt.After(now) {
				delete(r.records, recordKey)
			}
		}
		if len(r.records) >= r.maxRecords {
			return errSessionCapacity
		}
	}
	r.records[key] = sessionRecord{Owner: owner, ExpiresAt: expiresAt}
	return r.save()
}

func (r *sessionRegistry) rotate(oldID, newID, owner string, expiresAt time.Time) error {
	oldKey, newKey := sessionHash(oldID), sessionHash(newID)
	old, hadOld := r.records[oldKey]
	delete(r.records, oldKey)
	r.records[newKey] = sessionRecord{Owner: owner, ExpiresAt: expiresAt}
	if err := r.save(); err != nil {
		delete(r.records, newKey)
		if hadOld {
			r.records[oldKey] = old
		}
		return err
	}
	return nil
}

func (r *sessionRegistry) remove(id string) error {
	delete(r.records, sessionHash(id))
	return r.save()
}

func (r *sessionRegistry) save() error {
	if err := os.MkdirAll(filepath.Dir(r.path), 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(r.records)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(r.path), ".sessions-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, r.path)
}
