import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {mount, flushPromises, type VueWrapper} from '@vue/test-utils'
import {setActivePinia, createPinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {createRouter, createMemoryHistory} from 'vue-router'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'

const sdk = vi.hoisted(() => ({
	projectsCount: vi.fn(),
}))

vi.mock('@/client/generated', () => sdk)

import ProjectSettingsDelete from '@/views/project/settings/ProjectSettingsDelete.vue'
import Modal from '@/components/misc/Modal.vue'
import Loading from '@/components/misc/Loading.vue'
import testid from '@/directives/testid'
import enMessages from '@/i18n/lang/en.json'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en: enMessages}})

async function mountModal() {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{
			path: '/projects/:projectId/settings/delete',
			name: 'project.settings.delete',
			component: ProjectSettingsDelete,
		}],
	})
	await router.push('/projects/42/settings/delete')
	await router.isReady()

	const wrapper = mount(ProjectSettingsDelete, {
		global: {
			plugins: [
				i18n,
				router,
				[VueQueryPlugin, {queryClient: new QueryClient({defaultOptions: {queries: {retry: false}}})}],
			],
			components: {Modal},
			directives: {cy: testid},
			stubs: {
				BaseButton: {template: '<a v-bind="$attrs"><slot /></a>'},
				XButton: {template: '<button type="button" v-bind="$attrs"><slot /></button>'},
				Icon: true,
			},
		},
		attachTo: document.body,
	})
	await flushPromises()
	return wrapper
}

function dialogText() {
	return document.querySelector('dialog.modal-dialog')?.textContent ?? ''
}

describe('ProjectSettingsDelete', () => {
	let wrapper: VueWrapper | undefined

	beforeEach(() => {
		setActivePinia(createPinia())
		document.body.innerHTML = ''
		sdk.projectsCount.mockReset()
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = undefined
		document.body.innerHTML = ''
	})

	it('shows the loader while the counts are pending', async () => {
		sdk.projectsCount.mockReturnValue(new Promise(() => {}))

		wrapper = await mountModal()

		expect(wrapper.findComponent(Loading).exists()).toBe(true)
		expect(dialogText()).not.toContain('Moves this project')
	})

	it('falls back to a generic notice when the counts fail', async () => {
		sdk.projectsCount.mockRejectedValue(new Error('network'))

		wrapper = await mountModal()

		expect(wrapper.findComponent(Loading).exists()).toBe(false)
		expect(dialogText()).toContain('Moves this project and everything in it to the trash.')
	})

	it('previews what moves to the trash, including sub-projects and time entries', async () => {
		sdk.projectsCount.mockResolvedValue({data: {sub_projects: 2, tasks: 5, time_entries: 3, time_entry_authors: 2}})

		wrapper = await mountModal()

		expect(sdk.projectsCount).toHaveBeenCalledWith(expect.objectContaining({path: {id: 42}}))
		expect(dialogText()).toContain('Moves this project, 2 sub-projects and 5 tasks to the trash.')
		expect(dialogText()).toContain('3 time entries from 2 people')
	})
})
