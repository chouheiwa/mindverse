// Package share builds and persists explicitly selected, public-only views.
package share

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/chouheiwa/mindverse/internal/engine"
	"github.com/chouheiwa/mindverse/internal/zhihu"
)

const ViewSchemaVersion = "share.v1"

// share.v1 wire limits are mirrored by frontend/src/domain/share.ts. They
// keep public snapshots JSON-safe and incrementally renderable in browsers.
const (
	MaxViewQuestions   = 1_000
	MaxViewAnswers     = 10_000
	MaxQuestionAnswers = 10_000
	MaxJSONInteger     = int64(9_007_199_254_740_991)
	MaxPublicTimestamp = int64(253_402_300_799) // 9999-12-31T23:59:59Z
)

type ShareSelection struct {
	QuestionIDs []string `json:"questionIds"`
}

// PreviewDigest binds explicit selection consent to the exact server-built
// view and the high-entropy owner session. It is a concurrency token, not an
// authentication credential.
func PreviewDigest(ownerSession string, selection ShareSelection, view ShareView) string {
	ids := append([]string(nil), selection.QuestionIDs...)
	sort.Strings(ids)
	payload, _ := json.Marshal(struct {
		Owner       string    `json:"owner"`
		QuestionIDs []string  `json:"questionIds"`
		View        ShareView `json:"view"`
	}{Owner: ownerSession, QuestionIDs: ids, View: view})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func VerifyPreviewDigest(got, ownerSession string, selection ShareSelection, view ShareView) bool {
	want := PreviewDigest(ownerSession, selection, view)
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
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
	if len(requested) > MaxViewQuestions {
		return view, fmt.Errorf("share question selection exceeds limit %d", MaxViewQuestions)
	}
	sort.Strings(requested)
	for i := 1; i < len(requested); i++ {
		if requested[i] == requested[i-1] {
			return view, fmt.Errorf("duplicate question ID %q", requested[i])
		}
	}
	if len(requested) == 0 {
		return view, nil
	}

	questions := make(map[string]engine.QuestionPlanet, len(u.Questions))
	seenQuestionIDs := make(map[string]struct{}, len(u.Questions))
	for _, q := range u.Questions {
		if _, duplicate := seenQuestionIDs[q.ID]; q.ID != "" && duplicate {
			return view, fmt.Errorf("duplicate universe question ID %q", q.ID)
		}
		seenQuestionIDs[q.ID] = struct{}{}
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
		if _, duplicate := answers[answer.ID]; answer.ID != "" && duplicate {
			return view, fmt.Errorf("duplicate universe answer ID %q", answer.ID)
		}
		answers[answer.ID] = answer
	}
	seenAnswers := map[string]struct{}{}
	for _, id := range requested {
		q := questions[id]
		answerIDs := append([]string(nil), q.AnswerIDs...)
		if len(answerIDs) > MaxQuestionAnswers {
			return view, fmt.Errorf("question %q answer references exceed limit %d", q.ID, MaxQuestionAnswers)
		}
		sort.Strings(answerIDs)
		for i := 1; i < len(answerIDs); i++ {
			if answerIDs[i] == answerIDs[i-1] {
				return view, fmt.Errorf("question %q has duplicate answer reference %q", q.ID, answerIDs[i])
			}
		}
		publicAnswerIDs := make([]string, 0, len(answerIDs))
		for _, answerID := range answerIDs {
			a, ok := answers[answerID]
			if !ok || !canonicalAnswer(a, q) {
				continue
			}
			publicAnswerIDs = append(publicAnswerIDs, a.ID)
			if _, exists := seenAnswers[a.ID]; exists {
				continue
			}
			seenAnswers[a.ID] = struct{}{}
			if len(view.Answers) >= MaxViewAnswers {
				return view, fmt.Errorf("share answers exceed limit %d", MaxViewAnswers)
			}
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
	if err := view.Validate(); err != nil {
		return ShareView{}, err
	}
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
	if value == "" || value[0] == '0' {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (v ShareView) Validate() error {
	if v.SchemaVersion != ViewSchemaVersion || v.Legacy {
		return fmt.Errorf("invalid share view schema")
	}
	if len(v.Questions) > MaxViewQuestions || len(v.Answers) > MaxViewAnswers {
		return fmt.Errorf("share view collection limit exceeded")
	}
	questions := make(map[string]Question, len(v.Questions))
	for i, question := range v.Questions {
		if !canonicalShareQuestion(question) {
			return fmt.Errorf("question %d: invalid public shape", i)
		}
		if _, duplicate := questions[question.ID]; duplicate {
			return fmt.Errorf("question %d: duplicate ID", i)
		}
		if i > 0 && v.Questions[i-1].ID >= question.ID {
			return fmt.Errorf("questions are not strictly sorted")
		}
		questions[question.ID] = question
	}
	answers := make(map[string]Answer, len(v.Answers))
	for i, answer := range v.Answers {
		if !canonicalShareAnswer(answer) || answer.PublishedAt < 0 || answer.UpdatedAt < 0 ||
			answer.PublishedAt > MaxPublicTimestamp || answer.UpdatedAt > MaxPublicTimestamp ||
			answer.LikeCount < 0 || answer.CommentCount < 0 || answer.FavoriteCount < 0 ||
			answer.LikeCount > MaxJSONInteger || answer.CommentCount > MaxJSONInteger || answer.FavoriteCount > MaxJSONInteger {
			return fmt.Errorf("answer %d: invalid public shape", i)
		}
		if answer.AuthorID == "" && answer.AuthorName != "" {
			return fmt.Errorf("answer %d: unverified author display", i)
		}
		if answer.AuthorID != "" && !(zhihu.AuthorIdentity{ID: answer.AuthorID, Source: zhihu.AuthorIdentityURLToken}).Valid() {
			return fmt.Errorf("answer %d: invalid author", i)
		}
		if _, duplicate := answers[answer.ID]; duplicate {
			return fmt.Errorf("answer %d: duplicate ID", i)
		}
		if i > 0 && v.Answers[i-1].ID >= answer.ID {
			return fmt.Errorf("answers are not strictly sorted")
		}
		if _, exists := questions[answer.QuestionID]; !exists {
			return fmt.Errorf("answer %q: unknown question", answer.ID)
		}
		answers[answer.ID] = answer
	}
	seenAnswers := make(map[string]struct{}, len(answers))
	for _, question := range v.Questions {
		if len(question.AnswerIDs) > MaxQuestionAnswers {
			return fmt.Errorf("question %q: answer reference limit exceeded", question.ID)
		}
		for i, answerID := range question.AnswerIDs {
			if i > 0 && question.AnswerIDs[i-1] >= answerID {
				return fmt.Errorf("question %q: answer references are not strictly sorted", question.ID)
			}
			answer, exists := answers[answerID]
			if !exists || answer.QuestionID != question.ID {
				return fmt.Errorf("question %q: invalid answer reference %q", question.ID, answerID)
			}
			seenAnswers[answerID] = struct{}{}
		}
	}
	if len(seenAnswers) != len(answers) {
		return fmt.Errorf("unreferenced answer in share view")
	}
	return nil
}

func canonicalShareQuestion(q Question) bool {
	return strings.TrimSpace(q.Title) != "" && asciiDigits(q.QuestionID) && q.ID == "question:"+q.QuestionID &&
		q.URL == "https://www.zhihu.com/question/"+q.QuestionID
}

func canonicalShareAnswer(a Answer) bool {
	answerID, ok := strings.CutPrefix(a.ID, "answer:")
	questionID, questionOK := strings.CutPrefix(a.QuestionID, "question:")
	return ok && questionOK && asciiDigits(answerID) && asciiDigits(questionID) && strings.TrimSpace(a.Title) != "" &&
		a.URL == "https://www.zhihu.com/question/"+questionID+"/answer/"+answerID
}
