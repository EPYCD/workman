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
)

// TestGetBucketAssigneeCounts covers the number a "group by assignee" lane
// shows.
//
// The board grouped by assignee over the tasks it had in the DOM. A column of
// 122 loads 25 at a time, so the same lane read 4, then 5, then more as
// somebody scrolled, and every one of those numbers looked like a total. The
// answer has to come from the server.
func TestGetBucketAssigneeCounts(t *testing.T) {
	key := func(bucketID, userID int64) [2]int64 { return [2]int64{bucketID, userID} }

	load := func(t *testing.T) map[[2]int64]int64 {
		t.Helper()
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		view, err := GetProjectViewByIDAndProject(s, 4, 1)
		require.NoError(t, err)
		rows, err := GetBucketAssigneeCounts(s, view)
		require.NoError(t, err)

		out := make(map[[2]int64]int64, len(rows))
		for _, r := range rows {
			out[key(r.BucketID, r.UserID)] = r.Count
		}
		return out
	}

	t.Run("counts every task, not a page of them", func(t *testing.T) {
		counts := load(t)

		// Bucket 1 holds 11 tasks: ten with nobody on them, and one shared by
		// users 1 and 2.
		assert.Equal(t, int64(10), counts[key(1, 0)])
		assert.Equal(t, int64(1), counts[key(1, 1)])
		assert.Equal(t, int64(1), counts[key(1, 2)])

		assert.Equal(t, int64(3), counts[key(2, 0)])
		assert.Equal(t, int64(4), counts[key(3, 0)])
	})

	t.Run("a task with two assignees is counted for both", func(t *testing.T) {
		counts := load(t)

		// This is deliberate, not an accident of the query: a board grouped by
		// assignee puts that card in both lanes, so both lanes have to count
		// it. The lane totals therefore sum to more than the bucket's count,
		// and that is the honest answer to "how many does this person hold".
		var total int64
		for _, n := range counts {
			total += n
		}
		assert.Equal(t, int64(12+3+4), total)
	})

	t.Run("the assignee is resolved, unassigned is not", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		view, err := GetProjectViewByIDAndProject(s, 4, 1)
		require.NoError(t, err)
		rows, err := GetBucketAssigneeCounts(s, view)
		require.NoError(t, err)

		for _, r := range rows {
			if r.UserID == 0 {
				assert.Nil(t, r.User, "the unassigned row must not carry a user")
				continue
			}
			require.NotNil(t, r.User, "assignee %d came back without a user", r.UserID)
			assert.Equal(t, r.UserID, r.User.ID)
		}
	})

	t.Run("a soft-deleted task drops out of the lane", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		view, err := GetProjectViewByIDAndProject(s, 4, 1)
		require.NoError(t, err)

		before, err := GetBucketAssigneeCounts(s, view)
		require.NoError(t, err)
		var was int64
		for _, r := range before {
			if r.BucketID == 1 && r.UserID == 0 {
				was = r.Count
			}
		}
		require.NotZero(t, was)

		// Task 1 is in bucket 1 with nobody assigned. Its task_buckets row
		// outlives the soft delete, so a count over those rows alone would go
		// on reporting it.
		_, err = s.Where("id = ?", 1).Delete(&Task{})
		require.NoError(t, err)

		after, err := GetBucketAssigneeCounts(s, view)
		require.NoError(t, err)
		for _, r := range after {
			if r.BucketID == 1 && r.UserID == 0 {
				assert.Equal(t, was-1, r.Count)
			}
		}
	})

	t.Run("reconciles with the bucket count", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		u := &user.User{ID: 1}
		view, err := GetProjectViewByIDAndProject(s, 4, 1)
		require.NoError(t, err)

		listed, _, _, err := (&Bucket{ProjectViewID: 4, ProjectID: 1}).ReadAll(s, u, "", 0, 0)
		require.NoError(t, err)
		buckets := listed.([]*Bucket)

		rows, err := GetBucketAssigneeCounts(s, view)
		require.NoError(t, err)
		perBucket := map[int64]int64{}
		for _, r := range rows {
			perBucket[r.BucketID] += r.Count
		}

		// Lanes can only over-count, never under-count: every task is in at
		// least one lane, and a shared one is in several. A lane sum below the
		// bucket's own count would mean tasks nobody can see.
		for _, b := range buckets {
			assert.GreaterOrEqual(t, perBucket[b.ID], b.Count,
				"bucket %d: lanes total %d against a count of %d", b.ID, perBucket[b.ID], b.Count)
		}
	})
}
