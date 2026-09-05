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
	"time"

	"code.vikunja.io/api/pkg/web"

	"xorm.io/xorm"
)

// Lag severities, worst first. The ladder is the point: a tool that says "you
// are behind" is ignored within a week, while one that says "#43 landed
// schema.ts, you are editing schema.ts, you will conflict" is obeyed, because
// that is a specific and checkable claim.
const (
	// LagSeverityOwned: the integration branch moved inside a path in
	// paths_owned. A textual conflict is certain, not likely.
	LagSeverityOwned = "owned"
	// LagSeverityAffected: it moved inside paths_affected. No merge conflict,
	// but the code the task depends on changed and its gates will not see that
	// until it rebases. This is what paths_affected is finally for; until now
	// it was recorded and never read.
	LagSeverityAffected = "affected"
	// LagSeverityElsewhere: it moved outside the task's scope entirely.
	// Counted and displayed, and gates nothing anywhere.
	LagSeverityElsewhere = "elsewhere"
)

// lagSeverityRank orders severities so the worst can be taken across a set.
var lagSeverityRank = map[string]int{
	LagSeverityElsewhere: 1,
	LagSeverityAffected:  2,
	LagSeverityOwned:     3,
}

// TaskLag is how far a claimed task's branch has fallen behind the integration
// branch, scoped to what the task claims.
//
// "Commits behind main" is the wrong unit. Forty commits behind in files you
// never touch is noise; one commit behind in the file you are editing is
// certain rework. So a branch has lag when the integration branch contains
// commits, unreachable from that branch, that touch paths the task holds — and
// the severity says which of its path sets they landed in.
//
// It is computed by Marshal, which is the only component with the git
// repository, and stored here so it is first-class rather than a label an
// agent has to be told to read. Nobody else writes it.
type TaskLag struct {
	ID     int64 `xorm:"bigint autoincr not null unique pk" json:"id" readOnly:"true" doc:"The unique, numeric id of this lag record."`
	TaskID int64 `xorm:"bigint not null unique index" json:"task_id" param:"projecttask" readOnly:"true" doc:"The task this lag belongs to. Taken from the URL."`

	Branch       string `xorm:"varchar(250) not null" json:"branch" doc:"The task's branch, as the veans:branch: label names it."`
	Base         string `xorm:"varchar(250) not null" json:"base" doc:"The integration branch it is measured against, e.g. \"origin/main\"."`
	BaseSHA      string `xorm:"varchar(64) null" json:"base_sha" doc:"What the integration branch pointed at when this was computed."`
	MergeBaseSHA string `xorm:"varchar(64) null" json:"merge_base_sha" doc:"Where the branch diverged from the integration branch."`

	CommitsBehind int `xorm:"not null default 0" json:"commits_behind" doc:"How many commits the integration branch has that this branch does not. Context for the collision list, not a number to drive to zero."`

	Severity string `xorm:"varchar(20) not null" json:"severity" doc:"The worst severity across collisions: owned (a conflict is certain), affected (your assumptions may be stale), or elsewhere (informational). Only owned gates anything."`

	Collisions []*LagCollision `xorm:"json null" json:"collisions" doc:"Each path the integration branch moved that this task holds, with which task landed it."`

	ComputedAt time.Time `xorm:"not null" json:"computed_at" doc:"When Marshal last recomputed this."`

	Created time.Time `xorm:"created not null" json:"created" readOnly:"true"`
	Updated time.Time `xorm:"updated not null" json:"updated" readOnly:"true"`

	web.CRUDable    `xorm:"-" json:"-"`
	web.Permissions `xorm:"-" json:"-"`
}

// LagCollision is one path the integration branch moved under a claimed task.
type LagCollision struct {
	Path     string `json:"path" doc:"The canonical path, as the task claims it."`
	Severity string `json:"severity" doc:"owned when the path is in paths_owned, affected when only in paths_affected, elsewhere otherwise."`

	LandedByTaskID     int64  `json:"landed_by_task_id,omitempty" doc:"The task whose merge landed this change, resolved from the landing commit's Refs: trailer. Absent for a hand-pushed commit that carries no trailer — the sha is still authoritative."`
	LandedByIdentifier string `json:"landed_by_identifier,omitempty" doc:"That task's identifier, e.g. \"#43\"."`
	LandedInSHA        string `json:"landed_in_sha" doc:"The commit on the integration branch that last touched this path."`

	LandedAt time.Time `json:"landed_at" doc:"When that commit was authored."`
}

func (*TaskLag) TableName() string {
	return "task_lags"
}

// CanRead follows the task: anyone who can read the task can read its lag.
func (tl *TaskLag) CanRead(s *xorm.Session, a web.Auth) (bool, int, error) {
	t := &Task{ID: tl.TaskID}
	return t.CanRead(s, a)
}

