package engine

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"

	"github.com/chouheiwa/mindverse/internal/zhihu"
)

// StableStarID returns star:v1:{scope}:{first 16 hex chars of SHA-256 over the
// normalized concept}. Normalization trims Unicode whitespace, collapses all
// whitespace runs, and lowercases ASCII letters only.
func StableStarID(scope ConceptScope, concept string) (string, error) {
	if scope != ScopePrivate && scope != ScopePublic {
		return "", fmt.Errorf("unsupported concept scope %q", scope)
	}
	normalized := normalizeConcept(concept)
	if normalized == "" {
		return "", fmt.Errorf("empty normalized concept")
	}
	sum := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("star:v1:%s:%x", scope, sum[:8]), nil
}

func normalizeConcept(concept string) string {
	normalized := strings.Join(strings.Fields(concept), " ")
	return strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + ('a' - 'A')
		}
		return r
	}, normalized)
}

// canonicalizeConceptAnnotations merges spelling variants that have the same
// identity normalization. The display spelling is the lexicographically first
// trimmed/collapsed form, so input order cannot select it.
func canonicalizeConceptAnnotations(concepts [][]string) [][]string {
	displayByNormalized := map[string]string{}
	for _, itemConcepts := range concepts {
		for _, raw := range itemConcepts {
			normalized := normalizeConcept(raw)
			if normalized == "" {
				continue
			}
			display := strings.Join(strings.Fields(raw), " ")
			if current, exists := displayByNormalized[normalized]; !exists || display < current {
				displayByNormalized[normalized] = display
			}
		}
	}
	out := make([][]string, len(concepts))
	for i, itemConcepts := range concepts {
		seen := map[string]bool{}
		for _, raw := range itemConcepts {
			normalized := normalizeConcept(raw)
			if normalized == "" || seen[normalized] {
				continue
			}
			seen[normalized] = true
			out[i] = append(out[i], displayByNormalized[normalized])
		}
		sort.Strings(out[i])
	}
	return out
}

type starIDFunc func(ConceptScope, string) (string, error)

func assignStableStarIDs(stars []Star, build starIDFunc) error {
	seen := make(map[string]string, len(stars))
	for i := range stars {
		id, err := build(stars[i].Scope, stars[i].Concept)
		if err != nil {
			return fmt.Errorf("star %q: %w", stars[i].Concept, err)
		}
		normalized := normalizeConcept(stars[i].Concept)
		if prior, exists := seen[id]; exists && prior != normalized {
			return fmt.Errorf("stable star ID collision %q between normalized concepts %q and %q", id, prior, normalized)
		}
		seen[id] = normalized
		stars[i].ID = id
	}
	return nil
}

