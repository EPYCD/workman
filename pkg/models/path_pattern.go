// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package models

import (
	"path"
	"strings"
)

// Scope paths are repository-relative glob patterns: `pkg/models/tasks.go`,
// `pkg/models/*.go`, `frontend/src/**`. Segments are matched with path.Match
// and `**` matches any number of segments, which is the subset of glob syntax
// agents actually write and the one whose overlap can be decided cheaply.
//
// # The canonical form
//
// One spelling per file, because a lease is exclusion and exclusion compares
// strings. A scope path is canonical when it is:
//
//   - relative to the REPOSITORY root, never to a sub-directory of it — an app
//     that lives in `captain-yard-web/` claims `captain-yard-web/src/x.ts`;
//   - separated by forward slashes, with no leading `/`, no `./`, no repeated
//     slashes and no `.` or `..` segment;
//   - without a trailing slash: a directory claims its subtree either bare
//     (`pkg/models`) or with an explicit glob (`pkg/models/**`);
//   - prefixed with `repo:` in a project spanning several repositories.
//
// The repository root is the base because git already reports changed files
// that way and cannot be argued with: `git diff --name-only` is the one
// producer of a path with no choice about its format, so it defines correct.
//
// Everything that stores or compares a scope path goes through CanonicalPath.
// Two spellings of one file are two identities to a lease, an overlap check
// and a chokepoint queue alike, so the rule lives in one function rather than
// in each caller's head.

const maxScopePathLength = 500

// CanonicalPath is the single normalisation every scope path passes through,
// on its way in and before any comparison. It applies repo as the `repo:`
// namespace of a bare pattern (empty for a single-repository project, and
// never applied twice), then canonicalises: trims, folds backslashes to `/`,
// strips a leading `./` or `/`, collapses repeated slashes and drops a
// trailing slash. It rejects anything that could escape the repository.
//
// It does not rebase a path: a caller that hands it a path relative to a
// sub-directory gets that path back, canonically spelled and still wrong.
// Deciding which base a human meant needs the repository on disk, which the
// board does not have.
func CanonicalPath(raw, repo string) (string, error) {
	p := strings.TrimSpace(raw)
	if repo != "" && p != "" {
		if existing, _ := splitRepoPrefix(p); existing == "" {
			p = repo + ":" + p
		}
	}
	return normalizeScopePath(p, raw)
}

// NormalizeScopePath canonicalises a pattern that already carries whatever
// `repo:` prefix it should have. It is CanonicalPath with no namespace to
// apply.
func NormalizeScopePath(raw string) (string, error) {
	return CanonicalPath(raw, "")
}

// normalizeScopePath does the work. raw is the string the caller passed,
// echoed back in errors so a prefixed rewrite never shows up in a message
// about a path the caller never wrote.
func normalizeScopePath(p, raw string) (string, error) {
	if p == "" {
		return "", ErrInvalidScopePath{Pattern: raw, Reason: "empty"}
	}
	if len(p) > maxScopePathLength {
		return "", ErrInvalidScopePath{Pattern: raw, Reason: "longer than 500 characters"}
	}
	if strings.ContainsAny(p, "\x00\n\r") {
		return "", ErrInvalidScopePath{Pattern: raw, Reason: "contains control characters"}
	}
	repo, p := splitRepoPrefix(p)
	if repo != "" && !validRepoName(repo) {
		return "", ErrInvalidScopePath{Pattern: raw, Reason: "repository prefix may only contain letters, digits, '.', '_' and '-'"}
	}
	p = strings.TrimSpace(p)
	p = strings.ReplaceAll(p, "\\", "/")
	for strings.HasPrefix(p, "./") {
		p = strings.TrimPrefix(p, "./")
	}
	p = strings.TrimPrefix(p, "/")
	for strings.Contains(p, "//") {
		p = strings.ReplaceAll(p, "//", "/")
	}
	p = strings.TrimSuffix(p, "/")
	if p == "" || p == "." {
		return "", ErrInvalidScopePath{Pattern: raw, Reason: "does not name anything"}
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." {
			return "", ErrInvalidScopePath{Pattern: raw, Reason: "must not contain '..'"}
		}
		if seg == "." {
			return "", ErrInvalidScopePath{Pattern: raw, Reason: "must not contain '.' segments"}
		}
	}
	if repo != "" {
		return repo + ":" + p, nil
	}
	return p, nil
}

