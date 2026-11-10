import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'

import WebhookManager from './WebhookManager.vue'

// A plain checkbox, so the test drives the group logic without FancyCheckbox's markup.
const FancyCheckbox = defineComponent({
	props: {modelValue: Boolean},
	emits: ['update:modelValue'],
	setup(props, {emit, slots, attrs}) {
		return () => h('label', {class: attrs.class}, [
			h('input', {
				type: 'checkbox',
				checked: props.modelValue,
				onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked),
			}),
			slots.default?.(),
		])
	},
})

function mountManager() {
	return mount(WebhookManager, {
		props: {
			webhooks: [],
			availableEvents: ['task.created', 'task.updated', 'project.created'],
		},
		global: {
			mocks: {$t: (key: string) => key},
			stubs: {FancyCheckbox, XButton: true, Expandable: true, Modal: true, User: true},
		},
	})
}

function checked(wrapper: ReturnType<typeof mountManager>, selector: string) {
	return wrapper.findAll(`${selector} input`).map(input => (input.element as HTMLInputElement).checked)
}

describe('WebhookManager event selection', () => {
	it('groups the available events by their prefix', () => {
		const wrapper = mountManager()

		expect(wrapper.findAll('.webhook-events-group-toggle').map(group => group.text())).toEqual(['task', 'project'])
		expect(wrapper.findAll('.available-events-check')).toHaveLength(3)
	})

	it('selects a whole group, then every event', async () => {
		const wrapper = mountManager()

		await wrapper.find('.webhook-events-group-toggle input').setValue(true)
		expect(checked(wrapper, '.available-events-check')).toEqual([true, true, false])
		expect(checked(wrapper, '.webhook-events-select-all')).toEqual([false])

		await wrapper.find('.webhook-events-select-all input').setValue(true)
		expect(checked(wrapper, '.available-events-check')).toEqual([true, true, true])
		expect(checked(wrapper, '.webhook-events-group-toggle')).toEqual([true, true])
	})
})