func projectKnowledgeObjects(in Input, stars []Star, itemsByStarID map[string][]int) ([]QuestionPlanet, []AnswerSatellite, []ArticleProbe) {
	questions := map[string]*QuestionPlanet{}
	questionAnswerSets := map[string]map[string]struct{}{}
	answers := map[string]*AnswerSatellite{}
	probes := map[string]*ArticleProbe{}
	answerQuestion := map[string]string{}
	conflictedAnswers := map[string]bool{}
	authorByContent := map[string]string{}
	conflictedAuthors := map[string]bool{}
	for i := range in.Items {
		item := in.Items[i]
		if answerID, questionID, _, ok := parseAdmittedAnswer(item); ok {
			questionRef := "question:" + questionID
			if previous, exists := answerQuestion[answerID]; exists && previous != questionRef {
				conflictedAnswers[answerID] = true
			} else {
				answerQuestion[answerID] = questionRef
			}
		}
		contentID, projectable := projectableArtifactID(item)
		authorID, _, verified := validatedAuthor(item)
		if !projectable || !verified {
			continue
		}
		if previous, exists := authorByContent[contentID]; exists && previous != authorID {
			conflictedAuthors[contentID] = true
		} else {
			authorByContent[contentID] = authorID
		}
	}

	for i := range in.Items {
		item := in.Items[i]
		if answerID, questionID, questionURL, ok := parseAdmittedAnswer(item); ok {
			if conflictedAnswers[answerID] {
				continue
			}
			questionRef := "question:" + questionID
			q := questions[questionRef]
			if q == nil {
				q = &QuestionPlanet{ID: questionRef, QuestionID: questionID, Title: item.Title, URL: questionURL}
				questions[questionRef] = q
			} else {
				q.Title = deterministicText(q.Title, item.Title)
			}
			if questionAnswerSets[questionRef] == nil {
				questionAnswerSets[questionRef] = map[string]struct{}{}
			}
			questionAnswerSets[questionRef][answerID] = struct{}{}
			if existing := answers[answerID]; existing == nil {
				answers[answerID] = answerFromItem(item, answerID, questionRef, conflictedAuthors[answerID])
			} else {
				mergeAnswer(existing, item, conflictedAuthors[answerID])
			}
			continue
		}
		if questionID, questionURL, ok := parseAdmittedQuestion(item); ok {
			questionRef := "question:" + questionID
			if existing := questions[questionRef]; existing == nil {
				questions[questionRef] = &QuestionPlanet{ID: questionRef, QuestionID: questionID, Title: item.Title, URL: questionURL}
			} else {
				existing.Title = deterministicText(existing.Title, item.Title)
			}
			continue
		}
		if probeID, ok := parseAdmittedArticle(item); ok {
			if existing := probes[probeID]; existing == nil {
				probes[probeID] = articleFromItem(item, probeID, conflictedAuthors[probeID])
			} else {
				mergeArticle(existing, item, conflictedAuthors[probeID])
			}
		}
	}

	starQuestionSets := make([]map[string]struct{}, len(stars))
	starProbeSets := make([]map[string]struct{}, len(stars))
	for i := range stars {
		for _, itemIndex := range itemsByStarID[stars[i].ID] {
			item := in.Items[itemIndex]
			if answerID, questionID, _, ok := parseAdmittedAnswer(item); ok && !conflictedAnswers[answerID] {
				addStringSet(&starQuestionSets[i], "question:"+questionID)
			} else if questionID, _, ok := parseAdmittedQuestion(item); ok {
				addStringSet(&starQuestionSets[i], "question:"+questionID)
			} else if probeID, ok := parseAdmittedArticle(item); ok {
				addStringSet(&starProbeSets[i], probeID)
			}
		}
		stars[i].QuestionIDs = sortedStringSet(starQuestionSets[i])
		stars[i].ProbeIDs = sortedStringSet(starProbeSets[i])
	}

	questionList := make([]QuestionPlanet, 0, len(questions))
	for _, question := range questions {
		question.AnswerIDs = sortedStringSet(questionAnswerSets[question.ID])
		questionList = append(questionList, *question)
	}
	answerList := make([]AnswerSatellite, 0, len(answers))
	for _, answer := range answers {
		normalizeRelations(&answer.Bindings, &answer.DiscoverySources)
		answerList = append(answerList, *answer)
	}
	probeList := make([]ArticleProbe, 0, len(probes))
	for _, probe := range probes {
		normalizeRelations(&probe.Bindings, &probe.DiscoverySources)
		probeList = append(probeList, *probe)
	}
	sort.Slice(questionList, func(i, j int) bool { return questionList[i].ID < questionList[j].ID })
	sort.Slice(answerList, func(i, j int) bool { return answerList[i].ID < answerList[j].ID })
	sort.Slice(probeList, func(i, j int) bool { return probeList[i].ID < probeList[j].ID })
	return questionList, answerList, probeList
}

func addStringSet(set *map[string]struct{}, value string) {
	if *set == nil {
		*set = map[string]struct{}{}
	}
	(*set)[value] = struct{}{}
}

func sortedStringSet(set map[string]struct{}) []string {
	if len(set) == 0 {
		return nil
	}
	values := make([]string, 0, len(set))
	for value := range set {
		values = append(values, value)
	}
	sort.Strings(values)
	return values
}

func parseAdmittedAnswer(item zhihu.Item) (answerID, questionID, questionURL string, ok bool) {
	identity := item.Identity
	rawID, found := strings.CutPrefix(identity.ContentID, "answer:")
	if !found || strings.TrimSpace(item.Title) == "" || identity.Type != zhihu.TypeAnswer {
		return "", "", "", false
	}
	resolved := zhihu.ResolveIdentity(zhihu.TypeAnswer, rawID, identity.URL, item.Title)
	if !identity.Resolved || !identity.Admitted || !resolved.Admitted || resolved.ContentID != identity.ContentID ||
		resolved.QuestionID != identity.QuestionID || resolved.QuestionURL != identity.QuestionURL {
		return "", "", "", false
	}
	return identity.ContentID, identity.QuestionID, identity.QuestionURL, true
}

