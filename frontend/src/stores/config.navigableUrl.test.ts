import {describe, it, expect} from 'vitest'

import {navigableUrl} from './config'

describe('navigableUrl', () => {
	it('keeps http and https urls', () => {
		expect(navigableUrl('https://idp.example.com/logout')).toBe('https://idp.example.com/logout')
		expect(navigableUrl('http://idp.example.com/logout')).toBe('http://idp.example.com/logout')
	})

	it('keeps relative urls, which resolve against our own origin', () => {
		expect(navigableUrl('/login')).toBe('/login')
	})

	it('drops urls that would run script or leave the web', () => {
		expect(navigableUrl('javascript:alert(1)')).toBe('')
		expect(navigableUrl(' JavaScript:alert(1)')).toBe('')
		expect(navigableUrl('data:text/html,<script>alert(1)</script>')).toBe('')
	})

	it('returns an empty string for a missing url', () => {
		expect(navigableUrl(undefined)).toBe('')
		expect(navigableUrl('')).toBe('')
	})
})