// ScopeRoots is a project's statement of the one confusion the board cannot
// resolve on its own: whether a scope path was written from the repository
// root or from the sub-directory the application lives in.
//
// The board has no checkout. "src/db/schema.ts" relative to an app
// sub-directory — a second identity for a file already claimed — and
// "src/db/schema.ts" relative to the repository root are the same string.
// Something holding the repository has to say which. Marshal does: it
// publishes the repository's top-level entries, the app root, and the app
// root's OWN top-level entries, and the board decides from those three.
//
// Empty Roots means "not declared", and nothing is enforced.
type ScopeRoots struct {
	// Roots are the repository's top-level entries: "captain-yard-web",
	// ".github", "docs".
	Roots []string
	// AppRoot is the sub-directory the application lives in, when it is not
	// the repository root. It is used ONLY to offer a suggestion — never to
	// rewrite a path. Silently rebasing a path a human typed is how a claim
	// lands on a file nobody meant to claim.
	AppRoot string
	// AppEntries are the app root's own top-level entries: "src", "packages",
	// "docs". A path starting with one of these, when the repository root has
	// no such entry, is the app-relative spelling and nothing else — that is
	// the whole ambiguity, and the only thing worth refusing.
	AppEntries []string
}

// ParseScopeRoots reads the comma-separated forms stored on a project.
func ParseScopeRoots(roots, appRoot, appEntries string) ScopeRoots {
	out := ScopeRoots{AppRoot: strings.Trim(strings.TrimSpace(appRoot), "/")}
	out.Roots = splitScopeList(roots)
	out.AppEntries = splitScopeList(appEntries)
	return out
}

func splitScopeList(raw string) []string {
	var out []string
	for _, r := range strings.Split(raw, ",") {
		if r = strings.Trim(strings.TrimSpace(r), "/"); r != "" {
			out = append(out, r)
		}
	}
	return out
}

// Declared reports whether this project has published enough to enforce.
// Without the app root's entries there is no ambiguity to detect, whatever
// else is known.
func (sr ScopeRoots) Declared() bool { return len(sr.Roots) > 0 && len(sr.AppEntries) > 0 }

// Check rejects a canonical pattern that is the app-relative spelling of a
// path: one whose first segment names something inside the app root and
// nothing at the repository root. The pattern must already have been through
// CanonicalPath — this decides which base it is relative to, not how it is
// spelled.
//
// It deliberately does NOT refuse a first segment that is unknown to both. A
// task may claim a file in a directory that does not exist yet — creating it
// is often the whole job — and refusing that would make scope undeclarable
// for exactly the work that most needs a claim, with no override to reach
// for. Only the genuinely ambiguous spelling is worth stopping, because only
// that one can silently become a second identity for a file someone else
// already holds.
//
// A first segment carrying a wildcard is accepted whatever it is: "**/logs"
// and "*.md" are anchored nowhere by construction, so there is no base to be
// wrong about.
func (sr ScopeRoots) Check(pattern string) error {
	if !sr.Declared() {
		return nil
	}
	_, rest := splitRepoPrefix(pattern)
	first, _, _ := strings.Cut(rest, "/")
	if first == "" || segmentHasWildcard(first) {
		return nil
	}
	// Named at the repository root: canonical by definition.
	for _, root := range sr.Roots {
		if first == root {
			return nil
		}
	}
	// Named inside the app root and nowhere else: the app-relative spelling.
	for _, entry := range sr.AppEntries {
		if first == entry {
			return ErrNonCanonicalScopePath{
				Pattern:    pattern,
				Suggestion: sr.suggest(pattern),
				Roots:      sr.Roots,
			}
		}
	}
	// Unknown to both: a directory that does not exist yet. Not ours to refuse.
	return nil
}

// suggest offers the app-root-prefixed spelling when the project has an app
// root that is itself a valid root — the overwhelmingly common way to get this
// wrong is to write a path as the application sees it. It is a question, not a
// rewrite: a caller that meant a genuinely new top-level directory answers by
// publishing roots that include it.
func (sr ScopeRoots) suggest(pattern string) string {
	if sr.AppRoot == "" {
		return ""
	}
	var appRootIsARoot bool
	for _, root := range sr.Roots {
		if root == sr.AppRoot {
			appRootIsARoot = true
			break
		}
	}
	if !appRootIsARoot {
		return ""
	}
	repo, rest := splitRepoPrefix(pattern)
	candidate := sr.AppRoot + "/" + rest
	if repo != "" {
		candidate = repo + ":" + candidate
	}
	return candidate
}

// splitRepoPrefix separates an optional `repo:` namespace from a pattern.
// Projects spanning several repositories prefix their paths so `src/index.ts`
// in one repo never collides with the same path in another; patterns without
// a prefix all live in the project's default repository. Only a prefix that
// looks like a name counts — a colon inside a path segment stays a path.
func splitRepoPrefix(p string) (repo, rest string) {
	i := strings.Index(p, ":")
	if i <= 0 || strings.ContainsAny(p[:i], "/\\*?[") {
		return "", p
	}
	return p[:i], p[i+1:]
}

