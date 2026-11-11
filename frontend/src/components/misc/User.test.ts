import {mount} from '@vue/test-utils'
import {expect, it, vi} from 'vitest'
import {createI18n} from 'vue-i18n'

import User from './User.vue'
import type {IUser} from '@/modelTypes/IUser'
import en from '@/i18n/lang/en.json'

vi.mock('@/components/misc/UserAvatar.vue', () => ({default: {template: '<span />'}}))
// The fork's User.vue loads the avatar itself; keep the test off the network.
vi.mock('@/models/user', async importOriginal => ({
	...await importOriginal<typeof import('@/models/user')>(),
	fetchAvatarBlobUrl: vi.fn(async () => ''),
}))

const i18n = createI18n({
	legacy: false,
	locale: 'en',
	messages: {en},
})

// Fixtures carry only the fields the badge reads.
function mountUser(user: Omit<Partial<IUser>, 'botOwner'> & {botOwner?: Partial<IUser>}) {
	return mount(User, {
		props: {user: user as unknown as IUser},
		global: {
			plugins: [i18n],
			directives: {tooltip: {}},
		},
	})
}

it('names the owner on the bot badge', () => {
	const wrapper = mountUser({
		username: 'bot-helper',
		botOwnerId: 21,
		botOwner: {name: 'Owner A'},
	})
	expect(wrapper.find('.bot-badge').attributes('aria-label')).toBe('Bot, created by Owner A')
})

it('shows a plain bot badge without an owner', () => {
	const wrapper = mountUser({username: 'bot-helper', botOwnerId: 21})
	expect(wrapper.find('.bot-badge').attributes('aria-label')).toBe('Bot')
})

it('shows no badge for humans', () => {
	expect(mountUser({username: 'human'}).find('.bot-badge').exists()).toBe(false)
})
