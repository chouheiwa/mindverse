// Package server 提供 HTTP 接口，把「登录 → 采集 → 抽取 → 引擎 → 星图」串起来。
package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/chouheiwa/mindverse/internal/config"
	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/extract"
	"github.com/chouheiwa/mindverse/internal/seed"
	"github.com/chouheiwa/mindverse/internal/snapshot"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

const cookieName = "mindverse_session"

// genState 是一次星图生成的状态。生成要跑模型，必然慢，所以异步 + 轮询。
type genState string

const (
	genIdle    genState = "idle"
	genRunning genState = "running"
	genDone    genState = "done"
	genFailed  genState = "failed"
)

type generation struct {
	State    genState         `json:"state"`
	Stage    string           `json:"stage"`
	Progress int              `json:"progress"`
	Error    string           `json:"error,omitempty"`
	Universe *engine.Universe `json:"universe,omitempty"`
	Filtered int              `json:"filtered"` // 因敏感类目未参与分析的条数
	Source   string           `json:"source"`
	Calls    int              `json:"calls"`
}

// session 只驻留内存。OAuth token 绝不落盘。
type session struct {
	mu           sync.Mutex
	id           string
	state        string
	token        *zhihu.Token
	stateChecked bool
	profile      *zhihu.Profile
	gen          generation
	seedCorpus   *zhihu.Corpus // 游客模式：现场挑出来的语料
	genToday     int
	genDay       string
	lastSeen     time.Time
}

// Server 是应用主体。
type Server struct {
	cfg   *config.Config
	oauth *zhihu.OAuth
	store *snapshot.Store
	ext   extract.Extractor
	seed  *seed.Builder

	mu   sync.Mutex
	sess map[string]*session
}

// New 构造服务。
func New(cfg *config.Config, ext extract.Extractor) (*Server, error) {
	store, err := snapshot.NewStore(cfg.SnapshotDir)
	if err != nil {
		return nil, err
	}
	return &Server{
		cfg: cfg, store: store, ext: ext,
		seed:  seed.NewBuilder(zhihu.NewClient(cfg.AccessSecret, "")),
		oauth: &zhihu.OAuth{AppID: cfg.AppID, AppKey: cfg.AppKey, RedirectURI: cfg.RedirectURI},
		sess:  map[string]*session{},
	}, nil
}

// Routes 装配路由。
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/oauth/status", s.oauthStatus)
	mux.HandleFunc("GET /auth/start", s.authStart)
	mux.HandleFunc("GET /auth/callback", s.authCallback)
	mux.HandleFunc("POST /auth/logout", s.authLogout)
	mux.HandleFunc("GET /api/seed/topics", s.seedTopics)
	mux.HandleFunc("POST /api/seed", s.seedStart)
	mux.HandleFunc("POST /api/universe", s.universeStart)
	mux.HandleFunc("GET /api/universe", s.universeGet)
	mux.HandleFunc("POST /api/share", s.shareCreate)
	mux.HandleFunc("GET /api/share/{id}", s.shareGet)
	mux.HandleFunc("DELETE /api/share/{id}", s.shareDelete)
	mux.HandleFunc("DELETE /api/session/data", s.wipe)
	// 分享页复用同一张星图，数据由 /api/share/{id} 提供
	mux.HandleFunc("GET /s/{id}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(s.cfg.WebDir, "universe.html"))
	})
	mux.Handle("/", http.FileServer(http.Dir(s.cfg.WebDir)))
	return s.withSession(mux)
}

// ── 会话 ──

func (s *Server) withSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess := s.session(w, r)
		sess.mu.Lock()
		sess.lastSeen = time.Now()
		sess.mu.Unlock()
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, sess)))
	})
}

type ctxKey struct{}

func fromCtx(r *http.Request) *session {
	v, _ := r.Context().Value(ctxKey{}).(*session)
	return v
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) *session {
	if c, err := r.Cookie(cookieName); err == nil {
		s.mu.Lock()
		sess, ok := s.sess[c.Value]
		s.mu.Unlock()
		if ok {
			return sess
		}
	}
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	id := base64.RawURLEncoding.EncodeToString(b)
	sess := &session{id: id, lastSeen: time.Now()}
	s.mu.Lock()
	s.sess[id] = sess
	s.mu.Unlock()
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: id, Path: "/",
		HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 8 * 3600,
		Secure: !s.cfg.LocalOnly(),
	})
	return sess
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

	keyDiag, secDiag, warns := zhihu.Diagnose(s.cfg.AppID, s.cfg.AppKey, s.cfg.AccessSecret)
	writeJSON(w, 200, map[string]any{
		"configured":    s.cfg.OAuthReady(),
		"localOnly":     s.cfg.LocalOnly(),
		"authorized":    authorized,
		"appId":         s.cfg.AppID,
		"redirectUri":   s.cfg.RedirectURI,
		"profile":       profile,
		"stateVerified": checked,
		// 回调实测可能不返 state。未校验时前端必须显示「仅适合黑客松联调」，
		// 不得宣称通过了标准 OAuth CSRF 校验。
		"csrfClaimAllowed": checked,
		"source":           s.cfg.Source,
		"credentials":      map[string]any{"appKey": keyDiag, "accessSecret": secDiag},
		"warnings":         warns,
	})
}

