import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const sdk = vi.hoisted(() => ({
	tasksRestore: vi.fn(),
	projectsRestore: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)

// The base store needs a component setup (useI18n, useRoute); the real kanban store is under test.
vi.mock('@/stores/base', () => ({
	useBaseStore: () => ({}),
}))

const taskService = vi.hoisted(() => ({get: vi.fn()}))
vi.mock('@/services/task', () => ({
	default: class {
		get = taskService.get
	},
}))

import {
	clampPage,
	orderTrashedSubProjects,
	restoreProject,
	restoreTask,
	syncRestoredTask,
	toTrashedTaskItem,
	trashDaysLeft,
} from './trash'
import {lastRestoredTask} from '@/helpers/taskRestored'
import {useKanbanStore} from '@/stores/kanban'
import {useProjectStore} from '@/stores/projects'
import TaskModel from '@/models/task'
import type {IBucket} from '@/modelTypes/IBucket'

function bucket(id: number, taskIds: number[] = []): IBucket {
	return {id, title: `Bucket ${id}`, count: taskIds.length, tasks: taskIds.map(taskId => new TaskModel({id: taskId}))} as unknown as IBucket
}

describe('trash helpers', () => {
	it('counts the days left before the purge', () => {
		const now = new Date('2026-01-31T00:00:00Z')
		expect(trashDaysLeft('2026-01-31T00:00:00Z', now)).toBe(30)
		expect(trashDaysLeft('2026-01-01T12:00:00Z', now)).toBe(1)
		expect(trashDaysLeft('2025-12-01T00:00:00Z', now)).toBe(0)
	})

	it('lists sub-projects below their parents', () => {
		const ordered = orderTrashedSubProjects(1, [
			{id: 2, parent_project_id: 1, depth: 1, title: 'a'},
			{id: 3, parent_project_id: 1, depth: 1, title: 'b'},
			{id: 4, parent_project_id: 2, depth: 2, title: 'a.1'},
		])
		expect(ordered.map(sub => sub.id)).toEqual([2, 4, 3])
	})

	it('keeps the page while placeholder data still describes the old one', () => {
		expect(clampPage(3, {data: {total_pages: 2}, isPlaceholderData: false})).toBe(2)
		expect(clampPage(3, {data: {total_pages: 2}, isPlaceholderData: true})).toBe(3)
		expect(clampPage(3, {data: {total_pages: 0}, isPlaceholderData: false})).toBe(1)
	})

	it('turns an API task into the fork model for the read-only row', () => {
		const item = toTrashedTaskItem({
			id: 5,
			title: 'Gone',
			project_id: 2,
			deleted_at: '2026-01-01T00:00:00Z',
			can_delete_permanently: true,
		})
		expect(item.task).toBeInstanceOf(TaskModel)
		expect(item.task.projectId).toBe(2)
		expect(item.title).toBe('Gone')
		expect(item.can_delete_permanently).toBe(true)
	})
})

describe('restoring into the fork stores', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		sdk.tasksRestore.mockReset().mockResolvedValue({data: {}})
		sdk.projectsRestore.mockReset().mockResolvedValue({data: {}})
		taskService.get.mockReset()
	})

	it('puts the card back into the bucket shown on the board', async () => {
		const kanban = useKanbanStore()
		kanban.setBuckets([bucket(10, [1]), bucket(11)])
		taskService.get.mockResolvedValue(new TaskModel({id: 7, buckets: [{id: 99}, {id: 11}]} as never))

		await syncRestoredTask(7)

		expect(kanban.getBucketById(11)?.tasks.map(task => task.id)).toEqual([7])
		expect(kanban.getBucketById(11)?.count).toBe(1)
	})

	it('leaves the board alone when the task is on another view or already shown', async () => {
		const kanban = useKanbanStore()
		kanban.setBuckets([bucket(10, [7])])
		taskService.get.mockResolvedValue(new TaskModel({id: 7, buckets: [{id: 10}]} as never))
		await syncRestoredTask(7)
		expect(kanban.getBucketById(10)?.tasks).toHaveLength(1)

		taskService.get.mockResolvedValue(new TaskModel({id: 8, buckets: [{id: 99}]} as never))
		await syncRestoredTask(8)
		expect(kanban.getBucketById(10)?.tasks).toHaveLength(1)
	})

	it('does not load the task when no board is open', async () => {
		await syncRestoredTask(7)
		expect(taskService.get).not.toHaveBeenCalled()
	})

	it('still counts as restored when refreshing the board fails', async () => {
		useKanbanStore().setBuckets([bucket(10)])
		taskService.get.mockRejectedValue(new Error('offline'))

		await expect(restoreTask(7)).resolves.toBeUndefined()
		expect(sdk.tasksRestore).toHaveBeenCalledWith({path: {task: 7}})
	})

	it('tells open task lists to reload', async () => {
		await restoreTask(9)
		expect(lastRestoredTask.value).toEqual({id: 9})
	})

	it('reloads the project tree after restoring a project', async () => {
		const projects = useProjectStore()
		const loadAll = vi.spyOn(projects, 'loadAllProjects').mockResolvedValue(undefined as never)

		await restoreProject(3)

		expect(sdk.projectsRestore).toHaveBeenCalledWith({path: {id: 3}})
		expect(loadAll).toHaveBeenCalledOnce()
	})
})
