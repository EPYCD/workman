import {afterEach, describe, expect, it, vi} from 'vitest'

import {AUTH_TYPES} from '@/modelTypes/IUser'
import {useWebSocket} from './useWebSocket'

const auth = vi.hoisted(() => ({
	token: null as string | null,
	type: null as number | null,
	expired: false,
	refreshRejected: false,
	refreshListeners: [] as (() => void)[],
}))
const refreshToken = vi.hoisted(() => vi.fn())

vi.mock('@/helpers/auth', () => ({
	getToken: () => auth.token,
	getTokenType: () => auth.type,
	isTokenExpired: () => auth.expired,
	isRefreshRejected: () => auth.refreshRejected,
	onTokenRefreshed: (listener: () => void) => {
		auth.refreshListeners.push(listener)
	},
	refreshToken,
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

	close = vi.fn(() => {
		this.readyState = 3
	})
}

function frame(msg: object) {
	return {data: JSON.stringify(msg)} as MessageEvent
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
	auth.expired = false
	auth.refreshRejected = false
	refreshToken.mockReset()
	vi.useRealTimers()
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

	it('authenticates with a valid token without refreshing it', async () => {
		connectAs('user-token', AUTH_TYPES.USER)
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN
		socket.onopen?.()
		await vi.waitFor(() => expect(socket.send).toHaveBeenCalled())

		expect(refreshToken).not.toHaveBeenCalled()
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({action: 'auth', token: 'user-token'}))
	})

	// The server closes a socket when its token expires, so a reconnect starts with a stale one.
	it('refreshes an expired token before authenticating', async () => {
		auth.expired = true
		refreshToken.mockImplementation(async () => {
			auth.token = 'fresh'
			auth.expired = false
		})
		connectAs('stale', AUTH_TYPES.USER)
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN
		socket.onopen?.()
		await vi.waitFor(() => expect(socket.send).toHaveBeenCalled())

		expect(refreshToken).toHaveBeenCalledTimes(1)
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({action: 'auth', token: 'fresh'}))
	})

	it('reconnects instead of sending the expired token when the refresh fails transiently', async () => {
		vi.useFakeTimers()
		auth.expired = true
		refreshToken.mockRejectedValue(new Error('network'))
		connectAs('stale', AUTH_TYPES.USER)
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN
		socket.onopen?.()
		await vi.waitFor(() => expect(socket.close).toHaveBeenCalled())
		socket.onclose?.()

		expect(socket.send).not.toHaveBeenCalled()
		vi.runOnlyPendingTimers()
		expect(FakeSocket.instances).toHaveLength(2)
	})

	it('gives up when the refresh is rejected and the server refuses the stale token', async () => {
		vi.useFakeTimers()
		auth.expired = true
		auth.refreshRejected = true
		refreshToken.mockRejectedValue(new Error('rejected'))
		connectAs('stale', AUTH_TYPES.USER)
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN
		socket.onopen?.()
		await vi.waitFor(() => expect(socket.send).toHaveBeenCalled())
		socket.onmessage?.(frame({error: 'invalid_token'}))
		socket.onclose?.()

		vi.runOnlyPendingTimers()
		expect(FakeSocket.instances).toHaveLength(1)
	})

	it('re-authenticates the open socket with a renewed token and keeps its subscriptions', async () => {
		connectAs('user-token', AUTH_TYPES.USER)
		const ws = useWebSocket()
		ws.subscribe('task.updated', () => {})
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN
		socket.onopen?.()
		await vi.waitFor(() => expect(socket.send).toHaveBeenCalled())
		socket.onmessage?.(frame({action: 'auth.success', success: true}))
		socket.send.mockClear()

		auth.token = 'renewed'
		auth.refreshListeners.forEach(listener => listener())
		socket.onmessage?.(frame({action: 'auth.success', success: true}))

		expect(socket.send).toHaveBeenCalledTimes(1)
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({action: 'auth', token: 'renewed'}))
	})

	it('does not re-authenticate a socket that has not authenticated yet', () => {
		connectAs('user-token', AUTH_TYPES.USER)
		const socket = FakeSocket.instances[0]
		socket.readyState = FakeSocket.OPEN

		auth.refreshListeners.forEach(listener => listener())

		expect(socket.send).not.toHaveBeenCalled()
	})
})