func validRepoName(repo string) bool {
	for _, r := range repo {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '.' && r != '_' && r != '-' {
			return false
		}
	}
	return true
}

func segmentHasWildcard(seg string) bool {
	return strings.ContainsAny(seg, "*?[")
}

// literalPrefix returns the leading segments up to the first one containing a
// wildcard. Two patterns whose literal prefixes diverge can never match the
// same path.
func literalPrefix(segs []string) []string {
	for i, seg := range segs {
		if segmentHasWildcard(seg) {
			return segs[:i]
		}
	}
	return segs
}

func isPrefixOf(short, long []string) bool {
	if len(short) > len(long) {
		return false
	}
	for i := range short {
		if short[i] != long[i] {
			return false
		}
	}
	return true
}

// matchGlob reports whether a concrete path matches a pattern, with `**`
// spanning zero or more segments and every other segment going through
// path.Match.
func matchGlob(pattern, concrete []string) bool {
	if len(pattern) == 0 {
		return len(concrete) == 0
	}
	if pattern[0] == "**" {
		// Try consuming zero segments, then one, then more.
		for i := 0; i <= len(concrete); i++ {
			if matchGlob(pattern[1:], concrete[i:]) {
				return true
			}
		}
		return false
	}
	if len(concrete) == 0 {
		return false
	}
	ok, err := path.Match(pattern[0], concrete[0])
	if err != nil || !ok {
		return false
	}
	return matchGlob(pattern[1:], concrete[1:])
}

func hasWildcard(segs []string) bool {
	for _, s := range segs {
		if segmentHasWildcard(s) {
			return true
		}
	}
	return false
}

// coversSubtree is true for patterns that claim everything under their
// literal prefix: `dir/**`, `dir/**/*`, `**`.
func coversSubtree(segs []string) bool {
	lit := literalPrefix(segs)
	rest := segs[len(lit):]
	if len(rest) == 0 {
		return false
	}
	if rest[0] != "**" {
		return false
	}
	for _, s := range rest[1:] {
		if s != "*" && s != "**" {
			return false
		}
	}
	return true
}

// PathCoveredBy reports whether a concrete, normalised file path falls under
// a scope pattern: the pattern names the file, names a directory above it,
// or is a glob it matches. Patterns and files in different repositories
// (repo: prefix) never cover each other.
func PathCoveredBy(pattern, file string) bool {
	repoP, pattern := splitRepoPrefix(pattern)
	repoF, file := splitRepoPrefix(file)
	if repoP != repoF {
		return false
	}
	ps, fs := strings.Split(pattern, "/"), strings.Split(file, "/")
	if !hasWildcard(ps) {
		return isPrefixOf(ps, fs)
	}
	return matchGlob(ps, fs)
}

// PathPatternsOverlap reports whether two normalised scope patterns can name
// the same file. It is exact for the common shapes — concrete paths, a
// directory subtree, single-segment wildcards — and conservative for the rest:
// two wildcard patterns with a shared literal prefix and the same depth are
// treated as overlapping, so an exotic pair may be refused that a full
// intersection test would allow, but a real collision is never missed.
func PathPatternsOverlap(a, b string) bool {
	if a == b {
		return true
	}
	repoA, a := splitRepoPrefix(a)
	repoB, b := splitRepoPrefix(b)
	if repoA != repoB {
		return false
	}
	as, bs := strings.Split(a, "/"), strings.Split(b, "/")
	la, lb := literalPrefix(as), literalPrefix(bs)
	if !isPrefixOf(la, lb) && !isPrefixOf(lb, la) {
		return false
	}

	aWild, bWild := hasWildcard(as), hasWildcard(bs)
	switch {
	case !aWild && !bWild:
		// Two concrete paths overlap only when equal (handled above) or when
		// one is a directory containing the other.
		return isPrefixOf(as, bs) || isPrefixOf(bs, as)
	case !aWild:
		return matchGlob(bs, as) || (isPrefixOf(as, lb))
	case !bWild:
		return matchGlob(as, bs) || (isPrefixOf(bs, la))
	}

	// Both have wildcards and share a literal prefix.
	if coversSubtree(as) || coversSubtree(bs) {
		return true
	}
	if len(as) != len(bs) {
		return false
	}
	for i := range as {
		if as[i] == bs[i] || segmentHasWildcard(as[i]) || segmentHasWildcard(bs[i]) {
			continue
		}
		return false
	}
	return true
}
