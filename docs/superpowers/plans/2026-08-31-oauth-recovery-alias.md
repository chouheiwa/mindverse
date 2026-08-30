# OAuth Recovery Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always rotate the OAuth authentication bearer while retaining, only when needed, one old-cookie capability that can revoke existing public shares and nothing else.

**Architecture:** Bump the owner registry to `owner-registry.v2` and label each hashed bearer as `primary` or `recovery`. OAuth atomically replaces the promoted primary with a new primary plus the old ID as recovery before installing credentials; HTTP middleware materializes recovery IDs as ephemeral revocation-only contexts and full routes reject them. The first private request made with the new primary confirms delivery by deleting its recovery alias.

**Tech Stack:** Go `net/http`, JSON filesystem registry with fsync/rename durability, Go tests and race detector.

---

### Task 1: Lock the security contract with failing tests

**Files:**
- Modify: `internal/server/security_regression_test.go`
- Modify: `internal/server/server_test.go`

- [x] Add a complete promoted-cookie OAuth attack-chain test covering rotation, private-route denial, recovery-only deletion, new-cookie authorization, and primary confirmation.
- [x] Add pre-rename and post-rename failure tests proving old-full preservation versus recovery-only downgrade.
- [x] Add restart, last-share cleanup, v1 migration, and owner-count capacity tests.
- [x] Run the selected tests and verify failures describe the missing v2/recovery behavior.

### Task 2: Implement owner-registry v2

**Files:**
- Modify: `internal/server/session_registry.go`

- [x] Add `primary` and `recovery` roles, strict v2 validation, one primary and at most one recovery per owner.
- [x] Count capacity by unique owners, not record aliases.
- [x] Implement atomic rotate-with-recovery, confirm-primary, owner removal, and reconciliation using the existing commit-point-aware persistence helper.
- [x] Run registry tests until green.

### Task 3: Enforce revocation-only authorization

**Files:**
- Modify: `internal/server/server.go`
- Test: `internal/server/security_regression_test.go`

- [x] Materialize recovery cookies only as ephemeral contexts with an owner ID and no private state.
- [x] Reject recovery contexts from every private/auth/generation/seed/share-create route.
- [x] Permit only owner share deletion and restricted owner-share cleanup; never mutate the new auth session.
- [x] Confirm a primary on its first full private request and delete the recovery alias atomically.
- [x] Run permission-matrix tests until green.

### Task 4: Make OAuth rotation crash-consistent

**Files:**
- Modify: `internal/server/server.go`
- Test: `internal/server/security_regression_test.go`

- [x] Rotate every successful OAuth authentication.
- [x] Persist promoted primary+recovery before token installation or `Set-Cookie`.
- [x] Preserve the old full session on pre-rename failure.
- [x] On durability-uncertain post-rename failure, scrub/remove old full state and expose only recovery revocation without issuing the new cookie.
- [x] Run targeted race tests repeatedly.

### Task 5: Document and verify

**Files:**
- Modify: `README.md`
- Modify: `docs/implementation/2026-08-31-知见宇宙承重层-status.md`

- [x] Document unconditional authentication rotation and recovery-only response-loss behavior.
- [x] Run Go test/race/vet, frontend test/lint/build/audit, reproducible build hashes, diff check, and secret scan.
- [x] Commit the verified change.
