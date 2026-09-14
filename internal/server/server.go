// Package server 提供 HTTP 接口，把「登录 → 采集 → 抽取 → 引擎 → 星图」串起来。
package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/extract"
	"github.com/chouheiwa/mindverse/internal/progress"
	"github.com/chouheiwa/mindverse/internal/seed"
	"github.com/chouheiwa/mindverse/internal/share"
	"github.com/chouheiwa/mindverse/internal/store"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

const cookieName = "mindverse_session"
const maxSessionCount = 10000
const sessionCleanupInterval = time.Minute
const oauthStateTTL = 10 * time.Minute

// quotaCacheTTL 是额度快照的有效期。额度查询不消耗业务额度，但仍是一次往返：
// 每次生成前查一次就够，不做定时轮询 —— 没人使用时轮询只会白白产生请求。
const quotaCacheTTL = 60 * time.Second

// genState 是一次星图生成的状态。生成要跑模型，必然慢，所以异步 + 轮询。
type genState string

const (
	genIdle    genState = "idle"
	genRunning genState = "running"
	genDone    genState = "done"
	genFailed  genState = "failed"
)

type generation struct {
	Details  *generationDetails `json:"details,omitempty"`
	State    genState           `json:"state"`
	Stage    string             `json:"stage"`
	Progress int                `json:"progress"`
	Error    string             `json:"error,omitempty"`
	Universe *engine.Universe   `json:"universe,omitempty"`
	Filtered int                `json:"filtered"` // 因敏感类目未参与分析的条数
	Source   string             `json:"source"`
	Calls    int                `json:"calls"`
}

// session 只驻留内存。OAuth token 绝不落盘。
type session struct {
	opMu           sync.Mutex
	mu             sync.Mutex
	id             string
	ownerID        string
	epoch          uint64
	genCancel      context.CancelFunc
	authCancel     context.CancelFunc
	authOp         uint64
	state          string
	stateExpiresAt time.Time
	token          *zhihu.Token
	stateChecked   bool
	profile        *zhihu.Profile
	gen            generation
	seedCorpus     *zhihu.Corpus // 游客模式：现场挑出来的语料
	genToday       int
	genDay         string
	lastSeen       time.Time
	active         int // guarded by Server.mu; active leases are never evictable
	revocationOnly bool
	confirmPrimary bool
	analysisOwner  string // server-derived cache owner; never supplied by the browser
}

type shareStore interface {
	Create(string, share.ShareView) (*share.Record, error)
	Load(string) (*share.Record, error)
	DeleteOwned(string, string) error
	DeleteAllOwned(string) error
}

type shareOwnerLifecycle interface {
	OwnerKeys() []string
	HasOwner(string) bool
}

// Server 是应用主体。
type Server struct {
	cfg      *config.Config
	oauth    *zhihu.OAuth
	store    shareStore
	registry *sessionRegistry
	ext      extract.Extractor
	analysis *extract.Cache
	seed     *seed.Builder
	quota    *zhihu.QuotaGate
	db       *store.DB

	mu                 sync.Mutex
	ownerMu            sync.Mutex
	sess               map[string]*session
	lastSessionCleanup time.Time
	maxSessions        int
	onSessionCleanup   func()
	onSessionLease     func(*session)
}

// New 构造服务。
func New(cfg *config.Config, ext extract.Extractor) (*Server, error) {
	analysis, err := extract.NewCache(filepath.Join(cfg.SnapshotDir, ".analysis"))
	if err != nil {
		return nil, err
	}
	store, err := share.NewStore(cfg.SnapshotDir)
	if err != nil {
		return nil, err
	}
	registry, registryState, err := loadSessionRegistry(cfg.SnapshotDir, time.Now())
	if err != nil {
		return nil, fmt.Errorf("load session registry: %w", err)
	}
	proven := map[string]struct{}{}
	if registryState == registryCurrent {
		proven = registry.provenOwnerKeys()
	}
	if err := store.QuarantineUnproven(proven, "owner-proof-missing"); err != nil {
		return nil, fmt.Errorf("quarantine shares without revocation proof: %w", err)
	}
	remaining := map[string]struct{}{}
	for _, key := range store.OwnerKeys() {
		remaining[key] = struct{}{}
	}
	if err := registry.retainOwners(remaining); err != nil {
		return nil, fmt.Errorf("reconcile session registry: %w", err)
	}
	db, err := openLocalDB(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	return &Server{
		cfg: cfg, store: store, ext: ext, db: db, analysis: analysis,
		registry:    registry,
		seed:        seed.NewBuilder(zhihu.NewClient(cfg.AccessSecret, "")),
		quota:       zhihu.NewQuotaGate(zhihu.NewClient(cfg.AccessSecret, ""), quotaCacheTTL),
		oauth:       &zhihu.OAuth{AppID: cfg.AppID, AppKey: cfg.AppKey, RedirectURI: cfg.RedirectURI},
		sess:        map[string]*session{},
		maxSessions: maxSessionCount,
	}, nil
}

// Routes 装配路由。
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	private := func(pattern string, handler http.HandlerFunc) {
		mux.Handle(pattern, noStore(s.csrfGuard(s.withSession(requireFullSession(handler)))))
	}
	revocable := func(pattern string, handler http.HandlerFunc) {
		mux.Handle(pattern, noStore(s.csrfGuard(s.withSession(handler))))
	}
	private("GET /api/oauth/status", s.oauthStatus)
	private("GET /auth/start", s.authStart)
	private("GET /auth/callback", s.authCallback)
	private("POST /auth/logout", s.authLogout)
	private("GET /api/seed/topics", s.seedTopics)
	private("POST /api/seed", s.seedStart)
	private("POST /api/universe", s.universeStart)
	private("GET /api/universe", s.universeGet)
	private("POST /api/share", s.shareCreate)
	private("POST /api/share/preview", s.sharePreview)
	mux.Handle("GET /api/share/{id}", noStore(http.HandlerFunc(s.shareGet)))
	revocable("DELETE /api/share/{id}", s.shareDelete)
	revocable("DELETE /api/session/data", s.wipe)
	// 分享页复用同一张星图，数据由 /api/share/{id} 提供
	mux.HandleFunc("GET /s/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !publicShareID(id) || r.URL.EscapedPath() != "/s/"+url.PathEscape(id) {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(s.cfg.WebDir, "universe.html"))
	})
	mux.Handle("/", http.FileServer(http.Dir(s.cfg.WebDir)))
	return mux
}

func requireFullSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if sess := fromCtx(r); sess != nil && sess.revocationOnly {
			writeErr(w, http.StatusForbidden, "该会话仅可撤销此前创建的公开分享")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) csrfGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeErr(w, http.StatusForbidden, "跨站请求已拒绝")
			return
		}
		if raw := r.Header.Get("Origin"); raw != "" {
			origin, err := url.Parse(raw)
			expectedScheme := "https"
			if s.cfg.LocalOnly() {
				expectedScheme = "http"
			}
			if err != nil || origin.Scheme != expectedScheme || origin.Host != r.Host || origin.User != nil || origin.Path != "" {
				writeErr(w, http.StatusForbidden, "请求来源校验失败")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func publicShareID(id string) bool {
	if id == "" {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// ── 会话 ──

func (s *Server) withSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.acquireSession(w, r)
		if err != nil {
			writeErr(w, http.StatusServiceUnavailable, "会话已满，请稍后重试")
			return
		}
		defer s.releaseSession(sess)
		if s.onSessionLease != nil {
			s.onSessionLease(sess)
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, sess)))
	})
}

type ctxKey struct{}

func fromCtx(r *http.Request) *session {
	v, _ := r.Context().Value(ctxKey{}).(*session)
	return v
}

var errSessionCapacity = errors.New("session capacity reached")

func (s *Server) acquireSession(w http.ResponseWriter, r *http.Request) (*session, error) {
	now := time.Now()
	s.evictIdleSessions(now)
	if c, err := r.Cookie(cookieName); err == nil {
		s.mu.Lock()
		sess, ok := s.sess[c.Value]
		if ok && sess.confirmPrimary {
			_, confirmErr := s.registry.confirmPrimary(c.Value, now)
			if confirmErr != nil {
				s.mu.Unlock()
				return nil, confirmErr
			}
			sess.confirmPrimary = false
		}
		owner, role, issued := s.registry.lookupRole(c.Value, now)
		if !ok && validSessionID(c.Value) && issued && role == registryRecovery {
			s.mu.Unlock()
			sess = &session{id: c.Value, ownerID: owner, lastSeen: now, revocationOnly: true}
			s.setSessionCookie(w, sess.id)
			return sess, nil
		}
		if !ok && validSessionID(c.Value) && issued && role == registryPrimary && s.ensureSessionCapacityLocked() {
			_, confirmErr := s.registry.confirmPrimary(c.Value, now)
			if confirmErr != nil {
				s.mu.Unlock()
				return nil, confirmErr
			}
			sess = &session{id: c.Value, ownerID: owner, lastSeen: now}
			s.sess[c.Value] = sess
			ok = true
		}
		if ok {
			sess.active++
		}
		s.mu.Unlock()
		if ok {
			s.setSessionCookie(w, sess.id)
			return sess, nil
		}
	}
	id, err := randomToken()
	if err != nil {
		panic("generate session identifier: " + err.Error())
	}
	ownerID, err := randomToken()
	if err != nil {
		panic("generate owner identifier: " + err.Error())
	}
	sess := &session{id: id, ownerID: ownerID, lastSeen: now}
	s.mu.Lock()
	if !s.ensureSessionCapacityLocked() {
		s.mu.Unlock()
		return nil, errSessionCapacity
	}
	sess.active = 1
	s.sess[id] = sess
	s.mu.Unlock()
	s.setSessionCookie(w, id)
	return sess, nil
}

func (s *Server) releaseSession(sess *session) {
	if sess.revocationOnly {
		return
	}
	s.mu.Lock()
	if sess.active > 0 {
		sess.active--
	}
	sess.mu.Lock()
	sess.lastSeen = time.Now()
	sess.mu.Unlock()
	s.mu.Unlock()
}

