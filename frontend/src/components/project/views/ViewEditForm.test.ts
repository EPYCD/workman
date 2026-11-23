import {shallowMount} from '@vue/test-utils'
import {defineComponent} from 'vue'
import {describe, expect, it, vi} from 'vitest'

vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string) => key}),
}))

const FilterEditorStub = defineComponent({
	name: 'FilterEditor',
	props: {modelValue: {type: String, default: ''}},
	emits: ['update:modelValue'],
	template: '<div />',
})

import ViewEditForm from './ViewEditForm.vue'
import ProjectViewModel from '@/models/projectView'
import type {IProjectView} from '@/modelTypes/IProjectView'

function mountForm(modelValue: IProjectView = {
	id: 1,
	projectId: 1,
	title: 'List',
	viewKind: 'kanban',
	bucketConfigurationMode: 'filter',
	filter: {filter: 'labels = 1', filter_include_nulls: false},
	bucketConfiguration: [{
		title: 'Bucket',
		filter: {filter: 'labels = 1', filter_include_nulls: false},
	}],
} as IProjectView) {
	return shallowMount(ViewEditForm, {
		props: {
			modelValue,
		},
		global: {
			stubs: {FilterEditor: FilterEditorStub},
			mocks: {$t: (key: string) => key},
			directives: {focus: () => {}},
		},
	})
}

describe('ViewEditForm', () => {
	it('hands the editors the api form of the saved filters', () => {
		const wrapper = mountForm()
		expect(wrapper.findAllComponents(FilterEditorStub).map(input => input.props('modelValue')))
			.toEqual(['labels = 1', 'labels = 1'])
	})

	it('preserves model sorting when saving', async () => {
		const modelValue = new ProjectViewModel({
			id: 1,
			project_id: 1,
			title: 'List',
			view_kind: 'kanban',
			bucket_configuration_mode: 'filter',
			filter: {
				sort_by: ['done', 'id'],
				order_by: ['asc', 'desc'],
				filter: 'done = false',
				filter_include_nulls: true,
				s: '',
			},
			bucket_configuration: [{
				title: 'Bucket',
				filter: {
					sort_by: ['position'],
					order_by: ['desc'],
					filter: 'done = false',
					filter_include_nulls: false,
					s: '',
				},
			}],
		} as never)
		const wrapper = mountForm(modelValue)

		await wrapper.find('form').trigger('submit')

		const saved = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as IProjectView
		expect(saved.filter).toMatchObject({
			sort_by: ['done', 'id'],
			order_by: ['asc', 'desc'],
		})
		expect(saved.bucketConfiguration[0].filter).toMatchObject({
			sort_by: ['position'],
			order_by: ['desc'],
		})
	})
})
