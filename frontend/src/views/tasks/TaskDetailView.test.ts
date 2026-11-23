import {createPinia, setActivePinia} from 'pinia'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, shallowMount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'

import TaskModel from '@/models/task'
import type {ITask} from '@/modelTypes/ITask'

// The fork loads through TaskService and saves through the task store, so both are faked here.
const api = vi.hoisted(() => ({
	get: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	undoTaskDelete: vi.fn(),
}))
vi.mock('@/services/task', () => ({
	default: class {
		loading = false
		get = api.get
	},
}))
vi.mock('@/stores/tasks', () => ({
	useTaskStore: () => ({
		update: api.update,
		delete: api.delete,
		markTaskAsRead: vi.fn(async () => {}),
	}),
}))
const message = vi.hoisted(() => ({error: vi.fn(), success: vi.fn()}))
vi.mock('@/message', () => message)
vi.mock('@/client/queries/trash', async importOriginal => ({
	...await importOriginal<typeof import('@/client/queries/trash')>(),
	undoTaskDelete: api.undoTaskDelete,
}))
vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string, named?: Record<string, unknown>) => named ? `${key}:${JSON.stringify(named)}` : key}),
}))

import PercentDoneSelect from '@/components/tasks/partials/PercentDoneSelect.vue'
import RelatedTasks from '@/components/tasks/partials/RelatedTasks.vue'
import TaskInTrashNotice from '@/components/tasks/partials/TaskInTrashNotice.vue'
import ProjectInTrashNotice from '@/components/project/ProjectInTrashNotice.vue'
import {SHORTCUTS} from '@/constants/shortcuts'
import TaskDetailView from './TaskDetailView.vue'

// TaskService rejects like axios: the API error body sits under response.data.
function apiError(status: number, data: Record<string, unknown>) {
	return Object.assign(new Error('Request failed'), {response: {status, data}})
}

enableAutoUnmount(afterEach)

function serverTask(overrides: Record<string, unknown> = {}): ITask {
	return new TaskModel({
		id: 1,
		title: 'Task 1',
		description: '',
		done: false,
		projectId: 1,
		percentDone: 0.25,
		dueDate: new Date('2024-01-01T10:00:00Z'),
		labels: [{id: 1, title: 'First'}],
		assignees: [],
		maxPermission: 2,
		...overrides,
	} as Partial<ITask>)
}

function serve(overrides: Record<string, unknown> = {}) {
	api.get.mockImplementation(async () => serverTask(overrides))
	api.update.mockImplementation(async (task: ITask) => ({...serverTask(overrides), percentDone: task.percentDone}))
}

async function mountDetail(stubs: Record<string, unknown> = {}) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{path: '/', component: {render: () => null}},
			{path: '/tasks/:id', name: 'task.detail', component: {render: () => null}},
			{path: '/projects/:projectId', name: 'project.index', component: {render: () => null}},
			{path: '/:pathMatch(.*)*', name: 'not-found', component: {render: () => null}},
		],
	})
	await router.push('/tasks/1')
	const wrapper = shallowMount(TaskDetailView, {
		attachTo: document.body,
		props: {taskId: 1},
		global: {
			plugins: [router],
			mocks: {$t: (key: string) => key},
			stubs: {Icon: true, XButton: true, Modal: true, TaskPropertyRow: false, ...stubs},
			directives: {tooltip: () => {}, cy: () => {}, shortcut: () => {}},
		},
	})
	await flushPromises()
	return wrapper
}