func (s *Server) evictIdleSessions(now time.Time) {
	s.mu.Lock()
	if !s.lastSessionCleanup.IsZero() && now.Sub(s.lastSessionCleanup) < sessionCleanupInterval {
		s.mu.Unlock()
		return
	}
	s.lastSessionCleanup = now
	for id, sess := range s.sess {
		if sess.active != 0 {
			continue
		}
		sess.mu.Lock()
		idle := now.Sub(sess.lastSeen) > share.TTL
		sess.mu.Unlock()
		if idle {
			delete(s.sess, id)
		}
	}
	hook := s.onSessionCleanup
	s.mu.Unlock()
	if hook != nil {
		hook()
	}
}

func (s *Server) ensureSessionCapacityLocked() bool {
	if s.maxSessions <= 0 || len(s.sess) < s.maxSessions {
		return true
	}
	var oldestID string
	var oldest time.Time
	for id, sess := range s.sess {
		if sess.active != 0 {
			continue
		}
		sess.mu.Lock()
		seen := sess.lastSeen
		sess.mu.Unlock()
		if oldestID == "" || seen.Before(oldest) || seen.Equal(oldest) && id < oldestID {
			oldestID, oldest = id, seen
		}
	}
	if oldestID == "" {
		return false
	}
	delete(s.sess, oldestID)
	return true
}

func (s *Server) setSessionCookie(w http.ResponseWriter, id string) {
	now := time.Now()
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: id, Path: "/",
		// This bearer cookie is host-only and high entropy. OAuth credentials
		// still expire independently; ownership deletion lasts as long as shares.
		HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: int(share.TTL / time.Second), Expires: now.Add(share.TTL),
		Secure: !s.cfg.LocalOnly(),
	})
}

func validSessionID(id string) bool {
	b, err := base64.RawURLEncoding.DecodeString(id)
	return err == nil && len(id) == 32 && len(b) == 24 && base64.RawURLEncoding.EncodeToString(b) == id
}

func sessionOwner(sess *session) string {
	if sess.ownerID != "" {
		return sess.ownerID
	}
	return sess.id
}

func (s *Server) currentSession(sess *session) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sess[sess.id] == sess
}

func (s *Server) promoteShareOwner(sess *session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.registry.promote(sess.id, sessionOwner(sess), time.Now().Add(share.TTL))
}

func (s *Server) cleanupShareOwner(sess *session) {
	lifecycle, ok := s.store.(shareOwnerLifecycle)
	if !ok || lifecycle.HasOwner(sessionOwner(sess)) {
		return
	}
	s.mu.Lock()
	err := s.registry.removeOwner(sessionOwner(sess))
	s.mu.Unlock()
	if err != nil {
		log.Printf("remove orphan share owner: %v", err)
	}
}

func (s *Server) reconcileShareOwners() {
	lifecycle, ok := s.store.(shareOwnerLifecycle)
	if !ok {
		return
	}
	keys := map[string]struct{}{}
	for _, key := range lifecycle.OwnerKeys() {
		keys[key] = struct{}{}
	}
	s.mu.Lock()
	err := s.registry.retainOwners(keys)
	s.mu.Unlock()
	if err != nil {
		log.Printf("reconcile orphan share owners: %v", err)
	}
}

func randomToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// installAuthenticatedSession always rotates the authentication bearer. If the
// old session owns shares, registry rotation first commits a new primary plus an
// old-ID recovery alias. Only then may credentials enter the new in-memory session.
// Caller must hold old.opMu.
func (s *Server) installAuthenticatedSession(w http.ResponseWriter, old *session, tok *zhihu.Token, profile *zhihu.Profile) error {
	newID, err := randomToken()
	if err != nil {
		return err
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sess[old.id] != old {
		return errors.New("stale session")
	}
	old.mu.Lock()
	defer old.mu.Unlock()
	owner := sessionOwner(old)
	promoted, registryErr := s.registry.rotateIfPromoted(old.id, newID, owner, now.Add(share.TTL))
	if registryErr != nil && !promoted {
		return registryErr
	}
	preservedGen, preservedSeed := old.gen, old.seedCorpus
	preservedAnalysisOwner := old.analysisOwner
	if strings.HasPrefix(preservedAnalysisOwner, "zhihu:") && preservedAnalysisOwner != analysisOwner(&session{token: tok, profile: profile}) {
		preservedAnalysisOwner = ""
		if preservedGen.Source == "live" {
			preservedGen = generation{}
		}
	}
	if old.genCancel != nil {
		old.genCancel()
		preservedGen = generation{}
	}
	nextEpoch := old.epoch + 1
	scrubOld := func() {
		delete(s.sess, old.id)
		old.epoch++
		old.authOp++
		old.genCancel, old.authCancel = nil, nil
		old.token, old.profile, old.seedCorpus = nil, nil, nil
		old.state, old.stateExpiresAt, old.stateChecked = "", time.Time{}, false
		old.gen = generation{}
	}
	if promoted && registryErr != nil {
		scrubOld()
		return registryErr
	}
	fresh := &session{
		id: newID, ownerID: owner, epoch: nextEpoch,
		token: tok, profile: profile, stateChecked: true,
		gen: preservedGen, seedCorpus: preservedSeed,
		analysisOwner: preservedAnalysisOwner,
		genToday:      old.genToday, genDay: old.genDay, lastSeen: now,
		confirmPrimary: promoted,
	}
	scrubOld()
	s.sess[newID] = fresh
	s.setSessionCookie(w, newID)
	return nil
}

// ── 处理器 ──

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true, "source": s.cfg.Source})
}

