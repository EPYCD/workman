import {beforeEach, describe, expect, it, vi} from 'vitest'

import {checkAndSetApiUrl} from './checkAndSetApiUrl'

const mocks = vi.hoisted(() => ({
	clear: vi.fn(),
	configure: vi.fn(),
	update: vi.fn(),
	setAuthenticated: vi.fn(),
	setUser: vi.fn(),
}))

vi.mock('@/stores/config', () => ({
	useConfigStore: () => ({update: mocks.update}),
}))

vi.mock('@/stores/auth', () => ({
	useAuthStore: () => ({setAuthenticated: mocks.setAuthenticated, setUser: mocks.setUser}),
}))

vi.mock('@/client/http', () => ({
	configureApiClient: mocks.configure,
}))

vi.mock('@/client/queryClient', () => ({
	queryClient: {clear: mocks.clear},
}))

describe('checkAndSetApiUrl query lifecycle', () => {
	beforeEach(() => {
		window.API_URL = 'https://old.example.com/api/v1'
		localStorage.clear()
		mocks.clear.mockReset()
		mocks.configure.mockReset()
		mocks.update.mockReset()
		mocks.setAuthenticated.mockReset()
		mocks.setUser.mockReset()
	})

	it('reconfigures the client and clears cache after accepting a different server', async () => {
		mocks.update.mockResolvedValue(true)

		await expect(checkAndSetApiUrl('https://new.example.com/api/v1')).resolves.toBe('https://new.example.com/api/v1')

		expect(mocks.configure).toHaveBeenCalledOnce()
		expect(mocks.clear).toHaveBeenCalledOnce()
	})

	it('keeps the current client and cache when the server does not change', async () => {
		mocks.update.mockResolvedValue(true)

		await checkAndSetApiUrl('https://old.example.com/api/v1')

		expect(mocks.configure).not.toHaveBeenCalled()
		expect(mocks.clear).not.toHaveBeenCalled()
	})

	it('keeps the current client and cache when every candidate is rejected', async () => {
		mocks.update.mockRejectedValue(new Error('unreachable'))

		await expect(checkAndSetApiUrl('https://new.example.com')).rejects.toThrow('unreachable')

		expect(window.API_URL).toBe('https://old.example.com/api/v1')
		expect(mocks.configure).not.toHaveBeenCalled()
		expect(mocks.clear).not.toHaveBeenCalled()
	})
})

describe('checkAndSetApiUrl stored credentials', () => {
	beforeEach(() => {
		window.API_URL = ''
		localStorage.clear()
		localStorage.setItem('token', 'jwt')
		localStorage.setItem('desktopOAuthRefreshToken', 'refresh')
		mocks.update.mockReset()
		mocks.update.mockResolvedValue(true)
		mocks.setAuthenticated.mockReset()
		mocks.setUser.mockReset()
	})

	it('drops tokens and auth state when switching to another server', async () => {
		localStorage.setItem('API_URL', 'https://old.example.com')

		await checkAndSetApiUrl('https://attacker.example.com')

		expect(localStorage.getItem('token')).toBeNull()
		expect(localStorage.getItem('desktopOAuthRefreshToken')).toBeNull()
		expect(mocks.setAuthenticated).toHaveBeenCalledWith(false)
		expect(mocks.setUser).toHaveBeenCalledWith(null, false)
	})

	it.each([
		['the same server', 'https://old.example.com', 'https://old.example.com/'],
		['a stored url with the api path', 'https://old.example.com/api/v1', 'https://old.example.com'],
	])('keeps tokens when booting against %s', async (_, stored, input) => {
		localStorage.setItem('API_URL', stored)

		await checkAndSetApiUrl(input)

		expect(localStorage.getItem('token')).toBe('jwt')
		expect(localStorage.getItem('desktopOAuthRefreshToken')).toBe('refresh')
		expect(mocks.setAuthenticated).not.toHaveBeenCalled()
	})

	it('keeps tokens when no server was stored yet', async () => {
		await checkAndSetApiUrl('https://new.example.com')

		expect(localStorage.getItem('token')).toBe('jwt')
	})

	it('keeps tokens when the new server is rejected', async () => {
		localStorage.setItem('API_URL', 'https://old.example.com')
		mocks.update.mockRejectedValue(new Error('unreachable'))

		await expect(checkAndSetApiUrl('https://attacker.example.com')).rejects.toThrow('unreachable')

		expect(localStorage.getItem('token')).toBe('jwt')
	})
})
