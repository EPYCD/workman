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

package migration

import (
	"time"

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

// Mirrors models.TaskLag: how far a claimed task's branch has fallen behind
// the integration branch, scoped to what that task claims. Marshal computes it
// — it is the only component with the repository — and writes it here so lag
// is first-class rather than a label an agent has to be told to read.
type taskLags20260905130000 struct {
	ID     int64 `xorm:"bigint autoincr not null unique pk"`
	TaskID int64 `xorm:"bigint not null unique index"`

	Branch       string `xorm:"varchar(250) not null"`
	Base         string `xorm:"varchar(250) not null"`
	BaseSHA      string `xorm:"varchar(64) null"`
	MergeBaseSHA string `xorm:"varchar(64) null"`

	CommitsBehind int    `xorm:"not null default 0"`
	Severity      string `xorm:"varchar(20) not null"`
	Collisions    string `xorm:"json null"`

	ComputedAt time.Time `xorm:"not null"`
	Created    time.Time `xorm:"created not null"`
	Updated    time.Time `xorm:"updated not null"`
}

func (taskLags20260905130000) TableName() string {
	return "task_lags"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260905130000",
		Description: "Add task_lags: how far a claimed branch is behind the integration branch, in the files the task holds",
		Migrate: func(tx *xorm.Engine) error {
			return tx.Sync2(taskLags20260905130000{})
		},
		Rollback: func(tx *xorm.Engine) error {
			return tx.DropTables(taskLags20260905130000{})
		},
	})
}
