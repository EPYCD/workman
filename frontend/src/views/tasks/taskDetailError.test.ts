import {describe, expect, it} from 'vitest'

import {taskLoadErrorAction} from './taskDetailError'

// The fork loads tasks through axios (body under response.data); the v2 client rejects with the body.
function axiosError(status: number, data: unknown) {
	return Object.assign(new Error('Request failed'), {response: {status, data}})
}

describe('taskLoadErrorAction', () => {
	it('keeps trashed tasks in place with their trash details', () => {
		const inTrash = {
			id: 1,
			project_id: 1,
			deleted_at: '2026-01-01T00:00:00Z',
			can_restore: true,
		}
		expect(taskLoadErrorAction(axiosError(404, {
			code: 4052,
			message: 'in trash',
			details: inTrash,
		}))).toEqual({
			action: 'inTrash',
			inTrash,
		})
	})

	it('does not mistake Marshal error 4040 for a trashed task', () => {
		expect(taskLoadErrorAction(axiosError(404, {
			code: 4040,
			details: {id: 1},
		}))).toEqual({action: 'notFound'})
	})

	it('keeps tasks in trashed projects in place with the project trash details', () => {
		const inTrash = {
			id: 3,
			deleted_at: '2026-01-01T00:00:00Z',
			can_restore: true,
			trashed_root_id: 2,
			can_restore_root: false,
		}
		expect(taskLoadErrorAction(axiosError(404, {
			code: 3018,
			message: 'project in trash',
			details: inTrash,
		}))).toEqual({
			action: 'projectInTrash',
			inTrash,
		})
	})

	it('reads v2 problem bodies too', () => {
		const inTrash = {id: 7, project_id: 1, deleted_at: '2026-01-01T00:00:00Z', can_restore: false}
		expect(taskLoadErrorAction({status: 404, code: 4052, details: inTrash}))
			.toEqual({action: 'inTrash', inTrash})
	})

	it('sends 403 and 404 to not found', () => {
		expect(taskLoadErrorAction(axiosError(403, {code: 4003}))).toEqual({action: 'notFound'})
		expect(taskLoadErrorAction(axiosError(404, {code: 4002}))).toEqual({action: 'notFound'})
		expect(taskLoadErrorAction({status: 404})).toEqual({action: 'notFound'})
	})

	it('reports everything else', () => {
		expect(taskLoadErrorAction(axiosError(500, {code: 1}))).toEqual({action: 'report'})
		expect(taskLoadErrorAction(new Error('boom'))).toEqual({action: 'report'})
	})
})