func parseAdmittedQuestion(item zhihu.Item) (questionID, questionURL string, ok bool) {
	identity := item.Identity
	rawID, found := strings.CutPrefix(identity.ContentID, "question:")
	if !found || strings.TrimSpace(item.Title) == "" || identity.Type != zhihu.TypeQuestion {
		return "", "", false
	}
	resolved := zhihu.ResolveIdentity(zhihu.TypeQuestion, rawID, identity.URL, item.Title)
	if !identity.Resolved || !identity.Admitted || !resolved.Admitted || resolved.ContentID != identity.ContentID ||
		resolved.QuestionID != identity.QuestionID || resolved.QuestionURL != identity.QuestionURL {
		return "", "", false
	}
	return identity.QuestionID, identity.QuestionURL, true
}

func parseAdmittedArticle(item zhihu.Item) (string, bool) {
	identity := item.Identity
	rawID, found := strings.CutPrefix(identity.ContentID, "article:")
	if !found || strings.TrimSpace(item.Title) == "" || identity.Type != zhihu.TypeArticle {
		return "", false
	}
	resolved := zhihu.ResolveIdentity(zhihu.TypeArticle, rawID, identity.URL, item.Title)
	fromURL := zhihu.ResolveIdentity(zhihu.TypeArticle, "", identity.URL, item.Title)
	return identity.ContentID, identity.Resolved && resolved.Resolved && resolved.ContentID == identity.ContentID &&
		fromURL.Resolved && fromURL.ContentID == identity.ContentID && resolved.URL == identity.URL
}

func answerFromItem(item zhihu.Item, answerID, questionID string, authorConflict bool) *AnswerSatellite {
	answer := &AnswerSatellite{
		ID: answerID, QuestionID: questionID, Title: item.Title, Summary: item.Summary,
		URL:         "https://www.zhihu.com/question/" + strings.TrimPrefix(questionID, "question:") + "/answer/" + strings.TrimPrefix(answerID, "answer:"),
		PublishedAt: item.PublishedAt, UpdatedAt: item.UpdatedAt,
		ObservedAt: item.ObservedAt, LikeCount: item.LikeCount, CommentCount: item.CommentCount,
		FavoriteCount: item.FavoriteCount, Bindings: cloneBindings(item.Bindings),
		DiscoverySources: append([]zhihu.DiscoverySource(nil), item.DiscoverySources...),
	}
	mergeProjectedAuthor(&answer.AuthorID, &answer.AuthorName, item, authorConflict)
	return answer
}

func articleFromItem(item zhihu.Item, probeID string, authorConflict bool) *ArticleProbe {
	article := &ArticleProbe{
		ID: probeID, Title: item.Title, Summary: item.Summary,
		URL:         "https://zhuanlan.zhihu.com/p/" + strings.TrimPrefix(probeID, "article:"),
		PublishedAt: item.PublishedAt, UpdatedAt: item.UpdatedAt,
		ObservedAt: item.ObservedAt, LikeCount: item.LikeCount, CommentCount: item.CommentCount,
		FavoriteCount: item.FavoriteCount, Bindings: cloneBindings(item.Bindings),
		DiscoverySources: append([]zhihu.DiscoverySource(nil), item.DiscoverySources...),
	}
	mergeProjectedAuthor(&article.AuthorID, &article.AuthorName, item, authorConflict)
	return article
}

func mergeAnswer(answer *AnswerSatellite, item zhihu.Item, authorConflict bool) {
	answer.Title = deterministicText(answer.Title, item.Title)
	answer.Summary = richerText(answer.Summary, item.Summary)
	mergePublicFields(&answer.AuthorID, &answer.AuthorName, &answer.PublishedAt, &answer.UpdatedAt, &answer.ObservedAt,
		&answer.LikeCount, &answer.CommentCount, &answer.FavoriteCount, &answer.Bindings, &answer.DiscoverySources, item, authorConflict)
}

func mergeArticle(article *ArticleProbe, item zhihu.Item, authorConflict bool) {
	article.Title = deterministicText(article.Title, item.Title)
	article.Summary = richerText(article.Summary, item.Summary)
	mergePublicFields(&article.AuthorID, &article.AuthorName, &article.PublishedAt, &article.UpdatedAt, &article.ObservedAt,
		&article.LikeCount, &article.CommentCount, &article.FavoriteCount, &article.Bindings, &article.DiscoverySources, item, authorConflict)
}