func (s *Server) oauthStatus(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.mu.Lock()
	authorized := sess.token != nil && !sess.token.Expired()
	checked := sess.stateChecked
	profile := sess.profile
	sess.mu.Unlock()

	warns := []map[string]string{}
	if s.cfg.RedirectURI != "" && !s.cfg.LocalOnly() && !s.cfg.OAuthReady() {
		warns = append(warns, map[string]string{"code": "OAUTH_NOT_READY", "message": "OAuth 配置尚未满足安全登录要求。"})
	}
	// 额度见底要让用户先知道，而不是等生成失败才知道。查询不消耗业务额度。
	if s.cfg.Source == config.SourceLive && authorized {
		if snap, err := s.quota.Snapshot(r.Context()); err == nil {
			for _, item := range snap.Low(zhihu.LowQuotaRatio) {
				warns = append(warns, map[string]string{
					"code":    "QUOTA_LOW",
					"message": fmt.Sprintf("%s今日额度只剩 %d/%d 次，相关功能可能不可用。", item.APIName, item.Remaining, item.Total),
				})
			}
		}
	}
	writeJSON(w, 200, map[string]any{
		"configured":       s.cfg.OAuthReady(),
		"localOnly":        s.cfg.LocalOnly(),
		"authorized":       authorized,
		"appId":            s.cfg.AppID,
		"redirectUri":      s.cfg.RedirectURI,
		"profile":          profile,
		"stateVerified":    checked,
		"csrfClaimAllowed": checked,
		"source":           s.cfg.Source,
		"warnings":         warns,
	})
}

func (s *Server) authStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.LocalOnly() {
		writeErr(w, 409, "本地地址只能预览页面，无法完成知乎登录。请先部署到公网 HTTPS 再配置回调。")
		return
	}
	if !s.cfg.OAuthReady() {
		writeErr(w, http.StatusConflict, "OAuth 配置尚未满足安全登录要求")
		return
	}
	sess := fromCtx(r)
	st, err := randomToken()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "无法创建安全登录状态")
		return
	}
	u, err := s.oauth.AuthorizeURL(st)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	sess.opMu.Lock()
	if !s.currentSession(sess) {
		sess.opMu.Unlock()
		writeErr(w, http.StatusConflict, "登录会话已旋转，请重试")
		return
	}
	sess.mu.Lock()
	sess.state = st
	sess.stateExpiresAt = time.Now().Add(oauthStateTTL)
	sess.mu.Unlock()
	sess.opMu.Unlock()
	http.Redirect(w, r, u, http.StatusFound)
}

