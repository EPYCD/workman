import {keepPreviousData, queryOptions, useMutation, type QueryClient} from '@tanstack/vue-query'

import {
	projectsCount,
	projectsDeletePermanently,
	projectsRestore,
	projectsTrashCount,
	projectsTrashEmpty,
	projectsTrashList,
	tasksDeletePermanently,
	tasksRestore,
	tasksTrashCount,
	tasksTrashEmpty,
	tasksTrashList,
	type ProjectCount,
	type TrashCount,
	type TrashedProject,
	type TrashedSubProject,
	type TrashedTask,
	type User,
} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {queryClient} from '@/client/queryClient'
import {i18n} from '@/i18n'
import {error, success} from '@/message'
import {objectToCamelCase} from '@/helpers/case'
import {notifyTaskRestored} from '@/helpers/taskRestored'
import TaskModel from '@/models/task'
import TaskService from '@/services/task'
import type {ITask} from '@/modelTypes/ITask'
import {useKanbanStore} from '@/stores/kanban'
import {useProjectStore} from '@/stores/projects'

export {
	projectInTrashFromError,
	taskInTrashFromError,
	type ProjectInTrash,
	type TaskInTrash,
} from './trashErrors'

// Upstream keeps the trash in its vue-query task cache. Workman's task data lives in the
// pinia stores, so only the trash lists and counts are queries here; restoring syncs the
// kanban and project stores directly.

export const trashKeys = {
	all: ['trash'] as const,
	tasks: ['trash', 'tasks'] as const,
	taskList: (page: number) => ['trash', 'tasks', page] as const,
	projects: ['trash', 'projects'] as const,
	projectList: (page: number) => ['trash', 'projects', page] as const,
	taskCount: ['trash', 'count', 'tasks'] as const,
	projectCount: ['trash', 'count', 'projects'] as const,
	projectContents: (id: number) => ['trash', 'project-contents', id] as const,
}

// Matches the server's hard-coded retention.
export const TRASH_RETENTION_DAYS = 30

export type Paginated<T> = {
	items: T[],
	page: number,
	total: number,
	total_pages: number,
}

export type EmptyTrashInput = {
	includeOthers: boolean
}

type Trashed = {
	id: number
	deleted_at: string
	deleted_by?: User
}

export type TrashedTaskItem = Trashed & {
	// The fork model, for the existing read-only task row
	task: ITask
	title: string
	can_delete_permanently: boolean
}

export type TrashedProjectItem = Trashed & {
	title: string
	hex_color: string
	trashed_sub_projects: TrashedSubProject[]
}

export function trashDaysLeft(deletedAt: string | Date, now = new Date()): number {
	const purgeAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
	return Math.max(0, Math.ceil((purgeAt - now.getTime()) / (24 * 60 * 60 * 1000)))
}

// Placeholder data still describes the previous page, so it must not move the page.
export function clampPage(page: number, result: {
	data: Pick<Paginated<unknown>, 'total_pages'> | undefined,
	isPlaceholderData: boolean,
}): number {
	if (!result.data || result.isPlaceholderData) return page
	return Math.min(page, Math.max(result.data.total_pages, 1))
}

function toPaginated<R, T>(data: {items?: R[] | null, page?: number, total?: number, total_pages?: number}, page: number, map: (raw: R) => T): Paginated<T> {
	return {
		items: (data.items ?? []).map(map),
		page: data.page ?? page,
		total: data.total ?? 0,
		total_pages: data.total_pages ?? 0,
	}
}

export function toTrashedTaskItem(raw: TrashedTask): TrashedTaskItem {
	const task = new TaskModel(objectToCamelCase(raw as Record<string, unknown>) as Partial<ITask>)
	return {
		id: raw.id ?? 0,
		deleted_at: raw.deleted_at ?? '',
		deleted_by: raw.deleted_by ?? undefined,
		task,
		title: raw.title ?? '',
		can_delete_permanently: raw.can_delete_permanently ?? false,
	}
}

// The API lists them shallowest first; show each below its parent instead.
export function orderTrashedSubProjects(projectId: number, subProjects: TrashedSubProject[]): TrashedSubProject[] {
	const children = new Map<number, TrashedSubProject[]>()
	for (const sub of subProjects) {
		const siblings = children.get(sub.parent_project_id ?? 0) ?? []
		siblings.push(sub)
		children.set(sub.parent_project_id ?? 0, siblings)
	}
	const ordered: TrashedSubProject[] = []
	const visit = (parentId: number) => {
		for (const sub of children.get(parentId) ?? []) {
			ordered.push(sub)
			visit(sub.id ?? 0)
		}
	}
	visit(projectId)
	return ordered
}

export function toTrashedProjectItem(raw: TrashedProject): TrashedProjectItem {
	const id = raw.id ?? 0
	return {
		id,
		deleted_at: raw.deleted_at ?? '',
		deleted_by: raw.deleted_by ?? undefined,
		title: raw.title ?? '',
		hex_color: raw.hex_color ?? '',
		trashed_sub_projects: orderTrashedSubProjects(id, raw.trashed_sub_projects ?? []),
	}
}

export function trashedTasksQuery(page: number) {
	return queryOptions({
		queryKey: trashKeys.taskList(page),
		queryFn: async ({signal}): Promise<Paginated<TrashedTaskItem>> => {
			const {data} = await tasksTrashList({query: {page}, signal})
			return toPaginated(data, page, toTrashedTaskItem)
		},
		placeholderData: keepPreviousData,
		staleTime: 0,
	})
}

