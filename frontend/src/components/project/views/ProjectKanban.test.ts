import {ref} from 'vue'
import {shallowMount} from '@vue/test-utils'
import {describe, expect, it, vi, beforeEach} from 'vitest'
import draggable from 'zhyswan-vuedraggable'

const updateBucket = vi.fn()

const buckets = [
	{id: 1, title: 'First', position: 100, tasks: [], count: 0, limit: 0},
	{id: 2, title: 'Second', position: 200, tasks: [], count: 0, limit: 0},
	{id: 3, title: 'Third', position: 300, tasks: [], count: 0, limit: 0},
]

vi.mock('@/stores/kanban', () => ({
	useKanbanStore: () => ({
		buckets,
		isLoading: false,
		updateBucket,
		getBucketById: (id: number) => buckets.find(b => b.id === id),
		setBucketById: vi.fn(),
		loadBucketsForProject: vi.fn(),
		loadNextTasksForBucket: vi.fn(),
	}),
}))

vi.mock('@/stores/projects', () => ({
	useProjectStore: () => ({
		projects: {
			1: {
				id: 1,
				title: 'Test',
				views: [{id: 10, viewKind: 'kanban', bucketConfigurationMode: 'manual'}],
			},
		},
		hasProjects: true,
	}),
}))

vi.mock('@/stores/base', () => ({
	useBaseStore: () => ({currentProject: {id: 1, maxPermission: 2}}),
}))

vi.mock('@/stores/tasks', () => ({
	useTaskStore: () => ({isLoading: false, setDraggedTask: vi.fn()}),
}))

vi.mock('@/stores/auth', () => ({
	useAuthStore: () => ({settings: {frontendSettings: {alwaysShowBucketTaskCount: false}}}),
}))

// workman's board links each card to Marshal, which upstream's component does
// not do — without this the component reaches for a pinia that the test never
// installs.
vi.mock('@/stores/config', () => ({
	useConfigStore: () => ({marshalUrl: ''}),
}))

// Readiness badges and agent lanes are workman-only and each open a vue-query
// query, which needs a QueryClient this test has no reason to install. Both
// call sites read only .data, so an empty result is enough.
vi.mock('@tanstack/vue-query', async (importOriginal) => ({
	...await importOriginal<typeof import('@tanstack/vue-query')>(),
	useQuery: () => ({data: ref([]), isLoading: ref(false), error: ref(null)}),
}))

vi.mock('@/services/savedFilter', () => ({
	isSavedFilter: () => false,
	useSavedFilter: () => ({filter: {value: null}}),
}))

vi.mock('@vueuse/router', () => ({
	useRouteQuery: () => ({value: undefined}),
}))

vi.mock('vue-router', () => ({
	useRouter: () => ({push: vi.fn(), currentRoute: {value: {fullPath: '/'}}}),
}))

vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string) => key}),
}))

import ProjectKanban from './ProjectKanban.vue'

function mountKanban() {
	return shallowMount(ProjectKanban, {
		props: {
			isLoadingProject: false,
			projectId: 1,
			viewId: 10,
		},
		global: {
			mocks: {$t: (key: string) => key},
			stubs: {
				ProjectWrapper: {template: '<div><slot name="default"/></div>'},
			},
		},
	})
}

function dragEndEvent(bucketId: string) {
	const item = document.createElement('li')
	item.dataset.bucketId = bucketId
	// The DOM index sortable reports does not have to be a valid bucket index
	return {item, newIndex: 42}
}

describe('ProjectKanban', () => {
	beforeEach(() => updateBucket.mockClear())

	it('saves the position of the dropped bucket', () => {
		const wrapper = mountKanban()

		wrapper.findComponent(draggable).vm.$emit('end', dragEndEvent('2'))

		expect(updateBucket).toHaveBeenCalledWith(expect.objectContaining({
			id: 2,
			position: 200,
		}))
	})

	it('does nothing when the dropped bucket is gone', () => {
		const wrapper = mountKanban()

		wrapper.findComponent(draggable).vm.$emit('end', dragEndEvent('42'))

		expect(updateBucket).not.toHaveBeenCalled()
	})
})