func (s *Server) authCallback(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	q := r.URL.Query()
	code := zhihu.CodeFromCallback(q)
	if code == "" {
		writeErr(w, 400, "回调缺少 authorization_code")
		return
	}
	sess.opMu.Lock()
	sess.mu.Lock()
	expected, expiresAt, epoch := sess.state, sess.stateExpiresAt, sess.epoch
	sess.mu.Unlock()
	sess.opMu.Unlock()
	if expected == "" {
		writeErr(w, http.StatusConflict, "登录会话已重置，请重新发起授权")
		return
	}

	ok, checked := zhihu.VerifyState(q.Get("state"), expected)
	if !ok {
		writeErr(w, 400, "state 校验失败")
		return
	}
	if !expiresAt.After(time.Now()) {
		writeErr(w, 400, "state 已过期，请重新发起授权")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	sess.opMu.Lock()
	sess.mu.Lock()
	if sess.epoch != epoch || sess.state != expected || sess.authCancel != nil || !sess.stateExpiresAt.After(time.Now()) {
		sess.mu.Unlock()
		sess.opMu.Unlock()
		writeErr(w, http.StatusConflict, "登录会话已重置，请重新发起授权")
		return
	}
	sess.authCancel = cancel
	sess.authOp++
	authOp := sess.authOp
	// 校验成功后立即消费，不等 token exchange 返回，防止并发重放。
	sess.state = ""
	sess.stateExpiresAt = time.Time{}
	sess.mu.Unlock()
	sess.opMu.Unlock()
	defer func() {
		sess.opMu.Lock()
		sess.mu.Lock()
		if sess.authOp == authOp {
			sess.authCancel = nil
		}
		sess.mu.Unlock()
		sess.opMu.Unlock()
	}()
	tok, err := s.oauth.Exchange(ctx, code)
	if err != nil {
		// 不回显 code / app_key / token 的任何片段
		log.Printf("token 交换失败: %v", err)
		writeErr(w, 502, "换取授权失败，请重试")
		return
	}
	sess.opMu.Lock()
	sess.mu.Lock()
	stale := sess.epoch != epoch || sess.authOp != authOp
	sess.mu.Unlock()
	sess.opMu.Unlock()
	if stale {
		writeErr(w, http.StatusConflict, "登录会话已重置，请重新发起授权")
		return
	}
	cl := zhihu.NewClient(s.cfg.AccessSecret, tok.AccessToken)
	profile := cl.Profile(ctx)

	sess.opMu.Lock()
	defer sess.opMu.Unlock()
	sess.mu.Lock()
	if sess.epoch != epoch || sess.authOp != authOp {
		sess.mu.Unlock()
		writeErr(w, http.StatusConflict, "登录会话已重置，请重新发起授权")
		return
	}
	sess.mu.Unlock()
	if !checked || s.installAuthenticatedSession(w, sess, tok, profile) != nil {
		writeErr(w, http.StatusInternalServerError, "无法安全完成登录，请重试")
		return
	}
	log.Printf("zhihu oauth callback token_received=true expiry_known=%t expired=%t profile_available=%t",
		!tok.ExpiresAt.IsZero(), tok.Expired(), profile != nil)
	http.Redirect(w, r, "/universe.html", http.StatusFound)
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.opMu.Lock()
	defer sess.opMu.Unlock()
	if !s.currentSession(sess) {
		writeErr(w, http.StatusConflict, "会话已旋转")
		return
	}
	sess.mu.Lock()
	sess.epoch++
	if sess.genCancel != nil {
		sess.genCancel()
		sess.genCancel = nil
	}
	if sess.authCancel != nil {
		sess.authCancel()
		sess.authCancel = nil
	}
	sess.authOp++
	sess.token, sess.profile, sess.state, sess.stateExpiresAt, sess.stateChecked = nil, nil, "", time.Time{}, false
	sess.gen = generation{}
	sess.mu.Unlock()
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// provider 按当前配置与会话状态选择语料来源。
// Provider 之上的代码不感知这里选了哪一个。
func (s *Server) provider(sess *session) (zhihu.Provider, error) {
	sess.mu.Lock()
	seeded := sess.seedCorpus
	sess.mu.Unlock()
	if seeded != nil {
		return &zhihu.SeedProvider{Picked: seeded.Items}, nil
	}
	switch s.cfg.Source {
	case config.SourceLive:
		sess.mu.Lock()
		tok := sess.token
		sess.mu.Unlock()
		if tok == nil || tok.Expired() {
			return nil, fmt.Errorf("请先完成知乎账号授权")
		}
		return &zhihu.LiveProvider{
			Client: zhihu.NewClient(s.cfg.AccessSecret, tok.AccessToken),
			Plan:   zhihu.DefaultPlan(),
		}, nil
	case config.SourceMock:
		return &zhihu.MockProvider{Path: s.cfg.MockPath}, nil
	default:
		return nil, fmt.Errorf("暂不支持的语料来源: %s", s.cfg.Source)
	}
}

func (s *Server) seedTopics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"topics": seed.Topics(), "min": seed.MinPicks, "max": seed.MaxPicks,
	})
}

