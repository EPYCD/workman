// No query module imports: trash.ts and the views both need these.
import type {User} from '@/client/generated'

// Upstream uses 4040, which Workman's Marshal already owns (ErrCodeTaskDoneBySubmitter).
export const ERROR_CODE_TASK_IS_IN_TRASH = 4052
export const ERROR_CODE_PROJECT_IS_IN_TRASH = 3018

export type TaskInTrash = {
	id: number
	project_id: number
	deleted_at: string
	deleted_by?: User
	can_restore: boolean
}

export type ProjectInTrash = {
	id: number
	deleted_at: string
	deleted_by?: User
	can_restore: boolean
	// The trashed ancestor that has to be restored instead
	trashed_root_id?: number
	can_restore_root: boolean
}

type ErrorBody = {code?: unknown, details?: unknown}

// v1 services reject with an axios error (body under response.data); the v2 client rejects with the body itself.
export function apiErrorBody(cause: unknown): ErrorBody | null {
	if (!cause || typeof cause !== 'object') return null
	const data = (cause as {response?: {data?: unknown}}).response?.data
	const body = data ?? cause
	return body && typeof body === 'object' ? body as ErrorBody : null
}

export function apiErrorStatus(cause: unknown): number | null {
	if (!cause || typeof cause !== 'object') return null
	const status = (cause as {response?: {status?: unknown}}).response?.status
		?? (cause as {status?: unknown}).status
	return typeof status === 'number' ? status : null
}

function trashDetailsFromError(cause: unknown, errorCode: number): unknown {
	const body = apiErrorBody(cause)
	if (body?.code !== errorCode) return null
	return body.details ?? null
}

export function taskInTrashFromError(cause: unknown): TaskInTrash | null {
	return trashDetailsFromError(cause, ERROR_CODE_TASK_IS_IN_TRASH) as TaskInTrash | null
}

export function projectInTrashFromError(cause: unknown): ProjectInTrash | null {
	return trashDetailsFromError(cause, ERROR_CODE_PROJECT_IS_IN_TRASH) as ProjectInTrash | null
}

export function isInTrashError(cause: unknown): boolean {
	return taskInTrashFromError(cause) !== null || projectInTrashFromError(cause) !== null
}
