package engine

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

var smallOptions = Options{MinSupport: 1, MinCluster: 1, Shuffles: 1}

func admittedAnswer(rawID, questionID, title string) zhihu.Item {
	url := "https://www.zhihu.com/question/" + questionID + "/answer/" + rawID
	return zhihu.Item{
		Identity: zhihu.ResolveIdentity(zhihu.TypeAnswer, rawID, url, title),
		Type:     zhihu.TypeAnswer, URL: url, Title: title,
	}
}

func admittedArticle(rawID, title string) zhihu.Item {
	url := "https://zhuanlan.zhihu.com/p/" + rawID
	return zhihu.Item{
		Identity: zhihu.ResolveIdentity(zhihu.TypeArticle, rawID, url, title),
		Type:     zhihu.TypeArticle, URL: url, Title: title,
	}
}

func TestStableStarIDAcrossOrdering(t *testing.T) {
	a, err := StableStarID(ScopePrivate, "  Large\tLANGUAGE\nModel  ")
	if err != nil {
		t.Fatal(err)
	}
	b, err := StableStarID(ScopePrivate, "large language model")
	if err != nil {
		t.Fatal(err)
	}
	if a != b || a != "star:v1:private:9c26adb26ee86916" {
		t.Fatalf("normalized IDs differ or changed: %q / %q", a, b)
	}

	inA := Input{Items: []zhihu.Item{{Title: "a"}, {Title: "b"}}, Concepts: [][]string{{"Beta"}, {"Alpha"}}}
	inB := Input{Items: []zhihu.Item{{Title: "b"}, {Title: "a"}}, Concepts: [][]string{{"Alpha"}, {"Beta"}}}
	uA, err := Run(inA, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	uB, err := Run(inB, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	ids := func(stars []Star) map[string]string {
		out := map[string]string{}
		for _, star := range stars {
			out[star.Concept] = star.ID
		}
		return out
	}
	if !reflect.DeepEqual(ids(uA.Stars), ids(uB.Stars)) {
		t.Fatalf("reordering changed IDs: %#v / %#v", ids(uA.Stars), ids(uB.Stars))
	}
}

func TestNormalizedEquivalentConceptsMergeWithoutLosingLinks(t *testing.T) {
	answer := admittedAnswer("8", "7", "Question")
	article := admittedArticle("21", "Article")
	tests := []Input{
		{Items: []zhihu.Item{answer, article}, Concepts: [][]string{{"  Graph\tTheory "}, {"graph theory"}}},
		{Items: []zhihu.Item{article, answer}, Concepts: [][]string{{"graph theory"}, {"  Graph\tTheory "}}},
	}
	var want Star
	for i, in := range tests {
		u, err := Run(in, smallOptions, nil)
		if err != nil {
			t.Fatal(err)
		}
		if len(u.Stars) != 1 {
			t.Fatalf("case %d: normalized-equivalent concepts produced %d stars: %+v", i, len(u.Stars), u.Stars)
		}
		got := u.Stars[0]
		if got.Concept != "Graph Theory" || !reflect.DeepEqual(got.QuestionIDs, []string{"question:7"}) ||
			!reflect.DeepEqual(got.ProbeIDs, []string{"article:21"}) || len(got.Evidence) != 2 {
			t.Fatalf("case %d: canonical merge lost content links: %+v", i, got)
		}
		if i == 0 {
			want = got
		} else if got.ID != want.ID || got.Concept != want.Concept || !reflect.DeepEqual(got.QuestionIDs, want.QuestionIDs) || !reflect.DeepEqual(got.ProbeIDs, want.ProbeIDs) {
			t.Fatalf("input reorder changed canonical star: %+v / %+v", want, got)
		}
	}
}

func TestStableStarIDSeparatesScopes(t *testing.T) {
	privateID, err := StableStarID(ScopePrivate, "Graph Theory")
	if err != nil {
		t.Fatal(err)
	}
	publicID, err := StableStarID(ScopePublic, "Graph Theory")
	if err != nil {
		t.Fatal(err)
	}
	if privateID == publicID || !strings.HasPrefix(privateID, "star:v1:private:") || !strings.HasPrefix(publicID, "star:v1:public:") {
		t.Fatalf("scope is absent from IDs: %q / %q", privateID, publicID)
	}
	stars := []Star{{Concept: "alpha", Scope: ScopePrivate}, {Concept: "beta", Scope: ScopePrivate}}
	err = assignStableStarIDs(stars, func(ConceptScope, string) (string, error) { return "star:v1:private:collision", nil })
	if err == nil || !strings.Contains(err.Error(), "collision") {
		t.Fatalf("different normalized concepts must report collision, got %v", err)
	}
}

func TestExtractedConceptsArePrivateByDefault(t *testing.T) {
	u, err := Run(Input{Items: []zhihu.Item{{Title: "one"}}, Concepts: [][]string{{"Concept"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, star := range u.Stars {
		if star.Scope != ScopePrivate || star.ExternalQueryAllowed {
			t.Fatalf("model-extracted star leaked public capability: %+v", star)
		}
	}
}

func TestProjectKnowledgeObjectsDeduplicatesQuestions(t *testing.T) {
	in := Input{
		Items:    []zhihu.Item{admittedAnswer("8", "7", "Real question"), admittedAnswer("9", "7", "Real question")},
		Concepts: [][]string{{"Alpha"}, {"Beta"}},
	}
	u, err := Run(in, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Questions) != 1 || u.Questions[0].ID != "question:7" || u.Questions[0].URL != "https://www.zhihu.com/question/7" {
		t.Fatalf("question projection not globally deduplicated: %+v", u.Questions)
	}
	for _, star := range u.Stars {
		if !reflect.DeepEqual(star.QuestionIDs, []string{"question:7"}) {
			t.Fatalf("star %q did not reference global question: %#v", star.Concept, star.QuestionIDs)
		}
	}
}

func TestProjectionRejectsIncompleteQuestion(t *testing.T) {
	items := []zhihu.Item{
		admittedAnswer("8", "7", ""),
		{Identity: zhihu.ResolveIdentity(zhihu.TypeAnswer, "", "https://www.zhihu.com/question/7/answer/not-an-id", "Question"), Type: zhihu.TypeAnswer, URL: "https://www.zhihu.com/question/7/answer/not-an-id", Title: "Question"},
		{Identity: zhihu.ResolveIdentity(zhihu.TypeAnswer, "10", "https://www.zhihu.com/question/7/answer/10?x=1", "Question"), Type: zhihu.TypeAnswer, URL: "https://www.zhihu.com/question/7/answer/10?x=1", Title: "Question"},
	}
	u, err := Run(Input{Items: items, Concepts: [][]string{{"Concept"}, {"Concept"}, {"Concept"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Questions) != 0 || len(u.Answers) != 0 {
		t.Fatalf("incomplete questions became public objects: questions=%+v answers=%+v", u.Questions, u.Answers)
	}
	if len(u.Stars) != 1 || len(u.Stars[0].Evidence) != 3 {
		t.Fatalf("rejected public projection must retain private evidence: %+v", u.Stars)
	}
}

func TestAnswerSatellitesAreCompleteAndDeduplicated(t *testing.T) {
	first := admittedAnswer("8", "7", "Question title")
	first.Summary = "summary"
	first.Author = "Alice"
	first.AuthorID = "author:alice"
	first.PublishedAt, first.UpdatedAt, first.ObservedAt = 100, 120, 140
	first.LikeCount = 42
	first.CommentCount = 5
	first.FavoriteCount = 9
	first.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCollected, At: 150, Folders: []string{"folder"}}}
	first.DiscoverySources = []zhihu.DiscoverySource{zhihu.DiscoveryFavoriteList}
	duplicate := first
	duplicate.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 100}}
	duplicate.DiscoverySources = []zhihu.DiscoverySource{zhihu.DiscoveryOwnContent}

	items := []zhihu.Item{first, duplicate}
	concepts := [][]string{{"Concept"}, {"Concept"}}
	for _, rawID := range []string{"9", "10", "11", "12", "13", "14", "15"} {
		items = append(items, admittedAnswer(rawID, "7", "Question title"))
		concepts = append(concepts, []string{"Concept"})
	}

	u, err := Run(Input{Items: items, Concepts: concepts}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Answers) != 8 || len(u.Stars[0].Evidence) != 6 {
		t.Fatalf("projection must use all items, independent of evidence cap: answers=%d evidence=%d", len(u.Answers), len(u.Stars[0].Evidence))
	}
	a := u.Answers[0]
	if a.ID != "answer:10" { // deterministic lexical order
		t.Fatalf("answers not deterministically sorted: first=%q", a.ID)
	}
	var answer8 AnswerSatellite
	for _, answer := range u.Answers {
		if answer.ID == "answer:8" {
			answer8 = answer
		}
	}
	if answer8.QuestionID != "question:7" || answer8.Title != "Question title" || answer8.Summary != "summary" ||
		answer8.URL != "https://www.zhihu.com/question/7/answer/8" || answer8.AuthorID != "author:alice" || answer8.AuthorName != "Alice" ||
		answer8.PublishedAt != 100 || answer8.UpdatedAt != 120 || answer8.ObservedAt != 140 ||
		answer8.LikeCount != 42 || answer8.CommentCount != 5 || answer8.FavoriteCount != 9 {
		t.Fatalf("answer lost public fields: %+v", answer8)
	}
	if len(answer8.Bindings) != 2 || len(answer8.DiscoverySources) != 2 {
		t.Fatalf("answer relations were not globally merged: %+v", answer8)
	}
	if !reflect.DeepEqual(u.Questions[0].AnswerIDs, []string{"answer:10", "answer:11", "answer:12", "answer:13", "answer:14", "answer:15", "answer:8", "answer:9"}) {
		t.Fatalf("question answer refs not sorted/complete: %#v", u.Questions[0].AnswerIDs)
	}
}

func TestAnswerIdentityConflictAcrossQuestionsIsQuarantined(t *testing.T) {
	question7 := admittedAnswer("8", "7", "Question seven")
	question9 := admittedAnswer("8", "9", "Question nine")
	orders := [][]zhihu.Item{{question7, question9}, {question9, question7}}
	var want []byte
	for i, items := range orders {
		u, err := Run(Input{Items: items, Concepts: [][]string{{"Concept"}, {"Concept"}}}, smallOptions, nil)
		if err != nil {
			t.Fatal(err)
		}
		if len(u.Answers) != 0 || len(u.Questions) != 0 || len(u.Stars) != 1 || len(u.Stars[0].QuestionIDs) != 0 {
			t.Fatalf("case %d: conflicting answer escaped quarantine: answers=%+v questions=%+v star=%+v", i, u.Answers, u.Questions, u.Stars)
		}
		if len(u.Stars[0].Evidence) != 2 {
			t.Fatalf("case %d: quarantine discarded private evidence: %+v", i, u.Stars[0].Evidence)
		}
		publicJSON, err := json.Marshal(struct {
			Questions []QuestionPlanet  `json:"questions"`
			Answers   []AnswerSatellite `json:"answers"`
		}{u.Questions, u.Answers})
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			want = publicJSON
		} else if !reflect.DeepEqual(publicJSON, want) {
			t.Fatalf("quarantine depends on input order: %s / %s", want, publicJSON)
		}
	}
}

func TestUnknownAuthorCannotSatisfyAuthorThreshold(t *testing.T) {
	it := admittedAnswer("8", "7", "Question")
	it.Author = "Display name only"
	u, err := Run(Input{Items: []zhihu.Item{it}, Concepts: [][]string{{"Concept"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Answers) != 1 || u.Answers[0].AuthorID != "" || u.Answers[0].AuthorName != "Display name only" {
		t.Fatalf("display name became stable identity: %+v", u.Answers)
	}
}

func TestArticleProbeIsSingleEntity(t *testing.T) {
	a := admittedArticle("21", "Article")
	a.CommentCount = 12
	a.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCollected, At: 20}}
	a.DiscoverySources = []zhihu.DiscoverySource{zhihu.DiscoveryFavoriteList}
	b := a
	b.Bindings = []zhihu.UserContentBinding{{Relation: zhihu.RelationCreated, At: 10}}
	b.DiscoverySources = []zhihu.DiscoverySource{zhihu.DiscoveryOwnContent}
	u, err := Run(Input{Items: []zhihu.Item{a, b}, Concepts: [][]string{{"Alpha"}, {"Beta"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Probes) != 1 || u.Probes[0].ID != "article:21" || u.Probes[0].CommentCount != 12 ||
		len(u.Probes[0].Bindings) != 2 || len(u.Probes[0].DiscoverySources) != 2 {
		t.Fatalf("article was duplicated or relations collapsed: %+v", u.Probes)
	}
	for _, star := range u.Stars {
		if !reflect.DeepEqual(star.ProbeIDs, []string{"article:21"}) || len(star.QuestionIDs) != 0 {
			t.Fatalf("article has wrong star relation: %+v", star)
		}
	}
}

func TestProjectionRejectsMismatchedArticleIdentity(t *testing.T) {
	it := admittedArticle("21", "Article")
	it.Identity.URL = "https://zhuanlan.zhihu.com/p/22"
	it.URL = it.Identity.URL
	u, err := Run(Input{Items: []zhihu.Item{it}, Concepts: [][]string{{"Concept"}}}, smallOptions, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Probes) != 0 || len(u.Stars) != 1 || len(u.Stars[0].ProbeIDs) != 0 {
		t.Fatalf("mismatched article ID became a probe: probes=%+v star=%+v", u.Probes, u.Stars)
	}
	if len(u.Stars[0].Evidence) != 1 || u.Stars[0].Evidence[0].URL != it.URL {
		t.Fatalf("rejected article must remain private evidence: %+v", u.Stars[0].Evidence)
	}
}

func TestDuplicatePublicURLsNormalizeIndependentOfInputOrder(t *testing.T) {
	answerLower := admittedAnswer("8", "7", "Question")
	answerUpper := answerLower
	answerUpper.Identity = zhihu.ResolveIdentity(zhihu.TypeAnswer, "8", "https://WWW.ZHIHU.COM/question/7/answer/8", "Question")
	answerUpper.URL = answerUpper.Identity.URL
	articleLower := admittedArticle("21", "Article")
	articleUpper := articleLower
	articleUpper.Identity = zhihu.ResolveIdentity(zhihu.TypeArticle, "21", "https://ZHUANLAN.ZHIHU.COM/p/21", "Article")
	articleUpper.URL = articleUpper.Identity.URL

	runPublicJSON := func(items []zhihu.Item) ([]byte, *Universe) {
		t.Helper()
		concepts := make([][]string, len(items))
		for i := range concepts {
			concepts[i] = []string{"Concept"}
		}
		u, err := Run(Input{Items: items, Concepts: concepts}, smallOptions, nil)
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(struct {
			Questions []QuestionPlanet  `json:"questions"`
			Answers   []AnswerSatellite `json:"answers"`
			Probes    []ArticleProbe    `json:"probes"`
		}{u.Questions, u.Answers, u.Probes})
		if err != nil {
			t.Fatal(err)
		}
		return encoded, u
	}
	aJSON, a := runPublicJSON([]zhihu.Item{answerLower, answerUpper, articleLower, articleUpper})
	bJSON, _ := runPublicJSON([]zhihu.Item{articleUpper, articleLower, answerUpper, answerLower})
	if !reflect.DeepEqual(aJSON, bJSON) {
		t.Fatalf("public entity JSON depends on duplicate input order:\n%s\n%s", aJSON, bJSON)
	}
	if len(a.Answers) != 1 || a.Answers[0].URL != "https://www.zhihu.com/question/7/answer/8" {
		t.Fatalf("answer URL is not canonical: %+v", a.Answers)
	}
	if len(a.Probes) != 1 || a.Probes[0].URL != "https://zhuanlan.zhihu.com/p/21" {
		t.Fatalf("article URL is not canonical: %+v", a.Probes)
	}
}

func TestUniverseContractGolden(t *testing.T) {
	it := admittedAnswer("8", "7", "Question")
	in := Input{Items: []zhihu.Item{it}, Concepts: [][]string{{"Concept"}}}
	u, err := Run(in, smallOptions, func([]string, []string) string { return "Cluster" })
	if err != nil {
		t.Fatal(err)
	}
	got, err := json.MarshalIndent(u, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	want, err := os.ReadFile("testdata/universe_contract.json")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("universe JSON contract changed\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}