func mergePublicFields(authorID, authorName *string, publishedAt, updatedAt, observedAt, likeCount, commentCount, favoriteCount *int64,
	bindings *[]zhihu.UserContentBinding, discoveries *[]zhihu.DiscoverySource, item zhihu.Item, authorConflict bool) {
	mergeProjectedAuthor(authorID, authorName, item, authorConflict)
	*publishedAt = earliestTime(*publishedAt, item.PublishedAt)
	if item.UpdatedAt > *updatedAt {
		*updatedAt = item.UpdatedAt
	}
	if item.ObservedAt > *observedAt {
		*observedAt = item.ObservedAt
	}
	if item.LikeCount > *likeCount {
		*likeCount = item.LikeCount
	}
	if item.CommentCount > *commentCount {
		*commentCount = item.CommentCount
	}
	if item.FavoriteCount > *favoriteCount {
		*favoriteCount = item.FavoriteCount
	}
	for _, binding := range item.Bindings {
		*bindings = mergeBinding(*bindings, binding)
	}
	for _, discovery := range item.DiscoverySources {
		*discoveries = appendUniqueDiscovery(*discoveries, discovery)
	}
}

func projectableArtifactID(item zhihu.Item) (string, bool) {
	if answerID, _, _, ok := parseAdmittedAnswer(item); ok {
		return answerID, true
	}
	return parseAdmittedArticle(item)
}

func validatedAuthor(item zhihu.Item) (id, name string, ok bool) {
	if item.AuthorIdentity == nil || !item.AuthorIdentity.Valid() {
		return "", "", false
	}
	return item.AuthorIdentity.ID, item.AuthorIdentity.Name, true
}

func mergeProjectedAuthor(authorID, authorName *string, item zhihu.Item, conflict bool) {
	id, name, verified := validatedAuthor(item)
	if conflict {
		*authorID = ""
		if verified {
			*authorName = deterministicText(*authorName, name)
		} else {
			*authorName = deterministicText(*authorName, item.Author)
		}
		return
	}
	if verified {
		if *authorID == "" {
			*authorID, *authorName = id, name
			return
		}
		if *authorID == id {
			*authorName = deterministicText(*authorName, name)
		}
		return
	}
	if *authorID == "" {
		*authorName = deterministicText(*authorName, item.Author)
	}
}

func deterministicText(current, candidate string) string {
	if current == "" || (candidate != "" && candidate < current) {
		return candidate
	}
	return current
}

func richerText(current, candidate string) string {
	if len(candidate) > len(current) || (len(candidate) == len(current) && candidate != "" && candidate < current) {
		return candidate
	}
	return current
}

func earliestTime(a, b int64) int64 {
	if a == 0 || (b != 0 && b < a) {
		return b
	}
	return a
}

func cloneBindings(bindings []zhihu.UserContentBinding) []zhihu.UserContentBinding {
	out := append([]zhihu.UserContentBinding(nil), bindings...)
	for i := range out {
		out[i].Folders = append([]string(nil), out[i].Folders...)
	}
	return out
}

func mergeBinding(bindings []zhihu.UserContentBinding, candidate zhihu.UserContentBinding) []zhihu.UserContentBinding {
	for i := range bindings {
		if bindings[i].Relation == candidate.Relation {
			bindings[i].At = earliestTime(bindings[i].At, candidate.At)
			for _, folder := range candidate.Folders {
				bindings[i].Folders = appendUnique(bindings[i].Folders, folder)
			}
			return bindings
		}
	}
	candidate.Folders = append([]string(nil), candidate.Folders...)
	return append(bindings, candidate)
}

func normalizeRelations(bindings *[]zhihu.UserContentBinding, discoveries *[]zhihu.DiscoverySource) {
	for i := range *bindings {
		sort.Strings((*bindings)[i].Folders)
	}
	sort.Slice(*bindings, func(i, j int) bool { return (*bindings)[i].Relation < (*bindings)[j].Relation })
	sort.Slice(*discoveries, func(i, j int) bool { return (*discoveries)[i] < (*discoveries)[j] })
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func appendUniqueDiscovery(values []zhihu.DiscoverySource, value zhihu.DiscoverySource) []zhihu.DiscoverySource {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
