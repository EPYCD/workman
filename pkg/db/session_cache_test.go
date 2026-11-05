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

package db

import (
	"testing"

	"code.vikunja.io/api/pkg/config"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"xorm.io/xorm/schemas"
)

func TestIsWriteStatement(t *testing.T) {
	tests := map[string]bool{
		"SELECT * FROM projects": false,
		"\n  select 1":           false,
		"BEGIN TRANSACTION":      false,
		"COMMIT":                 false,
		"ROLLBACK":               false,
		"PREPARE":                false,
		"WITH RECURSIVE tree AS (SELECT 1) SELECT * FROM tree":                        false,
		"WITH t AS (SELECT created, updated, deleted FROM tasks) SELECT * FROM t":     false,
		"INSERT INTO projects (id) VALUES (1)":                                        true,
		"  update projects set title = ?":                                             true,
		"DELETE FROM users_projects":                                                  true,
		"CREATE INDEX foo ON bar (baz)":                                               true,
		"EXPLAIN ANALYZE DELETE FROM tasks":                                           true,
		"WITH moved AS (DELETE FROM a RETURNING *) INSERT INTO b SELECT * FROM moved": true,
		"WITH t AS (SELECT update_count, deleted_at FROM tasks) SELECT * FROM t":      false,
		"with t as (select 1) update tasks set done = true":                           true,
		"": true,
	}
	for sqlStr, want := range tests {
		assert.Equal(t, want, isWriteStatement(sqlStr), sqlStr)
	}
}

type isolationTestRow struct {
	ID    int64  `xorm:"autoincr not null unique pk"`
	Title string `xorm:"varchar(250)"`
}

// Upstream proves this through its row memo (Remember/Forget), which Workman does not have:
// an open transaction must see a concurrent commit on a plain re-read. Under MySQL's default
// REPEATABLE READ it would keep returning the first snapshot.
func TestSessionSeesCommittedUpdate(t *testing.T) {
	config.InitDefaultConfig()
	engine, err := CreateTestEngine()
	require.NoError(t, err)
	if Type() == schemas.SQLITE {
		t.Skip("SQLite cannot commit a concurrent writer while a reader holds its snapshot")
	}
	require.NoError(t, engine.Sync(&isolationTestRow{}))
	t.Cleanup(func() { _ = engine.DropTables(&isolationTestRow{}) })
	row := &isolationTestRow{Title: "before"}
	_, err = engine.Insert(row)
	require.NoError(t, err)

	reader := NewSession()
	defer reader.Close()
	var before isolationTestRow
	_, err = reader.ID(row.ID).Get(&before)
	require.NoError(t, err)
	require.Equal(t, "before", before.Title)

	writer := NewSession()
	defer writer.Close()
	_, err = writer.ID(row.ID).Cols("title").Update(&isolationTestRow{Title: "after"})
	require.NoError(t, err)
	require.NoError(t, writer.Commit())

	var after isolationTestRow
	has, err := reader.ID(row.ID).Get(&after)
	require.NoError(t, err)
	require.True(t, has)
	assert.Equal(t, "after", after.Title)
}
