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
	"time"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTaskLag(t *testing.T) {
	user1 := &user.User{ID: 1}

	t.Run("a task with no lag reads empty, not 404", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{TaskID: 1}
		require.NoError(t, lag.ReadOne(s, user1))
		assert.Zero(t, lag.ID)
		assert.Equal(t, []*LagCollision{}, lag.Collisions)
	})

	// The severity is what gates, so it is derived from the collisions rather
	// than trusted from the body: a caller that could set it independently
	// could gate on a claim the collision list does not support.
	t.Run("severity is derived, never taken from the caller", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{
			TaskID: 1, Branch: "e7.2", Base: "origin/main",
			Severity:      LagSeverityElsewhere, // a lie
			CommitsBehind: 7,
			Collisions: []*LagCollision{
				{Path: "app/src/lib/x.ts", Severity: LagSeverityAffected},
				{Path: "app/src/db/schema.ts", Severity: LagSeverityOwned},
			},
			ComputedAt: time.Now().UTC(),
		}
		require.NoError(t, lag.Update(s, user1))
		assert.Equal(t, LagSeverityOwned, lag.Severity, "the worst collision decides")
		assert.True(t, lag.Blocking())

		read := &TaskLag{TaskID: 1}
		require.NoError(t, read.ReadOne(s, user1))
		assert.Equal(t, LagSeverityOwned, read.Severity)
		assert.Equal(t, 7, read.CommitsBehind)
		require.Len(t, read.Collisions, 2)
	})

	t.Run("behind in nothing it holds is still a record, and gates nothing", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{TaskID: 1, Branch: "e7.2", Base: "origin/main", CommitsBehind: 40}
		require.NoError(t, lag.Update(s, user1))
		// Forty commits behind in files you never touch is noise, and saying
		// so is different from never having looked.
		assert.Equal(t, LagSeverityElsewhere, lag.Severity)
		assert.False(t, lag.Blocking())
	})

	t.Run("collision paths are canonicalised like any other scope path", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{
			TaskID: 1, Branch: "b", Base: "origin/main", CommitsBehind: 1,
			Collisions: []*LagCollision{{Path: "./app//src/x.ts", Severity: LagSeverityOwned}},
		}
		require.NoError(t, lag.Update(s, user1))
		assert.Equal(t, "app/src/x.ts", lag.Collisions[0].Path)
	})

	t.Run("an unknown severity is refused rather than ranked as nothing", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{
			TaskID: 1, Branch: "b", Base: "origin/main", CommitsBehind: 1,
			Collisions: []*LagCollision{{Path: "app/src/x.ts", Severity: "catastrophic"}},
		}
		err := lag.Update(s, user1)
		require.Error(t, err)
		assert.True(t, IsErrInvalidLagSeverity(err), "got %T", err)
	})

	// Marshal deletes the record when a branch catches up, so an absent record
	// means "current" rather than "never looked" — without which the board
	// keeps yesterday's answer and every consumer is wrong in the direction
	// that costs work.
	t.Run("delete clears it", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		lag := &TaskLag{TaskID: 1, Branch: "b", Base: "origin/main", CommitsBehind: 3}
		require.NoError(t, lag.Update(s, user1))
		require.NoError(t, (&TaskLag{TaskID: 1}).Delete(s, user1))

		read := &TaskLag{TaskID: 1}
		require.NoError(t, read.ReadOne(s, user1))
		assert.Zero(t, read.ID)
	})

	t.Run("update is an upsert, not a second row", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		first := &TaskLag{TaskID: 1, Branch: "b", Base: "origin/main", CommitsBehind: 3}
		require.NoError(t, first.Update(s, user1))
		second := &TaskLag{TaskID: 1, Branch: "b", Base: "origin/main", CommitsBehind: 9}
		require.NoError(t, second.Update(s, user1))
		assert.Equal(t, first.ID, second.ID)

		count, err := s.Where("task_id = ?", 1).Count(&TaskLag{})
		require.NoError(t, err)
		assert.Equal(t, int64(1), count)
	})
}

// TestReadinessLagGatesOnlyOnOwned is the rule the ladder rests on: affected
// and elsewhere are reported and gate nothing, anywhere. Gating on affected
// would make overriding routine, and an override everyone types by reflex
// defeats the gate on owned too.
func TestReadinessLagGatesOnlyOnOwned(t *testing.T) {
	user1 := &user.User{ID: 1}

	readinessFor := func(t *testing.T, severity string, collisions []*LagCollision) *TaskReadiness {
		t.Helper()
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		// Task 9 sits in project 1's view 4, bucket 1 — the ready queue.
		lag := &TaskLag{TaskID: 9, Branch: "e9.4", Base: "origin/main", CommitsBehind: 4, Collisions: collisions}
		require.NoError(t, lag.Update(s, user1))
		require.Equal(t, severity, lag.Severity)

		view := &ProjectView{ID: 4, ProjectID: 1}
		rows, err := GetTaskReadiness(s, user1, view, 1)
		require.NoError(t, err)
		for _, r := range rows {
			if r.Task != nil && r.Task.ID == 9 {
				return r
			}
		}
		t.Fatal("task 9 was not in the ready queue")
		return nil
	}

	owned := readinessFor(t, LagSeverityOwned, []*LagCollision{{Path: "pkg/models/tasks.go", Severity: LagSeverityOwned}})
	assert.Contains(t, owned.Reasons, ReadinessReasonLag)
	assert.False(t, owned.Ready)
	require.NotNil(t, owned.Lag)

	affected := readinessFor(t, LagSeverityAffected, []*LagCollision{{Path: "pkg/models/tasks.go", Severity: LagSeverityAffected}})
	assert.NotContains(t, affected.Reasons, ReadinessReasonLag, "affected must not gate")
	require.NotNil(t, affected.Lag, "but it is still reported")

	elsewhere := readinessFor(t, LagSeverityElsewhere, nil)
	assert.NotContains(t, elsewhere.Reasons, ReadinessReasonLag, "elsewhere must not gate")
	require.NotNil(t, elsewhere.Lag)
}
