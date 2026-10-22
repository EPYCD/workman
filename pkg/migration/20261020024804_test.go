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
	"testing"
	"time"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMigrateAPITokenPermissions20261020024804(t *testing.T) {
	x, err := db.CreateTestEngine()
	require.NoError(t, err)
	require.NoError(t, x.Sync2(&models.APIToken{}))

	renamed := &models.APIToken{
		Title:       "renamed",
		TokenSha256: "renamed20261020024804",
		TokenHash:   "renamed20261020024804",
		OwnerID:     1,
		ExpiresAt:   time.Now().Add(time.Hour),
		APIPermissions: models.APIPermissions{
			"projects":      {"read_one", "background", "background_get", "views_buckets_put", "views_buckets_tasks", "views_buckets_tasks_get"},
			"notifications": {"update"},
			"admin":         {"users_post"},
		},
	}
	untouched := &models.APIToken{
		Title:          "untouched",
		TokenSha256:    "untouched20261020024804",
		TokenHash:      "untouched20261020024804",
		OwnerID:        1,
		ExpiresAt:      time.Now().Add(time.Hour),
		APIPermissions: models.APIPermissions{"projects": {"read_one", "background_delete", "duplicate"}},
	}
	_, err = x.Insert(renamed, untouched)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, err := x.In("id", renamed.ID, untouched.ID).Delete(&models.APIToken{})
		require.NoError(t, err)
	})

	require.NoError(t, migrateAPITokenPermissions20261020024804(x))

	got := &models.APIToken{}
	_, err = x.ID(renamed.ID).Get(got)
	require.NoError(t, err)
	assert.Equal(t, models.APIPermissions{
		"projects":      {"read_one", "background", "views_buckets_create", "views_buckets_tasks_update", "views_buckets_tasks"},
		"notifications": {"update", "mark_all_as_read"},
		"admin":         {"users_create"},
	}, got.APIPermissions)

	got = &models.APIToken{}
	_, err = x.ID(untouched.ID).Get(got)
	require.NoError(t, err)
	assert.Equal(t, untouched.APIPermissions, got.APIPermissions)
}

// The grants veans minted for workman's worker, Marshal and CI bots before the rename.
func TestMigrateAPITokenPermissions20261020024804_WorkmanRoutes(t *testing.T) {
	renamed, changed := renameAPITokenPermissions20261020024804(map[string][]string{
		"projects": {"read_one", "views_buckets_put", "views_buckets_post", "views_buckets_tasks", "leases", "scope_check", "plan", "plan_get", "agents"},
		"tasks":    {"read_one", "scope", "scope_put", "scope_delete", "receipts", "receipts_post", "lag", "lag_put", "lag_delete"},
	})
	assert.True(t, changed)
	assert.Equal(t, map[string][]string{
		"projects": {"read_one", "views_buckets_create", "views_buckets_update", "views_buckets_tasks_update", "leases", "scope_check", "plan_create", "plan", "agents"},
		"tasks":    {"read_one", "scope", "scope_update", "scope_delete", "receipts", "receipts_create", "lag", "lag_update", "lag_delete"},
	}, renamed)
}
