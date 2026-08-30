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

const ownerRegistryVersion = "owner-registry.v2"

type registryRole string

const (
	registryPrimary  registryRole = "primary"
	registryRecovery registryRole = "recovery"
)

var errRegistryDurabilityUncertain = errors.New("registry durability uncertain")

type registryDurabilityError struct{ cause error }

func (e *registryDurabilityError) Error() string {
	return fmt.Sprintf("%v: %v", errRegistryDurabilityUncertain, e.cause)
}

func (e *registryDurabilityError) Unwrap() []error {
	return []error{errRegistryDurabilityUncertain, e.cause}
}

func (e *registryDurabilityError) DurabilityUncertain() bool { return true }

type sessionRecord struct {
	Owner     string       `json:"owner"`
	Role      registryRole `json:"role"`
	ExpiresAt time.Time    `json:"expiresAt"`
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
	maxOwners  int
	renameFile func(string, string) error
	syncDir    func(string) error
	onPersist  func()
}

func newSessionRegistry(dir string) *sessionRegistry {
	return &sessionRegistry{
		path: filepath.Join(dir, ".sessions"), records: map[string]sessionRecord{},
		maxOwners: share.MaxActiveShares, renameFile: os.Rename, syncDir: syncDirectory,
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
	if decodeErr != nil || envelope.Version != ownerRegistryVersion || envelope.Records == nil || len(envelope.Records) > 2*r.maxOwners {
		if err := quarantineRegistry(r.path, r.syncDir); err != nil {
			return nil, registryInvalid, err
		}
		return r, registryInvalid, nil
	}
	byOwner := map[string]map[registryRole]string{}
	expiryByOwner := map[string]time.Time{}
	expiredOwners := map[string]struct{}{}
	for key, record := range envelope.Records {
		if !validHash(key) || !validSessionID(record.Owner) || (record.Role != registryPrimary && record.Role != registryRecovery) ||
			record.ExpiresAt.IsZero() || record.ExpiresAt.After(now.Add(share.TTL+time.Minute)) {
			return quarantineInvalidRegistry(r)
		}
		if byOwner[record.Owner] == nil {
			byOwner[record.Owner] = map[registryRole]string{}
			expiryByOwner[record.Owner] = record.ExpiresAt
		}
		if _, duplicate := byOwner[record.Owner][record.Role]; duplicate || !record.ExpiresAt.Equal(expiryByOwner[record.Owner]) {
			return quarantineInvalidRegistry(r)
		}
		byOwner[record.Owner][record.Role] = key
		if !record.ExpiresAt.After(now) {
			expiredOwners[record.Owner] = struct{}{}
		}
	}
	if len(byOwner) > r.maxOwners {
		return quarantineInvalidRegistry(r)
	}
	for owner, roles := range byOwner {
		if _, primary := roles[registryPrimary]; !primary || len(roles) > 2 {
			return quarantineInvalidRegistry(r)
		}
		if _, expired := expiredOwners[owner]; expired {
			continue
		}
	}
	next := map[string]sessionRecord{}
	for key, record := range envelope.Records {
		if _, expired := expiredOwners[record.Owner]; !expired {
			next[key] = record
		}
	}
	if len(next) != len(envelope.Records) {
		if err := r.commit(next); err != nil {
			return r, registryInvalid, err
		}
	} else {
		r.records = next
	}
	return r, registryCurrent, nil
}

func quarantineInvalidRegistry(r *sessionRegistry) (*sessionRegistry, registryLoadState, error) {
	if err := quarantineRegistry(r.path, r.syncDir); err != nil {
		return nil, registryInvalid, err
	}
	return r, registryInvalid, nil
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

func (r *sessionRegistry) lookupRole(id string, now time.Time) (string, registryRole, bool) {
	record, ok := r.records[sessionHash(id)]
	return record.Owner, record.Role, ok && record.Owner != "" && record.ExpiresAt.After(now)
}

func ownerCount(records map[string]sessionRecord) int {
	owners := map[string]struct{}{}
	for _, record := range records {
		owners[record.Owner] = struct{}{}
	}
	return len(owners)
}

func pruneExpiredOwners(records map[string]sessionRecord, now time.Time) {
	expired := map[string]struct{}{}
	for _, record := range records {
		if !record.ExpiresAt.After(now) {
			expired[record.Owner] = struct{}{}
		}
	}
	for key, record := range records {
		if _, remove := expired[record.Owner]; remove {
			delete(records, key)
		}
	}
}

func (r *sessionRegistry) promote(id, owner string, expiresAt time.Time) error {
	next := cloneRecords(r.records)
	now := time.Now()
	pruneExpiredOwners(next, now)
	key := sessionHash(id)
	ownerExists := false
	for recordKey, record := range next {
		if record.Owner == owner {
			ownerExists = true
			if record.Role == registryPrimary && recordKey != key {
				delete(next, recordKey)
			}
		}
	}
	if !ownerExists && r.maxOwners > 0 && ownerCount(next) >= r.maxOwners {
		return errSessionCapacity
	}
	next[key] = sessionRecord{Owner: owner, Role: registryPrimary, ExpiresAt: expiresAt}
	return r.commit(next)
}

func (r *sessionRegistry) rotateIfPromoted(oldID, newID, owner string, expiresAt time.Time) (bool, error) {
	oldKey := sessionHash(oldID)
	old, exists := r.records[oldKey]
	if !exists || old.Role != registryPrimary || old.Owner != owner {
		return false, nil
	}
	next := cloneRecords(r.records)
	for key, record := range next {
		if record.Owner == owner {
			delete(next, key)
		}
	}
	next[sessionHash(newID)] = sessionRecord{Owner: owner, Role: registryPrimary, ExpiresAt: expiresAt}
	next[oldKey] = sessionRecord{Owner: owner, Role: registryRecovery, ExpiresAt: expiresAt}
	err := r.commit(next)
	return err == nil || errors.Is(err, errRegistryDurabilityUncertain), err
}

func (r *sessionRegistry) confirmPrimary(id string, now time.Time) (bool, error) {
	key := sessionHash(id)
	record, exists := r.records[key]
	if !exists || record.Role != registryPrimary || !record.ExpiresAt.After(now) {
		return false, nil
	}
	next := cloneRecords(r.records)
	changed := false
	for otherKey, other := range next {
		if other.Owner == record.Owner && other.Role == registryRecovery {
			delete(next, otherKey)
			changed = true
		}
	}
	if !changed {
		return true, nil
	}
	return true, r.commit(next)
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
	return r.commit(next)
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
	return r.commit(next)
}

func (r *sessionRegistry) provenOwnerKeys() map[string]struct{} {
	result := make(map[string]struct{}, len(r.records))
	for _, record := range r.records {
		if record.Role == registryPrimary {
			result[sessionHash(record.Owner)] = struct{}{}
		}
	}
	return result
}

// commit mirrors the filesystem commit point: before rename/remove succeeds an
// error leaves memory untouched; afterwards memory advances to the candidate
// even when the parent-directory fsync reports uncertain crash durability.
func (r *sessionRegistry) commit(next map[string]sessionRecord) error {
	err := r.persist(next)
	if err == nil || errors.Is(err, errRegistryDurabilityUncertain) {
		r.records = next
	}
	return err
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
		if err := r.syncDir(dir); err != nil {
			return &registryDurabilityError{cause: err}
		}
		return nil
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
	if err := r.syncDir(dir); err != nil {
		return &registryDurabilityError{cause: err}
	}
	return nil
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
