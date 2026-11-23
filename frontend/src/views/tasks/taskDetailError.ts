import {
	apiErrorStatus,
	projectInTrashFromError,
	taskInTrashFromError,
	type ProjectInTrash,
	type TaskInTrash,
} from '@/client/queries/trashErrors'

export type TaskLoadErrorAction =
	| {action: 'inTrash', inTrash: TaskInTrash}
	| {action: 'projectInTrash', inTrash: ProjectInTrash}
	| {action: 'notFound' | 'report'}

// 403 means the task exists but is not visible to us; treat it like a 404.
export function taskLoadErrorAction(cause: unknown): TaskLoadErrorAction {
	const inTrash = taskInTrashFromError(cause)
	if (inTrash) return {action: 'inTrash', inTrash}
	const projectInTrash = projectInTrashFromError(cause)
	if (projectInTrash) return {action: 'projectInTrash', inTrash: projectInTrash}
	if ([403, 404].includes(apiErrorStatus(cause) ?? 0)) return {action: 'notFound'}
	return {action: 'report'}
}