// CanUpdate follows the task's write permission. There is no separate create:
// PUT upserts, because Marshal should not have to know whether a row exists.
func (tl *TaskLag) CanUpdate(s *xorm.Session, a web.Auth) (bool, error) {
	t := &Task{ID: tl.TaskID}
	return t.CanWrite(s, a)
}

// CanDelete follows the task's write permission.
func (tl *TaskLag) CanDelete(s *xorm.Session, a web.Auth) (bool, error) {
	t := &Task{ID: tl.TaskID}
	return t.CanWrite(s, a)
}

// MaxLagSeverity returns the worst of the given severities, or "" for none.
func MaxLagSeverity(collisions []*LagCollision) string {
	worst := ""
	for _, c := range collisions {
		if c == nil {
			continue
		}
		if lagSeverityRank[c.Severity] > lagSeverityRank[worst] {
			worst = c.Severity
		}
	}
	return worst
}

// Blocking reports whether this lag should stop the task moving on. Only
// `owned` does. `affected` collisions are common, usually harmless, and gating
// on them would train everyone to pass --force reflexively, which would then
// also defeat the gate on `owned`.
func (tl *TaskLag) Blocking() bool {
	return tl != nil && tl.Severity == LagSeverityOwned
}

// ReadOne loads the lag by task. A task with none is not an error: the zero
// record is returned so a client can always render the section.
func (tl *TaskLag) ReadOne(s *xorm.Session, _ web.Auth) error {
	existing, err := getTaskLag(s, tl.TaskID)
	if err != nil {
		return err
	}
	if existing == nil {
		tl.ID = 0
		tl.Collisions = []*LagCollision{}
		return nil
	}
	*tl = *existing
	if tl.Collisions == nil {
		tl.Collisions = []*LagCollision{}
	}
	return nil
}

// Update writes the lag, creating the row if the task has none. The severity
// is always recomputed from the collisions rather than trusted from the body:
// it is what gates, and a caller that could set it independently could gate on
// a claim the collision list does not support.
func (tl *TaskLag) Update(s *xorm.Session, _ web.Auth) error {
	if tl.Collisions == nil {
		tl.Collisions = []*LagCollision{}
	}
	for _, c := range tl.Collisions {
		if c == nil {
			continue
		}
		norm, err := NormalizeScopePath(c.Path)
		if err != nil {
			return err
		}
		c.Path = norm
		if lagSeverityRank[c.Severity] == 0 {
			return ErrInvalidLagSeverity{Severity: c.Severity}
		}
	}
	tl.Severity = MaxLagSeverity(tl.Collisions)
	if tl.Severity == "" {
		// Behind, but in nothing this task holds. That is a fact worth
		// storing — it is what makes "no collisions" different from "never
		// computed" — and it gates nothing.
		tl.Severity = LagSeverityElsewhere
	}
	if tl.ComputedAt.IsZero() {
		tl.ComputedAt = time.Now().UTC()
	}

	existing, err := getTaskLag(s, tl.TaskID)
	if err != nil {
		return err
	}
	if existing == nil {
		tl.ID = 0
		_, err := s.Insert(tl)
		return err
	}
	tl.ID = existing.ID
	tl.Created = existing.Created
	_, err = s.ID(existing.ID).
		Cols("branch", "base", "base_sha", "merge_base_sha", "commits_behind", "severity", "collisions", "computed_at").
		Update(tl)
	return err
}

// Delete removes the record. Marshal deletes it when a branch catches up, so
// "no row" means "not behind" and a stale row never outlives the lag it
// describes.
func (tl *TaskLag) Delete(s *xorm.Session, _ web.Auth) error {
	_, err := s.Where("task_id = ?", tl.TaskID).Delete(&TaskLag{})
	return err
}

func getTaskLag(s *xorm.Session, taskID int64) (*TaskLag, error) {
	lag := &TaskLag{}
	has, err := s.Where("task_id = ?", taskID).Get(lag)
	if err != nil || !has {
		return nil, err
	}
	return lag, nil
}

func getTaskLagsForTasks(s *xorm.Session, taskIDs []int64) (map[int64]*TaskLag, error) {
	out := map[int64]*TaskLag{}
	if len(taskIDs) == 0 {
		return out, nil
	}
	lags := []*TaskLag{}
	if err := s.In("task_id", taskIDs).Find(&lags); err != nil {
		return nil, err
	}
	for _, l := range lags {
		if l.Collisions == nil {
			l.Collisions = []*LagCollision{}
		}
		out[l.TaskID] = l
	}
	return out, nil
}