describe('TaskDetailView property sidebar', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		api.get.mockReset()
		api.update.mockReset()
	})

	const renderButtons = {BaseButton: {template: '<button><slot/></button>'}}

	it('keeps a section the user opened visible after saving another field', async () => {
		serve()
		const wrapper = await mountDetail()
		expect(wrapper.findComponent(RelatedTasks).exists()).toBe(false)

		document.body.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyR', key: 'r', bubbles: true}))
		await flushPromises()
		expect(wrapper.findComponent(RelatedTasks).exists()).toBe(true)

		wrapper.findComponent(PercentDoneSelect).vm.$emit('update:modelValue', 0.9)
		await flushPromises()

		expect(api.update).toHaveBeenCalledOnce()
		expect(wrapper.findComponent(RelatedTasks).exists()).toBe(true)
	})

	it('shows every property row to users who can edit the task', async () => {
		serve({dueDate: null, labels: []})
		const wrapper = await mountDetail()

		expect(wrapper.find('.property-due-date').exists()).toBe(true)
		expect(wrapper.find('.property-labels').exists()).toBe(true)
		expect(wrapper.find('.property-due-date').classes()).not.toContain('is-set')
	})

	it('only shows rows with a value to read-only users', async () => {
		serve({maxPermission: 0, labels: []})
		const wrapper = await mountDetail()

		expect(wrapper.find('.property-due-date').classes()).toContain('is-set')
		expect(wrapper.find('.property-percent-done').exists()).toBe(true)
		expect(wrapper.find('.property-labels').exists()).toBe(false)
		expect(wrapper.find('.property-priority').exists()).toBe(false)
		expect(wrapper.find('.sidebar-toolbar').exists()).toBe(false)
	})

	it.each([
		[{repeatAfter: 0, repeatMode: 0}, 'misc.notSet'],
		[{repeatAfter: 172800, repeatMode: 0}, 'task.repeat.summary.days:{"count":2}'],
		[{repeatAfter: 0, repeatMode: 1}, 'task.repeat.monthly'],
		[{repeatAfter: 604800, repeatMode: 2}, 'task.repeat.summary.fromCurrentDate:{"interval":"task.repeat.summary.weeks:{\\"count\\":1}"}'],
		[{repeatAfter: 0, repeatMode: 2}, 'task.repeat.fromCurrentDate'],
		// The fork model splits 30 days into months; the summary still counts days.
		[{repeatAfter: 2592000, repeatMode: 0}, 'task.repeat.summary.days:{"count":30}'],
	])('summarizes repeat settings %o as %s', async (repeat, summary) => {
		serve(repeat)
		const wrapper = await mountDetail(renderButtons)

		expect(wrapper.find('.property-repeat .property-value-button').text()).toBe(summary)
	})
})

describe('TaskDetailView trash', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		api.get.mockReset()
		api.update.mockReset()
		api.delete.mockReset()
		api.undoTaskDelete.mockReset()
		message.success.mockReset()
	})

	const taskInTrash = {
		id: 1,
		project_id: 1,
		deleted_at: '2026-01-01T00:00:00Z',
		can_restore: true,
	}

	it('shows the trash notice for a trashed task instead of routing away', async () => {
		api.get.mockRejectedValue(apiError(404, {code: 4052, details: taskInTrash}))
		const wrapper = await mountDetail()

		expect(wrapper.findComponent(TaskInTrashNotice).props('inTrash')).toEqual(taskInTrash)
		expect(wrapper.find('.property-list').exists()).toBe(false)
		expect(wrapper.vm.$router.currentRoute.value.name).toBe('task.detail')
	})

	it('shows the project notice when the task sits in a trashed project', async () => {
		const projectInTrash = {id: 3, deleted_at: '2026-01-01T00:00:00Z', can_restore: false, trashed_root_id: 2, can_restore_root: true}
		api.get.mockRejectedValue(apiError(404, {code: 3018, details: projectInTrash}))
		const wrapper = await mountDetail()

		expect(wrapper.findComponent(ProjectInTrashNotice).props('inTrash')).toEqual(projectInTrash)
		expect(wrapper.findComponent(TaskInTrashNotice).exists()).toBe(false)
	})

	it('loads the task once it is restored', async () => {
		api.get.mockRejectedValueOnce(apiError(404, {code: 4052, details: taskInTrash}))
		serve()
		const wrapper = await mountDetail()

		wrapper.findComponent(TaskInTrashNotice).vm.$emit('restored')
		await flushPromises()

		expect(api.get).toHaveBeenCalledTimes(2)
		expect(wrapper.findComponent(TaskInTrashNotice).exists()).toBe(false)
		expect(wrapper.find('.property-list').exists()).toBe(true)
	})

	it('still routes unknown tasks to not found', async () => {
		api.get.mockRejectedValue(apiError(404, {code: 4002}))
		const wrapper = await mountDetail()

		expect(wrapper.vm.$router.currentRoute.value.name).toBe('not-found')
		expect(wrapper.findComponent(TaskInTrashNotice).exists()).toBe(false)
	})

	it('moves the task to the trash without asking and offers undo', async () => {
		serve()
		api.delete.mockResolvedValue(undefined)
		const wrapper = await mountDetail()

		document.body.dispatchEvent(new KeyboardEvent('keydown', {code: SHORTCUTS.taskDetail.delete, key: SHORTCUTS.taskDetail.delete, bubbles: true}))
		await flushPromises()

		expect(api.delete).toHaveBeenCalledOnce()
		expect(wrapper.vm.$router.currentRoute.value.name).toBe('project.index')
		expect(message.success).toHaveBeenCalledOnce()
		const [toast, actions, options] = message.success.mock.calls[0]!
		expect(toast).toEqual({message: 'task.detail.deleteSuccess'})
		expect(options).toEqual({takeFocus: true})
		actions[0].callback()
		expect(api.undoTaskDelete).toHaveBeenCalledWith(1)
	})
})
