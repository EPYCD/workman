import {afterEach, describe, expect, it, vi} from 'vitest'

import {AUTH_TYPES} from '@/modelTypes/IUser'
import {useWebSocket} from './useWebSocket'

const auth = vi.hoisted(() => ({
	token: null as string | null,
	type: null as number | null,
}))

vi.mock('@/helpers/auth', () => ({
	getToken: () => auth.token,
	getTokenType: () => auth.type,
}))

class FakeSocket {
	static OPEN = 1
	static CONNECTING = 0
	static instances: FakeSocket[] = []

	readyState = FakeSocket.CONNECTING
	onopen: (() => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null
	onclose: (() => void) | null = null
	onerror: (() => void) | null = null
	send = vi.fn()

	constructor() {
		FakeSocket.instances.push(this)
	}

	close() {
		this.readyState = 3
	}
}

function connectAs(token: string | null, type: number | null) {
	vi.stubGlobal('WebSocket', FakeSocket)
	window.API_URL = 'http://localhost/api/v1'
	auth.token = token
	auth.type = type
	useWebSocket().connect()
}

afterEach(() => {
	useWebSocket().disconnect()
	vi.unstubAllGlobals()
	FakeSocket.instances = []
	auth.token = null
	auth.type = null
})

describe('useWebSocket', () => {
	it('opens a socket for a user session', () => {
		connectAs('user-token', AUTH_TYPES.USER)

		expect(FakeSocket.instances).toHaveLength(1)
	})

	it('does not open a socket for a link share session', () => {
		connectAs('link-share-token', AUTH_TYPES.LINK_SHARE)

		expect(FakeSocket.instances).toHaveLength(0)
	})

	it('does not open a socket without a token', () => {
		connectAs(null, null)

		expect(FakeSocket.instances).toHaveLength(0)
	})
})
