import {beforeEach, describe, it, expect, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import PasswordReset from './PasswordReset.vue'
import Password from '@/components/input/Password.vue'
import en from '@/i18n/lang/en.json'

const {resetPassword, mockRoute} = vi.hoisted(() => ({
	resetPassword: vi.fn(),
	mockRoute: {query: {} as Record<string, string>, hash: ''},
}))

vi.mock('@/services/passwordReset', () => ({
	default: class {
		loading = false
		resetPassword = resetPassword
	},
}))

vi.mock('vue-router', () => ({
	useRoute: () => mockRoute,
}))

const i18n = createI18n({legacy: false, locale: 'en', messages: {en}})

function mountPasswordReset(errors: unknown[] = []) {
	return mount(PasswordReset, {
		global: {
			plugins: [i18n],
			stubs: {XButton: true, Password: true},
			config: {
				errorHandler(err) {
					errors.push(err)
				},
			},
		},
	})
}

describe('PasswordReset', () => {
	beforeEach(() => {
		resetPassword.mockReset()
		mockRoute.query = {userPasswordReset: 'token'}
		mockRoute.hash = ''
	})

	it('reads the token from the fragment', async () => {
		resetPassword.mockResolvedValue({message: 'ok'})
		mockRoute.query = {}
		mockRoute.hash = '#userPasswordReset=fragment-token'

		const wrapper = mountPasswordReset()
		wrapper.findComponent(Password).vm.$emit('update:modelValue', 'new-password')
		await wrapper.find('form').trigger('submit')
		await flushPromises()

		expect(resetPassword).toHaveBeenCalledWith(expect.objectContaining({newPassword: 'new-password', token: 'fragment-token'}))
	})

	it('shows the error when the request fails without a response', async () => {
		resetPassword.mockRejectedValue(Object.assign(new Error('Network Error'), {code: 'ERR_NETWORK'}))
		const errors: unknown[] = []

		const wrapper = mountPasswordReset(errors)

		wrapper.findComponent(Password).vm.$emit('update:modelValue', 'new-password')
		await wrapper.find('form').trigger('submit')
		await flushPromises()

		expect(errors).toEqual([])
		expect(wrapper.text()).toContain('Network Error')
	})
})
