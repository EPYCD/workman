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

// Mirrors the Project model. The webhook URL is deliberately not here: it is a
// credential and stays in the relay's environment.
type projectsDiscordRelay20260904180000 struct {
	DiscordUsername  string `xorm:"varchar(80) null"`
	DiscordAvatarURL string `xorm:"text null"`
	DiscordEvents    string `xorm:"text null"`
}

func (projectsDiscordRelay20260904180000) TableName() string {
	return "projects"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260904180000",
		Description: "Add the Discord relay's presentation settings to projects: username, avatar and event filter",
		Migrate: func(tx *xorm.Engine) error {
			return partialSync(tx, projectsDiscordRelay20260904180000{})
		},
		Rollback: func(tx *xorm.Engine) error {
			for _, col := range []string{"discord_username", "discord_avatar_url", "discord_events"} {
				if err := dropTableColum(tx, "projects", col); err != nil {
					return err
				}
			}
			return nil
		},
	})
}