export function trashedProjectsQuery(page: number) {
	return queryOptions({
		queryKey: trashKeys.projectList(page),
		queryFn: async ({signal}): Promise<Paginated<TrashedProjectItem>> => {
			const {data} = await projectsTrashList({query: {page}, signal})
			return toPaginated(data, page, toTrashedProjectItem)
		},
		placeholderData: keepPreviousData,
		staleTime: 0,
	})
}

export function taskTrashCountQuery() {
	return queryOptions({
		queryKey: trashKeys.taskCount,
		queryFn: async ({signal}): Promise<TrashCount> => (await tasksTrashCount({signal})).data,
		staleTime: 0,
	})
}

export function projectTrashCountQuery() {
	return queryOptions({
		queryKey: trashKeys.projectCount,
		queryFn: async ({signal}): Promise<TrashCount> => (await projectsTrashCount({signal})).data,
		staleTime: 0,
	})
}

// What deleting a project moves to the trash, for the delete dialog.
export function projectContentsCountQuery(id: number) {
	return queryOptions({
		queryKey: trashKeys.projectContents(id),
		queryFn: async ({signal}): Promise<ProjectCount> => (await projectsCount({path: {id}, signal})).data,
		staleTime: 0,
		retry: false,
	})
}

// Awaited by the mutations, so a removed row is gone before focus moves on.
function invalidateTrash(client: QueryClient) {
	return client.invalidateQueries({queryKey: trashKeys.all})
}

// The board shows one view at a time; put the card back if its bucket is on it.
export async function syncRestoredTask(id: number) {
	const kanbanStore = useKanbanStore()
	if (kanbanStore.buckets.length === 0) {
		return
	}
	const task = await new TaskService().get({id} as ITask, {expand: ['buckets']})
	if (kanbanStore.getTaskById(task.id).task) {
		return
	}
	const boardBuckets = new Set(kanbanStore.buckets.map(bucket => bucket.id))
	const bucket = (task.buckets ?? []).find(b => boardBuckets.has(b.id))
	if (!bucket) {
		return
	}
	kanbanStore.addTaskToBucket({...task, bucketId: bucket.id})
}

export async function restoreTask(id: number) {
	await tasksRestore({path: {task: id}})
	notifyTaskRestored(id)
	try {
		await syncRestoredTask(id)
	} catch {
		// The restore worked; the board refreshes the card the next time it loads.
	}
}

// A restored project brings its sub-projects back, so reload the sidebar tree.
export async function restoreProject(id: number) {
	await projectsRestore({path: {id}})
	await useProjectStore().loadAllProjects()
}

// Undo runs from a toast after the view navigated away, so not through a component's mutation.
async function undoFromToast(restore: () => Promise<void>, message: string) {
	try {
		await restore()
	} catch (cause) {
		error(cause)
		return
	}
	success({message})
	await invalidateTrash(queryClient)
}

export function undoTaskDelete(id: number) {
	return undoFromToast(() => restoreTask(id), i18n.global.t('trash.restoreSuccess'))
}

export function undoProjectDelete(id: number) {
	return undoFromToast(() => restoreProject(id), i18n.global.t('trash.restoreProjectSuccess'))
}

export function restoreTaskMutationOptions() {
	return contextMutationOptions({
		mutationFn: (id: number) => restoreTask(id),
		onSettled: (_id, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.restoreSuccess'),
	})
}

export function deleteTaskPermanentlyMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (id: number) => { await tasksDeletePermanently({path: {task: id}}) },
		onSettled: (_id, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.deleteForeverSuccess'),
	})
}

export function emptyTaskTrashMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({includeOthers}: EmptyTrashInput) => {
			await tasksTrashEmpty({query: {include_others: includeOthers}})
		},
		onSettled: (_input, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.emptySuccess'),
	})
}

export function restoreProjectMutationOptions() {
	return contextMutationOptions({
		mutationFn: (id: number) => restoreProject(id),
		onSettled: (_id, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.restoreProjectSuccess'),
	})
}

export function deleteProjectPermanentlyMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (id: number) => { await projectsDeletePermanently({path: {id}}) },
		onSettled: (_id, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.deleteProjectForeverSuccess'),
	})
}

export function emptyProjectTrashMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({includeOthers}: EmptyTrashInput) => {
			await projectsTrashEmpty({query: {include_others: includeOthers}})
		},
		onSettled: (_input, client) => invalidateTrash(client),
		successMessage: () => i18n.global.t('trash.emptySuccess'),
	})
}

export function useRestoreTaskMutation() {
	return useMutation(restoreTaskMutationOptions())
}

export function useDeleteTaskPermanentlyMutation() {
	return useMutation(deleteTaskPermanentlyMutationOptions())
}

export function useEmptyTaskTrashMutation() {
	return useMutation(emptyTaskTrashMutationOptions())
}

export function useRestoreProjectMutation() {
	return useMutation(restoreProjectMutationOptions())
}

export function useDeleteProjectPermanentlyMutation() {
	return useMutation(deleteProjectPermanentlyMutationOptions())
}

export function useEmptyProjectTrashMutation() {
	return useMutation(emptyProjectTrashMutationOptions())
}
