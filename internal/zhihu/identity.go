package zhihu

import (
	"crypto/sha256"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var decimalID = regexp.MustCompile(`^[1-9][0-9]*$`)
var questionPath = regexp.MustCompile(`^/question/([1-9][0-9]*)$`)
var answerPath = regexp.MustCompile(`^/question/([1-9][0-9]*)/answer/([1-9][0-9]*)$`)
var articlePath = regexp.MustCompile(`^/p/([1-9][0-9]*)$`)

// ContentIdentity separates a resolved artifact identity from an ephemeral
// evidence key. Question fields are populated only when the original URL
// proves the relation.
type ContentIdentity struct {
	ContentID   string      `json:"contentId"`
	EvidenceKey string      `json:"evidenceKey,omitempty"`
	Type        ContentType `json:"type"`
	URL         string      `json:"url"`
	QuestionID  string      `json:"questionId,omitempty"`
	QuestionURL string      `json:"questionUrl,omitempty"`
	Resolved    bool        `json:"resolved"`
	Admitted    bool        `json:"admitted"`
}

// ResolveIdentity parses only canonical Zhihu URL shapes and decimal raw IDs.
// It never invents a question ID. A noncanonical but non-empty URL receives a
// URL-derived fallback identity. With no immutable discriminator, ContentID is
// deliberately empty and the merger assigns only a per-input evidence key.
func ResolveIdentity(contentType ContentType, rawID, rawURL, title string) ContentIdentity {
	identity := ContentIdentity{Type: contentType, URL: rawURL}
	rawID = strings.TrimSpace(rawID)
	hasRawID := decimalID.MatchString(rawID)
	if hasRawID {
		identity.ContentID = string(contentType) + ":" + rawID
		identity.Resolved = true
	}

	parsedID, questionID := parseZhihuURL(contentType, rawURL)
	if hasRawID && parsedID != "" && rawID != parsedID {
		identity.EvidenceKey = identity.ContentID
		return identity
	}
	if !hasRawID && parsedID != "" {
		identity.ContentID = string(contentType) + ":" + parsedID
		identity.Resolved = true
	}
	if identity.ContentID == "" {
		if rawURL == "" {
			return identity
		}
		sum := sha256.Sum256([]byte(string(contentType) + "\x00" + rawURL))
		identity.ContentID = fmt.Sprintf("%s:fallback:%x", contentType, sum[:])
		identity.Resolved = true
	}
	identity.EvidenceKey = identity.ContentID

	if questionID != "" && strings.TrimSpace(title) != "" {
		identity.QuestionID = questionID
		identity.QuestionURL = "https://www.zhihu.com/question/" + questionID
		identity.Admitted = true
	}
	return identity
}

func parseZhihuURL(contentType ContentType, rawURL string) (contentID, questionID string) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(rawURL, "#") {
		return "", ""
	}
	switch contentType {
	case TypeAnswer:
		if match := answerPath.FindStringSubmatch(u.EscapedPath()); strings.EqualFold(u.Host, "www.zhihu.com") && match != nil {
			return match[2], match[1]
		}
	case TypeQuestion:
		if match := questionPath.FindStringSubmatch(u.EscapedPath()); strings.EqualFold(u.Host, "www.zhihu.com") && match != nil {
			return match[1], match[1]
		}
	case TypeArticle:
		if match := articlePath.FindStringSubmatch(u.EscapedPath()); strings.EqualFold(u.Host, "zhuanlan.zhihu.com") && match != nil {
			return match[1], ""
		}
	}
	return "", ""
}