func (s *Server) authStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.LocalOnly() {
		writeErr(w, 409, "本地地址只能预览页面，无法完成知乎登录。请先部署到公网 HTTPS 再配置回调。")
		return
	}
	sess := fromCtx(r)
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	st := base64.RawURLEncoding.EncodeToString(b)
	sess.mu.Lock()
	sess.state = st
	sess.mu.Unlock()

	u, err := s.oauth.AuthorizeURL(st)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
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
	sess.mu.Lock()
	expected := sess.state
	sess.mu.Unlock()

	ok, checked := zhihu.VerifyState(q.Get("state"), expected)
	if !ok {
		writeErr(w, 400, "state 校验失败")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	tok, err := s.oauth.Exchange(ctx, code)
	if err != nil {
		// 不回显 code / app_key / token 的任何片段
		log.Printf("token 交换失败: %v", err)
		writeErr(w, 502, "换取授权失败，请重试")
		return
	}
	cl := zhihu.NewClient(s.cfg.AccessSecret, tok.AccessToken)
	profile := cl.Profile(ctx)

	sess.mu.Lock()
	sess.token, sess.stateChecked, sess.profile, sess.state = tok, checked, profile, ""
	sess.mu.Unlock()
	http.Redirect(w, r, "/universe.html", http.StatusFound)
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.mu.Lock()
	sess.token, sess.profile, sess.state, sess.stateChecked = nil, nil, "", false
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
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	corpus, err := s.seed.Build(ctx, body.Picks)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	sess := fromCtx(r)
	sess.mu.Lock()
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
	sess.gen = generation{State: genRunning, Stage: "正在读取你的知乎足迹", Progress: 5}
	sess.mu.Unlock()

	prov, err := s.provider(sess)
	if err != nil {
		sess.mu.Lock()
		sess.gen = generation{State: genFailed, Error: err.Error()}
		sess.mu.Unlock()
		writeErr(w, 401, err.Error())
		return
	}
	go s.generate(sess, prov)
	writeJSON(w, 202, map[string]string{"state": string(genRunning)})
}

func (s *Server) generate(sess *session, prov zhihu.Provider) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()

	setStage := func(stage string, pct int) {
		sess.mu.Lock()
		sess.gen.Stage, sess.gen.Progress = stage, pct
		sess.mu.Unlock()
	}
	fail := func(err error) {
		log.Printf("生成失败: %v", err)
		sess.mu.Lock()
		sess.gen = generation{State: genFailed, Error: err.Error()}
		sess.mu.Unlock()
	}

	corpus, err := prov.Fetch(ctx)
	if err != nil {
		fail(err)
		return
	}
	total, _, _ := corpus.Stats()
	if total < 30 {
		fail(fmt.Errorf("只找到 %d 条内容，还不够生成星图。试试游客模式，现场挑几个感兴趣的问题", total))
		return
	}
	filtered := extract.CountSensitiveItems(corpus.Items)

	setStage(fmt.Sprintf("读到 %d 条，正在理解它们讲的是什么", total), 30)
	concepts, err := s.ext.Extract(ctx, corpus.Items)
	if err != nil {
		fail(fmt.Errorf("概念抽取失败: %w", err))
		return
	}

	setStage("正在让它们坍缩成星群", 70)
	namer := func(members, samples []string) string {
		n, err := s.ext.NameCluster(ctx, members, samples)
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
	u, err := engine.Run(engine.Input{Items: corpus.Items, Concepts: concepts}, opt, namer)
	if err != nil {
		fail(err)
		return
	}
	u.Meta.Source = corpus.Source

	sess.mu.Lock()
	sess.gen = generation{
		State: genDone, Stage: "完成", Progress: 100,
		Universe: u, Filtered: filtered, Source: corpus.Source, Calls: corpus.Calls,
	}
	sess.mu.Unlock()
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
	sess := fromCtx(r)
	sess.mu.Lock()
	u := sess.gen.Universe
	sess.mu.Unlock()
	if u == nil {
		writeErr(w, 409, "还没有可分享的星图")
		return
	}
	snap, err := s.store.Save(u)
	if err != nil {
		writeErr(w, 500, "保存分享快照失败")
		return
	}
	writeJSON(w, 200, map[string]any{
		"id": snap.ID, "url": "/s/" + snap.ID, "expiresAt": snap.ExpiresAt,
	})
}

func (s *Server) shareGet(w http.ResponseWriter, r *http.Request) {
	snap, err := s.store.Load(r.PathValue("id"))
	if err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, snap)
}

func (s *Server) shareDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Delete(r.PathValue("id")); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// wipe 实现界面上的「立即删除我的宇宙」：清空会话内的一切，即时生效。
func (s *Server) wipe(w http.ResponseWriter, r *http.Request) {
	sess := fromCtx(r)
	sess.mu.Lock()
	sess.gen = generation{}
	sess.token, sess.profile, sess.seedCorpus = nil, nil, nil
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
