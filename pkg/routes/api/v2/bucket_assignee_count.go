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

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"

	"github.com/danielgtaylor/huma/v2"
)

type bucketAssigneeCountsBody struct {
	Body Paginated[*models.BucketAssigneeCount]
}

// RegisterBucketAssigneeCountRoutes wires the per-assignee totals of a kanban
// view onto the Huma API.
func RegisterBucketAssigneeCountRoutes(api huma.API) {
	Register(api, huma.Operation{
		OperationID: "projects-views-assignee-counts",
		Summary:     "How many tasks each person holds, per bucket",
		Description: "Returns one row per bucket and assignee with the number of tasks that person holds in that bucket, counting every task in the bucket rather than the page a client has loaded. " +
			"user_id 0 is the unassigned row. A task with two assignees is counted once for each, which is how a board that groups by assignee shows it. " +
			"Not paginated; the result is one row per bucket per person. Requires read access to the project.",
		Method: http.MethodGet,
		Path:   "/projects/{project}/views/{view}/assignee-counts",
		Tags:   []string{"projects"},
	}, projectViewAssigneeCounts)
}

func init() { AddRouteRegistrar(RegisterBucketAssigneeCountRoutes) }

func projectViewAssigneeCounts(ctx context.Context, in *struct {
	ProjectID int64 `path:"project" doc:"The numeric id of the project."`
	ViewID    int64 `path:"view" doc:"The numeric id of the kanban view."`
}) (*bucketAssigneeCountsBody, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	s := db.NewSession()
	defer s.Close()

	// Non-CRUD read, so the permission check is the handler's job.
	project := &models.Project{ID: in.ProjectID}
	can, _, err := project.CanRead(s, a)
	if err != nil {
		return nil, translateDomainError(err)
	}
	if !can {
		return nil, huma.Error403Forbidden("forbidden")
	}
	view, err := models.GetProjectViewByIDAndProject(s, in.ViewID, in.ProjectID)
	if err != nil {
		return nil, translateDomainError(err)
	}
	items, err := models.GetBucketAssigneeCounts(s, view)
	if err != nil {
		return nil, translateDomainError(err)
	}
	return &bucketAssigneeCountsBody{Body: NewPaginated(items, int64(len(items)), 1, len(items))}, nil
}
