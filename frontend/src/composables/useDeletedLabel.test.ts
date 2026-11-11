import {describe, it, expect, beforeEach} from 'vitest'
import {setActivePinia, createPinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {defineComponent, h} from 'vue'
import {mount} from '@vue/test-utils'

import {useDeletedLabel} from './useDeletedLabel'
import {useAuthStore} from '@/stores/auth'
import {AUTH_TYPES, type IUser} from '@/modelTypes/IUser'

type AuthType = typeof AUTH_TYPES[keyof typeof AUTH_TYPES]

const DELETED_AT = '2024-01-15T10:00:00Z'

function makeI18n() {
	return createI18n({
		legacy: false,
		locale: 'en',
		fallbackLocale: 'en',
		messages: {
			en: {
				unknown: 'unknown',
				by: 'by {user}',
				byYou: 'by you',
			},
		},
	})
}

function labelFor(deletedBy?: {id: number, username: string, name?: string}) {
	let label = ''
	const Comp = defineComponent({
		setup() {
			const deletedLabel = useDeletedLabel({
				unknown: 'unknown',
				by: 'by',
				byYou: 'byYou',
			})
			label = deletedLabel({
				deleted_at: DELETED_AT,
				deleted_by: deletedBy,
			})
			return () => h('div')
		},
	})
	mount(Comp, {global: {plugins: [makeI18n()]}})
	return label
}

// The fork's auth store takes the user model rather than a session.
function setSession(id: number, type: AuthType) {
	useAuthStore().setUser({id, type} as IUser, false)
}

describe('useDeletedLabel', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('says "you" when a user session matches the deleter id', () => {
		setSession(1, AUTH_TYPES.USER)

		expect(labelFor({
			id: 1,
			username: 'user1',
		})).toBe('by you')
		expect(labelFor({
			id: -1,
			username: 'link-share-1',
		})).toBe('by link-share-1')
	})

	it('says "you" when a link share session matches the negated deleter id', () => {
		setSession(1, AUTH_TYPES.LINK_SHARE)

		expect(labelFor({
			id: -1,
			username: 'link-share-1',
		})).toBe('by you')
		expect(labelFor({
			id: 1,
			username: 'user1',
		})).toBe('by user1')
	})

	it('prefers the display name and falls back when nobody is recorded', () => {
		setSession(1, AUTH_TYPES.USER)

		expect(labelFor({
			id: 2,
			username: 'user2',
			name: 'User Two',
		})).toBe('by User Two')
		expect(labelFor()).toBe('unknown')
	})
})
