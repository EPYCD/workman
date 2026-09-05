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

package apiv2

import (
	"context"
	"net/http"

	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/web/handler"

	"github.com/danielgtaylor/huma/v2"
)

// RegisterTaskLagRoutes wires a task's branch lag onto the Huma API. Like the
// scope, it is a 1:1 sub-resource keyed by the task, so there is no create:
// PUT upserts. Marshal is the only writer — it is the only component holding
// the git repository — and everything else reads.
func RegisterTaskLagRoutes(api huma.API) {
	tags := []string{"tasks"}

	Register(api, huma.Operation{
		OperationID: "tasks-lag-read",
		Summary:     "Get a task's branch lag",
		Description: "Returns how far the task's branch has fallen behind the integration branch, in the files the task holds. " +
			"A task with no lag returns an empty record rather than 404. Severity is owned when the integration branch moved inside paths_owned (a textual conflict is certain), affected when it moved inside paths_affected (no conflict, but the code you depend on changed), and elsewhere when it moved outside the task's scope entirely. " +
			"Only owned gates anything. Requires read access to the task.",
		Method: http.MethodGet,
		Path:   "/tasks/{projecttask}/lag",
		Tags:   tags,
	}, taskLagRead)

	Register(api, huma.Operation{
		OperationID: "tasks-lag-update",
		Summary:     "Record a task's branch lag",
		Description: "Replaces the task's lag record, creating it if none exists. Written by Marshal on every poll; there is no reason for anything else to call it. " +
			"Severity is derived from the collisions rather than taken from the body, since it is the field that gates. Every collision path is normalised like a scope path. Requires write access to the task.",
		Method: http.MethodPut,
		Path:   "/tasks/{projecttask}/lag",
		Tags:   tags,
	}, taskLagUpdate)

	Register(api, huma.Operation{
		OperationID: "tasks-lag-delete",
		Summary:     "Clear a task's branch lag",
		Description: "Removes the record. Marshal calls this when a branch catches up, so an absent record means \"not behind\" and a stale one never outlives the lag it describes. Requires write access to the task.",
		Method:      http.MethodDelete,
		Path:        "/tasks/{projecttask}/lag",
		Tags:        tags,
	}, taskLagDelete)
}

func init() { AddRouteRegistrar(RegisterTaskLagRoutes) }

func taskLagRead(ctx context.Context, in *struct {
	TaskID int64 `path:"projecttask" doc:"The numeric id of the task."`
}) (*singleBody[models.TaskLag], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	lag := &models.TaskLag{TaskID: in.TaskID}
	if _, err := handler.DoReadOne(ctx, lag, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &singleBody[models.TaskLag]{Body: lag}, nil
}

func taskLagUpdate(ctx context.Context, in *struct {
	TaskID int64 `path:"projecttask" doc:"The numeric id of the task."`
	Body   models.TaskLag
}) (*singleBody[models.TaskLag], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	lag := &in.Body
	lag.TaskID = in.TaskID // URL wins over body
	if err := handler.DoUpdate(ctx, lag, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &singleBody[models.TaskLag]{Body: lag}, nil
}

func taskLagDelete(ctx context.Context, in *struct {
	TaskID int64 `path:"projecttask" doc:"The numeric id of the task."`
}) (*emptyBody, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	lag := &models.TaskLag{TaskID: in.TaskID}
	if err := handler.DoDelete(ctx, lag, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &emptyBody{}, nil
}
