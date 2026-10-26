import {i18n} from '@/i18n'
import {notify} from '@kyvg/vue3-notification'

export function getErrorText(r): string {
	const data = r?.reason?.response?.data || r?.response?.data || r

	if (data?.code) {
		const path = `error.${data.code}`
		let message = i18n.global.t(path, data.i18n_params ?? {})

		if (data?.code && data?.message && (data.code === 4016 || data.code === 4017 || data.code === 4018 || data.code === 4019 || data.code === 4024)) {
			message += '\n' + data.message
		}

		// If message and path are equal no translation exists for that error code
		if (path !== message) {
			return message
		}
	}
	
	// v2 errors are RFC 9457 problem+json, which carries `detail` instead of `message`.
	let message = data?.message || data?.detail || r.message
	
	const causeMessage = r.cause?.response?.data?.message ?? r.cause?.message
	if (typeof causeMessage !== 'undefined') {
		message += ' ' + causeMessage
	}

	return message
}

export function translatedError(key: string): Error {
	return new Error(i18n.global.t(key))
}

export interface Action {
	title: string,
	callback: () => void,
}

export type ToastData = {actions: Action[]}

// Long enough to reach the action; Notification.vue pauses it while the toast is hovered or focused
export const ACTION_TOAST_DURATION = 10_000

function toast(type: 'error' | 'success', title: string, e: unknown, actions: Action[], duration?: number) {
	const data: ToastData = {actions}
	notify({
		type,
		title,
		text: getErrorText(e),
		// Duplicates merge on title and text, which would drop this toast's own actions.
		ignoreDuplicates: actions.length === 0,
		// Notification.vue runs the pausable timer instead
		duration: actions.length > 0 ? -1 : duration,
		data,
	})
}

export function error(e: unknown, actions: Action[] = []) {
	// The 3s library default is too short to notice and read an error.
	toast('error', i18n.global.t('error.error'), e, actions, 10_000)
}

export function success(e: unknown, actions: Action[] = []) {
	toast('success', i18n.global.t('error.success'), e, actions)
}
