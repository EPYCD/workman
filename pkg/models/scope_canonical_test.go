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
	"testing"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"xorm.io/xorm"
)

// These are the regression tests for the identity split: one file on disk that
// two spellings turned into two independent objects, so two open tasks could
// hold a lease on it at once and neither could see the other.
//
// The repository here is the shape that produced it in the field — an app in a
// sub-directory, "app", with the rest of the repository around it.

// declareRoots publishes onto project 1 what Marshal would publish from a
// checkout: the repository's top-level entries, where the application lives,
// and the app root's own entries — the last being what makes a path ambiguous
// rather than merely unfamiliar.
func declareRoots(t *testing.T, s *xorm.Session, roots, appRoot, appEntries string) {
	t.Helper()
	_, err := s.ID(1).Cols("scope_repo_roots", "scope_app_root", "scope_app_entries").
		Update(&Project{ScopeRepoRoots: roots, ScopeAppRoot: appRoot, ScopeAppEntries: appEntries})
	require.NoError(t, err)
}

// TestScopePathCannotBeSpelledTwoWays is regression test 1 of the brief: two
// tasks claiming "src/x.ts" and "app/src/x.ts" where the app root is "app".
// The second must be REFUSED, not stored — a claim that cannot be misspelled
// cannot mint a second identity, and every downstream consumer gets
// correctness from that for free.
func TestScopePathCannotBeSpelledTwoWays(t *testing.T) {
	user1 := &user.User{ID: 1}

	t.Run("the app-relative spelling is refused, and names the one that was meant", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "app,docs,.github", "app", "src,packages")

		// The first task claims the file, spelled from the repository root.
		first := &TaskScope{TaskID: 2, PathsOwned: []string{"app/src/x.ts"}}
		require.NoError(t, first.Update(s, user1))
		assert.Equal(t, []string{"app/src/x.ts"}, first.PathsOwned)

		// The second task tries the same file as the application sees it.
		// Before this check that was simply a different object: stored without
		// complaint, invisible to the first task's lease, and handed its own
		// worktree on a file already being edited.
		second := &TaskScope{TaskID: 3, PathsOwned: []string{"src/x.ts"}}
		err := second.Update(s, user1)
		require.Error(t, err)
		require.True(t, IsErrNonCanonicalScopePath(err), "got %T: %v", err, err)

		nonCanonical := err.(ErrNonCanonicalScopePath)
		assert.Equal(t, "src/x.ts", nonCanonical.Pattern)
		assert.Equal(t, "app/src/x.ts", nonCanonical.Suggestion,
			"the refusal must name the spelling the caller probably meant")
		assert.Contains(t, err.Error(), "not canonical")
		assert.Contains(t, err.Error(), "app, docs, .github")

		// Refused means refused: nothing was written.
		stored := &TaskScope{TaskID: 3}
		require.NoError(t, stored.ReadOne(s, user1))
		assert.Empty(t, stored.PathsOwned)
	})

	t.Run("paths_affected is held to the same rule", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "app,docs", "app", "src")

		sc := &TaskScope{TaskID: 2, PathsOwned: []string{"app/a.ts"}, PathsAffected: []string{"src/b.ts"}}
		require.Error(t, sc.Update(s, user1))
	})

	t.Run("a first segment that is a glob is anchored nowhere, so nothing to be wrong about", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "app,docs", "app", "src")

		sc := &TaskScope{TaskID: 2, PathsOwned: []string{"**/*.md", "*.lock"}}
		require.NoError(t, sc.Update(s, user1))
	})

	// This is the false positive CI caught: a task whose whole job is to create
	// src/ could not declare its scope, and there was no override to reach for.
	// Only the app-relative spelling of an EXISTING app directory is ambiguous;
	// a first segment unknown to both bases is simply new.
	t.Run("a directory that does not exist yet is claimable", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "docs,.github,README", "", "")

		sc := &TaskScope{TaskID: 2, PathsOwned: []string{"src/lib/contract/hire.ts"}}
		require.NoError(t, sc.Update(s, user1))
		assert.Equal(t, []string{"src/lib/contract/hire.ts"}, sc.PathsOwned)
	})

	t.Run("a new top-level directory is claimable even beside an app root", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		// "src" is inside the app root, so app-relative. "tooling" is in
		// neither, so it is a directory nobody has created yet.
		declareRoots(t, s, "app,docs", "app", "src,packages")

		ok := &TaskScope{TaskID: 2, PathsOwned: []string{"tooling/gen.ts"}}
		require.NoError(t, ok.Update(s, user1))

		ambiguous := &TaskScope{TaskID: 3, PathsOwned: []string{"src/x.ts"}}
		require.Error(t, ambiguous.Update(s, user1))
	})

	t.Run("without the app root's entries there is no ambiguity to detect", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "app,docs", "app", "")

		sc := &TaskScope{TaskID: 2, PathsOwned: []string{"src/x.ts"}}
		require.NoError(t, sc.Update(s, user1))
	})

	t.Run("a project that has declared nothing enforces nothing", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		// No roots published: the board cannot tell which base was meant, and
		// refusing on a guess would break every project that predates this.
		sc := &TaskScope{TaskID: 2, PathsOwned: []string{"src/x.ts"}}
		require.NoError(t, sc.Update(s, user1))
		assert.Equal(t, []string{"src/x.ts"}, sc.PathsOwned)
	})

	t.Run("without an app root there is no suggestion, only the refusal", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		declareRoots(t, s, "pkg,frontend", "", "src")

		err := (&TaskScope{TaskID: 2, PathsOwned: []string{"src/x.ts"}}).Update(s, user1)
		require.True(t, IsErrNonCanonicalScopePath(err), "got %T: %v", err, err)
		assert.Empty(t, err.(ErrNonCanonicalScopePath).Suggestion)
		assert.NotContains(t, err.Error(), "Did you mean")
	})
}

// TestScopeCheckOwnsWhatTheClaimSays is regression test 2 of the brief: a
// commit touching "app/src/x.ts" against a claim stored as "app/src/x.ts".
// Every file must read "owned", never "unscoped".
//
// It read "unscoped" for a whole commit in the field, because the two sides of
// the check were normalised against different bases: git prints paths from the
// repository root, while marshal was stripping the app root off them before
// asking.
func TestScopeCheckOwnsWhatTheClaimSays(t *testing.T) {
	user1 := &user.User{ID: 1}

	db.LoadAndAssertFixtures(t)
	s := db.NewSession()
	defer s.Close()
	declareRoots(t, s, "app,docs,.github", "app", "src,packages")

	claimed := []string{
		"app/src/x.ts",
		"app/src/server/db/schema.ts",
		"app/packages/engine/**",
	}
	require.NoError(t, (&TaskScope{TaskID: 2, PathsOwned: claimed}).Update(s, user1))

	// Exactly what `git diff --name-only` prints.
	changed := []string{
		"app/src/x.ts",
		"app/src/server/db/schema.ts",
		"app/packages/engine/src/agreement.ts",
	}
	res, err := CheckScope(s, 1, &ScopeCheckRequest{TaskIDs: []int64{2}, Files: changed})
	require.NoError(t, err)

	assert.True(t, res.Enforced)
	assert.True(t, res.OK)
	assert.Zero(t, res.Strays)
	require.Len(t, res.Files, len(changed))
	for i, f := range res.Files {
		assert.Equal(t, ScopeVerdictOwned, f.Verdict, "%s should be owned, got %s", changed[i], f.Verdict)
		assert.Equal(t, changed[i], f.Path, "the path is reported as git printed it")
	}
}
