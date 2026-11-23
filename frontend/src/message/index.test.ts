import {describe, it, expect, vi} from 'vitest'
import {notify} from '@kyvg/vue3-notification'

import {error, getErrorText, success} from './index'

vi.mock('@kyvg/vue3-notification', () => ({notify: vi.fn()}))

describe('success', () => {
	it('merges duplicate toasts without actions', () => {
		success({message: 'Saved'})
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ignoreDuplicates: true}))
	})

	it('never merges toasts with actions, so each keeps its own undo', () => {
		success({message: 'Deleted'}, [{
			title: 'Undo',
			callback: () => {},
		}])
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ignoreDuplicates: false}))
	})

	it('leaves closing a toast with actions to its pausable timer', () => {
		success({message: 'Deleted'}, [{
			title: 'Undo',
			callback: () => {},
		}])
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({duration: -1}))
	})

	it('keeps the default duration for toasts without actions', () => {
		success({message: 'Saved'})
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({duration: undefined}))
	})
})

describe('error', () => {
	it('merges duplicate toasts without actions', () => {
		error({message: 'Failed'})
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ignoreDuplicates: true}))
	})

	it('never merges toasts with actions, so each keeps its own action', () => {
		error({message: 'Failed'}, [{
			title: 'Retry',
			callback: () => {},
		}])
		expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ignoreDuplicates: false}))
	})
})

describe('getErrorText', () => {
	it('interpolates i18n_params into the translated error message', () => {
		const text = getErrorText({
			response: {
				data: {
					code: 14002,
					message: 'The permission frobnicate of group tasks is invalid.',
					i18n_params: {permission: 'frobnicate', group: 'tasks'},
				},
			},
		})

		expect(text).toContain('frobnicate')
		expect(text).toContain('tasks')
	})

	it('falls back to empty placeholders when i18n_params is missing, without crashing', () => {
		const text = getErrorText({
			response: {
				data: {
					code: 14002,
					message: 'The permission frobnicate of group tasks is invalid.',
				},
			},
		})

		expect(text).not.toContain('{permission}')
		expect(text).not.toContain('{group}')
		expect(text).not.toContain('undefined')
	})

	it('falls back to data.message when there is no error code', () => {
		const text = getErrorText({
			response: {
				data: {
					message: 'Something went wrong',
				},
			},
		})

		expect(text).toBe('Something went wrong')
	})

	it('falls back to data.message for an unknown error code', () => {
		const text = getErrorText({
			response: {
				data: {
					code: 99999,
					message: 'some backend message',
				},
			},
		})

		expect(text).toBe('some backend message')
	})

	it('appends the server message of a request error given as cause', () => {
		const text = getErrorText(Object.assign(new Error('Error while refreshing user info:'), {
			cause: {
				message: 'Request failed with status code 500',
				response: {data: {message: 'Internal server error'}},
			},
		}))

		expect(text).toBe('Error while refreshing user info: Internal server error')
	})

	it('reads a direct problem response', () => {
		const text = getErrorText({
			code: 99999,
			detail: 'direct problem detail',
		})

		expect(text).toBe('direct problem detail')
	})
})
