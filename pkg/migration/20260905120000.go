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
	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

// Mirrors the Project model. The board has no checkout, so it cannot tell a
// repository-root-relative scope path from one written against an app
// sub-directory — and two spellings of one file are two claims that cannot see
// each other. Marshal, which does have the checkout, publishes the
// repository's top-level entries here and the board enforces against them.
//
// Both columns are null: a project that has published nothing enforces
// nothing, so this migration changes no existing project's behaviour.
type projectsScopeRoots20260905120000 struct {
	ScopeRepoRoots  string `xorm:"text null"`
	ScopeAppRoot    string `xorm:"varchar(250) null"`
	ScopeAppEntries string `xorm:"text null"`
}

func (projectsScopeRoots20260905120000) TableName() string {
	return "projects"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260905120000",
		Description: "Add the repository's top-level entries and app root to projects, so the board can refuse a scope path relative to the wrong base",
		Migrate: func(tx *xorm.Engine) error {
			return partialSync(tx, projectsScopeRoots20260905120000{})
		},
		Rollback: func(tx *xorm.Engine) error {
			for _, col := range []string{"scope_repo_roots", "scope_app_root", "scope_app_entries"} {
				if err := dropTableColum(tx, "projects", col); err != nil {
					return err
				}
			}
			return nil
		},
	})
}
