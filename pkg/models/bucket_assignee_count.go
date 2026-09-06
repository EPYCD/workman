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
	"code.vikunja.io/api/pkg/user"

	"xorm.io/xorm"
)

// BucketAssigneeCount is how many tasks in one bucket are held by one person.
//
// UserID 0 means unassigned. A task with two assignees is counted once for
// each of them, which is how the board groups it too: it appears in both
// lanes, so both lanes have to count it.
type BucketAssigneeCount struct {
	BucketID int64      `json:"bucket_id" doc:"The bucket these tasks are in."`
	UserID   int64      `json:"user_id" doc:"The assignee, or 0 for tasks nobody is assigned to."`
	User     *user.User `json:"user" doc:"The assignee, or null when user_id is 0."`
	Count    int64      `json:"count" doc:"How many tasks in this bucket that person holds — every one of them, not the page the board has loaded."`
}

// GetBucketAssigneeCounts answers "who holds what" for a whole kanban view.
//
// The board can only ever hold a page of a column in the DOM — 25 tasks
// against a Done column of 122 — so counting the cards it has produces a
// number that grows as you scroll and looks authoritative at every size. The
// count has to come from the server or it is not a count at all.
//
// The caller has checked read access on the project.
func GetBucketAssigneeCounts(s *xorm.Session, view *ProjectView) ([]*BucketAssigneeCount, error) {
	type row struct {
		BucketID int64 `xorm:"bucket_id"`
		UserID   int64 `xorm:"user_id"`
		Count    int64 `xorm:"count"`
	}

	rows := []*row{}
	err := s.Table("task_buckets").
		Select("task_buckets.bucket_id AS bucket_id, COALESCE(task_assignees.user_id, 0) AS user_id, count(DISTINCT task_buckets.task_id) AS count").
		Join("INNER", "tasks", "tasks.id = task_buckets.task_id").
		// A soft-deleted task keeps its task_buckets row, and xorm's deleted
		// tag does not reach a join from another bean.
		Join("LEFT", "task_assignees", "task_assignees.task_id = task_buckets.task_id").
		Where("task_buckets.project_view_id = ?", view.ID).
		And(taskNotDeletedCond("tasks")).
		GroupBy("task_buckets.bucket_id, COALESCE(task_assignees.user_id, 0)").
		Find(&rows)
	if err != nil {
		return nil, err
	}

	userIDs := make([]int64, 0, len(rows))
	for _, r := range rows {
		if r.UserID != 0 {
			userIDs = append(userIDs, r.UserID)
		}
	}
	users, err := getUsersOrLinkSharesFromIDs(s, userIDs)
	if err != nil {
		return nil, err
	}

	out := make([]*BucketAssigneeCount, 0, len(rows))
	for _, r := range rows {
		c := &BucketAssigneeCount{BucketID: r.BucketID, UserID: r.UserID, Count: r.Count}
		if u, has := users[r.UserID]; has {
			c.User = u
		}
		out = append(out, c)
	}
	return out, nil
}
