package zhihu

import (
	"crypto/sha256"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var decimalID = regexp.MustCompile(`^[1-9][0-9]*$`)

// ContentIdentity is the stable, public identity of a Zhihu content artifact.
// Question fields are populated only when the original URL proves the relation.
type ContentIdentity struct {
	ContentID   string      `json:"contentId"`
	Type        ContentType `json:"type"`
	URL         string      `json:"url"`
	QuestionID  string      `json:"questionId,omitempty"`
	QuestionURL string      `json:"questionUrl,omitempty"`
	Admitted    bool        `json:"admitted"`
}

// ResolveIdentity parses only canonical Zhihu URL shapes and decimal raw IDs.
// It never invents a question ID. An unparseable artifact still receives a
// deterministic content identity so it can remain evidence without becoming a
// question planet.
func ResolveIdentity(contentType ContentType, rawID, rawURL, title string) ContentIdentity {
	identity := ContentIdentity{Type: contentType, URL: rawURL}
	rawID = strings.TrimSpace(rawID)
	if decimalID.MatchString(rawID) {
		identity.ContentID = string(contentType) + ":" + rawID
	}

	parsedID, questionID := parseZhihuURL(contentType, rawURL)
	if parsedID != "" {
		identity.ContentID = string(contentType) + ":" + parsedID
	}
	if identity.ContentID == "" {
		sum := sha256.Sum256([]byte(string(contentType) + "\x00" + rawURL))
		identity.ContentID = fmt.Sprintf("%s:url:%x", contentType, sum[:8])
	}

	if questionID != "" && strings.TrimSpace(title) != "" {
		identity.QuestionID = questionID
		identity.QuestionURL = "https://www.zhihu.com/question/" + questionID
		identity.Admitted = true
	}
	return identity
}

func parseZhihuURL(contentType ContentType, rawURL string) (contentID, questionID string) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" {
		return "", ""
	}
	parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
	switch contentType {
	case TypeAnswer:
		if u.Hostname() == "www.zhihu.com" && len(parts) == 4 && parts[0] == "question" && decimalID.MatchString(parts[1]) && parts[2] == "answer" && decimalID.MatchString(parts[3]) {
			return parts[3], parts[1]
		}
	case TypeQuestion:
		if u.Hostname() == "www.zhihu.com" && len(parts) == 2 && parts[0] == "question" && decimalID.MatchString(parts[1]) {
			return parts[1], parts[1]
		}
	case TypeArticle:
		if u.Hostname() == "zhuanlan.zhihu.com" && len(parts) == 2 && parts[0] == "p" && decimalID.MatchString(parts[1]) {
			return parts[1], ""
		}
	}
	return "", ""
}