// seedStart 用现场挑选的方向展开语料，然后走同一条生成链路。
func (s *Server) seedStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.AccessSecret == "" {
		writeErr(w, 503, "游客模式需要开放平台 Access Secret 才能展开选题")
		return
	}
	var body struct {
		Picks []string `json:"picks"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&body); err != nil {
		writeErr(w, 400, "请求格式不对")
		return
	}
	sess := fromCtx(r)
	sess.mu.Lock()
	sess.epoch++
	if sess.genCancel != nil {
		sess.genCancel()
	}
	epoch := sess.epoch
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	sess.genCancel = cancel
	sess.mu.Unlock()
	defer cancel()

	corpus, err := s.seed.Build(ctx, body.Picks)
	if err != nil {
		updateGeneration(sess, epoch, func() { sess.genCancel = nil })
		writeErr(w, 400, err.Error())
		return
	}
	sess.mu.Lock()
	if sess.epoch != epoch {
		sess.mu.Unlock()
		writeErr(w, http.StatusConflict, "会话数据已被删除")
		return
	}
	sess.genCancel = nil
	sess.seedCorpus = corpus
	sess.gen = generation{}
	sess.mu.Unlock()

	writeJSON(w, 200, map[string]any{"items": len(corpus.Items), "calls": corpus.Calls})
}

func (s *Server) universeStart(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.mu.Lock()
	if sess.gen.State == genRunning {
		sess.mu.Unlock()
		writeJSON(w, 202, map[string]string{"state": string(genRunning)})
		return
	}
	today := time.Now().Format("2006-01-02")
	if sess.genDay != today {
		sess.genDay, sess.genToday = today, 0
	}
	if sess.genToday >= s.cfg.MaxPerUserDay {
		sess.mu.Unlock()
		writeErr(w, 429, fmt.Sprintf("今天已生成 %d 次，明天再来吧", s.cfg.MaxPerUserDay))
		return
	}
	sess.genToday++
	sess.epoch++
	if sess.genCancel != nil {
		sess.genCancel()
	}
	stage := "正在读取你的知乎足迹"
	if sess.seedCorpus != nil {
		stage = "正在读取公开样本内容"
	}
	sess.gen = generation{State: genRunning, Stage: stage, Progress: 5}
	epoch := sess.epoch
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	sess.genCancel = cancel
	sess.mu.Unlock()

	prov, err := s.provider(sess)
	if err != nil {
		cancel()
		updateGeneration(sess, epoch, func() { sess.gen = generation{State: genFailed, Error: err.Error()} })
		writeErr(w, 401, err.Error())
		return
	}
	if !s.retainSession(sess) {
		cancel()
		writeErr(w, http.StatusConflict, "会话已重置")
		return
	}
	go s.generateAt(sess, prov, epoch, ctx, cancel)
	writeJSON(w, 202, map[string]string{"state": string(genRunning)})
}

func (s *Server) generate(sess *session, prov zhihu.Provider) {
	if !s.retainSession(sess) {
		return
	}
	sess.mu.Lock()
	epoch := sess.epoch
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	sess.genCancel = cancel
	sess.mu.Unlock()
	s.generateAt(sess, prov, epoch, ctx, cancel)
}

func (s *Server) generateAt(sess *session, prov zhihu.Provider, epoch uint64, ctx context.Context, cancel context.CancelFunc) {
	defer s.releaseSession(sess)
	defer cancel()
	tracker := &generationTracker{}
	ctx = progress.WithObserver(ctx, func(e progress.Event) {
		tracker.mu.Lock()
		defer tracker.mu.Unlock()
		d := tracker.observe(e, time.Now())
		updateGeneration(sess, epoch, func() {
			sess.gen.Details = &d
			pct := sess.gen.Progress
			switch e.Phase {
			case "collect":
				sess.gen.Stage = "正在读取本次内容"
				if e.FoldersTotal > 0 {
					pct = 5 + 15*e.FoldersDone/e.FoldersTotal
				}
			case "cache":
				sess.gen.Stage = "正在检查已有分析"
				pct = 25
			case "analyze":
				sess.gen.Stage = "正在提取内容中的概念"
				if e.Total > 0 {
					pct = 30 + 35*e.Done/e.Total
				}
			case "normalize":
				sess.gen.Stage = "正在合并同义概念"
				pct = 67
			case "layout":
				sess.gen.Stage = "正在计算星图结构"
				pct = 70
			case "name":
				sess.gen.Stage = "正在为星群命名"
				if e.Total > 0 {
					pct = 75 + 20*e.Done/e.Total
				}
			}
			sess.gen.Progress = max(sess.gen.Progress, pct)
		})
	})
	progress.Report(ctx, progress.Event{Phase: "collect"})

	setStage := func(stage string, pct int) bool {
		return updateGeneration(sess, epoch, func() { sess.gen.Stage, sess.gen.Progress = stage, pct })
	}
	fail := func(err error) {
		log.Printf("生成失败: %v", err)
		updateGeneration(sess, epoch, func() { sess.gen = generation{State: genFailed, Error: err.Error()} })
	}

	// 额度不够就别开跑：抓到一半失败留下的是半份语料和一个看不懂的报错。
	// 额度查询本身不消耗业务额度。
	if prov.Kind() == "live" {
		if snap, qerr := s.quota.Snapshot(ctx); qerr != nil {
			log.Printf("额度查询失败，继续生成: %v", qerr)
		} else if need := zhihu.DefaultPlan().MinimumCalls(); !snap.EnoughFor(zhihu.QuotaUserData, need) {
			remaining, _ := snap.Remaining(zhihu.QuotaUserData)
			fail(fmt.Errorf("今天的知乎用户数据额度只剩 %d 次，这次采集至少要 %d 次。额度每天重置，明天再试", remaining, need))
			return
		}
	}

	corpus, err := prov.Fetch(ctx)
	if err != nil {
		fail(err)
		return
	}
	total, _, _ := corpus.Stats()
	progress.Report(ctx, progress.Event{Phase: "collect", Done: total})
	if total < 30 {
		fail(fmt.Errorf("只找到 %d 条内容，还不够生成星图。试试游客模式，现场挑几个感兴趣的问题", total))
		return
	}
	filtered := extract.CountSensitiveItems(corpus.Items)
	progress.Report(ctx, progress.Event{Phase: "cache"})
	cached, err := s.beginAnalysis(ctx, sess, epoch, corpus.Source)
	if err != nil {
		fail(fmt.Errorf("读取分析缓存失败: %w", err))
		return
	}
	defer cached.Close()
	public := s.publicAnswersFor(corpus.Items)
	artifactKey := ""
	if corpus.Source == "mock" {
		artifactKey = mockArtifactKey(corpus.Items, public)
		if raw := cached.Artifact(artifactKey); len(raw) > 0 {
			var u engine.Universe
			if json.Unmarshal(raw, &u) == nil && u.ValidateCurrent() == nil {
				log.Printf("生成复用：mock 固定宇宙，模型调用 0")
				updateGeneration(sess, epoch, func() {
					sess.gen = generation{State: genDone, Stage: "完成", Progress: 100, Universe: &u, Filtered: filtered, Source: corpus.Source}
					sess.genCancel = nil
				})
				return
			}
		}
	}

	if !setStage(fmt.Sprintf("读到 %d 条，正在理解它们讲的是什么", total), 30) {
		return
	}
	concepts, err := cached.Extract(ctx, corpus.Items)
	if err != nil {
		fail(fmt.Errorf("概念抽取失败: %w", err))
		return
	}
	// Preserve successful batches even if a later graph/naming step fails.
	if err := cached.Commit(); err != nil {
		fail(fmt.Errorf("保存概念缓存失败: %w", err))
		return
	}

	if !setStage("正在让它们坍缩成星群", 70) {
		return
	}
	namer := func(members, samples []string) string {
		n, err := cached.NameCluster(ctx, members, samples)
		if err != nil || n == "" {
			if len(members) > 0 {
				return members[0]
			}
			return "未命名"
		}
		return n
	}
	opt := engine.Options{}
	if corpus.Source == "seed" {
		// 种子星语料只有百来条，沿用 3 会一个星群都成不了
		opt.MinSupport = 2
		opt.MinCluster = 2
	}
	// 别人的回答挂到我已经留下痕迹的那些行星上；它们不进概念抽取，恒星仍然只是我的。
	if len(public) > 0 {
		log.Printf("带入 %d 条同题公共回答", len(public))
	}
	progress.Report(ctx, progress.Event{Phase: "layout"})
	u, err := engine.RunContext(ctx, engine.Input{Items: corpus.Items, Concepts: concepts, PublicAnswers: public}, opt, namer)
	if err != nil {
		fail(err)
		return
	}
	u.Meta.Source = corpus.Source
	if artifactKey != "" {
		raw, err := json.Marshal(u)
		if err != nil {
			fail(err)
			return
		}
		cached.SetArtifact(artifactKey, raw)
	}
	if err := cached.Commit(); err != nil {
		fail(fmt.Errorf("保存分析缓存失败: %w", err))
		return
	}
	log.Printf("生成增量：source=%s 复用条目=%d 新分析条目=%d 复用星群名=%d 新命名星群=%d", corpus.Source, cached.Hits, cached.Misses, cached.NameHits, cached.NameMisses)

	updateGeneration(sess, epoch, func() {
		sess.gen = generation{
			State: genDone, Stage: "完成", Progress: 100,
			Universe: u, Filtered: filtered, Source: corpus.Source, Calls: corpus.Calls,
		}
		sess.genCancel = nil
	})
}

func updateGeneration(sess *session, epoch uint64, update func()) bool {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.epoch != epoch {
		return false
	}
	update()
	return true
}

func (s *Server) universeGet(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.mu.Lock()
	g := sess.gen
	sess.mu.Unlock()
	if g.State == "" {
		g.State = genIdle
	}
	writeJSON(w, 200, g)
}

func (s *Server) shareCreate(w http.ResponseWriter, r *http.Request) {
	request, ok := readShareRequest(w, r)
	if !ok {
		return
	}
	sess := fromCtx(r)
	sess.opMu.Lock()
	defer sess.opMu.Unlock()
	if !s.currentSession(sess) {
		writeErr(w, http.StatusConflict, "会话已旋转")
		return
	}
	sess.mu.Lock()
	u := sess.gen.Universe
	epoch := sess.epoch
	if u == nil {
		sess.mu.Unlock()
		writeErr(w, 409, "还没有可分享的星图")
		return
	}
	view, err := share.BuildView(u, request.Selection)
	sess.mu.Unlock()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(view.Questions) == 0 {
		writeErr(w, http.StatusBadRequest, "请至少选择一个问题")
		return
	}
	owner := sessionOwner(sess)
	if request.Digest == "" || !share.VerifyPreviewDigest(request.Digest, previewOwnerContext(owner, epoch), request.Selection, view) {
		writeErr(w, http.StatusConflict, "分享预览已过期，请重新预览")
		return
	}
	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()
	if err := s.promoteShareOwner(sess); err != nil {
		if errors.Is(err, errRegistryDurabilityUncertain) {
			s.cleanupShareOwner(sess)
		}
		if errors.Is(err, errSessionCapacity) {
			writeErr(w, http.StatusTooManyRequests, "可撤销分享所有者已达上限")
		} else {
			writeErr(w, http.StatusInternalServerError, "无法安全记录分享所有权")
		}
		return
	}
	record, err := s.store.Create(owner, view)
	if err != nil {
		s.cleanupShareOwner(sess)
		if errors.Is(err, share.ErrQuota) {
			writeErr(w, http.StatusTooManyRequests, "有效分享数已达上限")
			return
		}
		writeErr(w, 500, "保存分享快照失败")
		return
	}
	writeJSON(w, 200, map[string]any{
		"id": record.ID, "url": "/s/" + record.ID, "expiresAt": record.ExpiresAt,
	})
}

func (s *Server) sharePreview(w http.ResponseWriter, r *http.Request) {
	request, ok := readShareRequest(w, r)
	if !ok {
		return
	}
	sess := fromCtx(r)
	sess.mu.Lock()
	u := sess.gen.Universe
	epoch := sess.epoch
	if u == nil {
		sess.mu.Unlock()
		writeErr(w, http.StatusConflict, "还没有可分享的星图")
		return
	}
	view, err := share.BuildView(u, request.Selection)
	sess.mu.Unlock()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, struct {
		share.ShareView
		Digest string `json:"digest"`
	}{ShareView: view, Digest: share.PreviewDigest(previewOwnerContext(sessionOwner(sess), epoch), request.Selection, view)})
}

func previewOwnerContext(sessionID string, epoch uint64) string {
	return sessionID + ":" + strconv.FormatUint(epoch, 10)
}

type shareRequest struct {
	Selection share.ShareSelection
	Digest    string
}

func readShareRequest(w http.ResponseWriter, r *http.Request) (shareRequest, bool) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	token, err := decoder.Token()
	if err != nil {
		return shareRequestError(w, err)
	}
	if delimiter, ok := token.(json.Delim); !ok || delimiter != '{' {
		return shareRequestError(w, fmt.Errorf("request must be object"))
	}
	var request shareRequest
	seen := map[string]bool{}
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return shareRequestError(w, err)
		}
		key, ok := keyToken.(string)
		if !ok || seen[key] {
			return shareRequestError(w, fmt.Errorf("duplicate or invalid key"))
		}
		seen[key] = true
		switch key {
		case "questionIds":
			if err := decoder.Decode(&request.Selection.QuestionIDs); err != nil {
				return shareRequestError(w, err)
			}
		case "digest":
			if err := decoder.Decode(&request.Digest); err != nil {
				return shareRequestError(w, err)
			}
		default:
			return shareRequestError(w, fmt.Errorf("unknown key %q", key))
		}
	}
	if _, err := decoder.Token(); err != nil {
		return shareRequestError(w, err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return shareRequestError(w, fmt.Errorf("trailing JSON"))
	}
	return request, true
}

func shareRequestError(w http.ResponseWriter, err error) (shareRequest, bool) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeErr(w, http.StatusRequestEntityTooLarge, "分享请求过大")
	} else {
		writeErr(w, http.StatusBadRequest, "分享选择无效")
	}
	return shareRequest{}, false
}

func (s *Server) shareGet(w http.ResponseWriter, r *http.Request) {
	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()
	record, err := s.store.Load(r.PathValue("id"))
	if err != nil {
		s.reconcileShareOwners()
		log.Printf("public share load failed for %q: %v", r.PathValue("id"), err)
		writeErr(w, http.StatusNotFound, "分享不存在或已过期")
		return
	}
	writeJSON(w, 200, record.View)
}

func (s *Server) retainSession(sess *session) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sess[sess.id] != sess {
		return false
	}
	sess.active++
	return true
}

func (s *Server) shareDelete(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.opMu.Lock()
	defer sess.opMu.Unlock()
	if !sess.revocationOnly && !s.currentSession(sess) {
		writeErr(w, http.StatusConflict, "会话已旋转")
		return
	}
	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()
	if err := s.store.DeleteOwned(r.PathValue("id"), sessionOwner(sess)); err != nil {
		writeErr(w, http.StatusNotFound, "分享不存在或已过期")
		return
	}
	s.cleanupShareOwner(sess)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// wipe 实现界面上的「立即删除我的宇宙」：清空会话内的一切，即时生效。
func (s *Server) wipe(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.opMu.Lock()
	defer sess.opMu.Unlock()
	if !sess.revocationOnly && !s.currentSession(sess) {
		writeErr(w, http.StatusConflict, "会话已旋转")
		return
	}
	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()
	if err := s.store.DeleteAllOwned(sessionOwner(sess)); err != nil {
		writeErr(w, http.StatusInternalServerError, "删除分享失败")
		return
	}
	s.cleanupShareOwner(sess)
	if sess.revocationOnly {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	sess.mu.Lock()
	owners := []string{analysisOwner(sess), "session:" + sessionOwner(sess), sess.analysisOwner}
	for _, owner := range owners {
		if owner == "" || strings.HasPrefix(owner, "public:") {
			continue
		}
		if err := s.analysis.Delete(owner); err != nil {
			sess.mu.Unlock()
			writeErr(w, http.StatusInternalServerError, "删除分析缓存失败")
			return
		}
	}
	sess.analysisOwner = ""
	sess.epoch++
	if sess.genCancel != nil {
		sess.genCancel()
		sess.genCancel = nil
	}
	if sess.authCancel != nil {
		sess.authCancel()
		sess.authCancel = nil
	}
	sess.authOp++
	sess.gen = generation{}
	sess.token, sess.profile, sess.seedCorpus = nil, nil, nil
	sess.state, sess.stateExpiresAt, sess.stateChecked = "", time.Time{}, false
	sess.mu.Unlock()
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ListenAndServe 启动服务。
func (s *Server) ListenAndServe() error {
	addr := fmt.Sprintf(":%d", s.cfg.Port)
	srv := &http.Server{
		Addr: addr, Handler: s.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("mindverse 启动于 http://127.0.0.1%s  语料来源=%s  web=%s",
		addr, s.cfg.Source, filepath.Clean(s.cfg.WebDir))
	if s.cfg.LocalOnly() {
		log.Printf("提示：当前回调为本地地址，只能预览页面。真实知乎登录需先部署到公网 HTTPS。")
	}
	return srv.ListenAndServe()
}
