// This test assumes no mailer is set up and all users are activated immediately.

import {test, expect} from '../../support/fixtures'
import {UserFactory} from '../../factories/user'

test.describe('Registration', () => {
	test.beforeEach(async ({page, apiContext}) => {
		await UserFactory.create(1, {
			username: 'test',
		})
		await page.goto('/')
		await page.evaluate(() => localStorage.removeItem('token'))
	})

	test('Should work without issues', async ({page, apiContext}) => {
		const fixture = {
			username: 'testuser',
			password: '12345678',
			email: 'testuser@example.com',
		}

		// Install clock before navigation so app observes mocked time for greeting
		await page.clock.install({time: new Date(1625656161057)}) // 13:00
		await page.goto('/register')
		await page.locator('#username').fill(fixture.username)
		await page.locator('#email').fill(fixture.email)
		await page.locator('#password').fill(fixture.password)
		await page.locator('#register-submit').click()
		await expect(page).toHaveURL('/')
		await expect(page.locator('main h1')).toContainText(fixture.username)
	})

	for (const submitWith of ['Enter', 'button']) {
		test(`Should register without a password validation flash using ${submitWith}`, async ({page}) => {
			const username = 'new-user'
			await page.goto('/register')
			await page.locator('#username').fill(username)
			await page.locator('#email').fill('new-user@example.com')
			await page.locator('#password').pressSequentially('securePassword123')
			await expect(page.locator('#register-submit')).toBeEnabled()
			await page.route('**/api/v1/register', async route => {
				const response = await route.fetch()
				// Keep the form mounted while debounced validation runs.
				await new Promise(resolve => setTimeout(resolve, 300))
				await route.fulfill({response})
			})
			const errors = await page.evaluateHandle(() => {
				const errors: string[] = []
				const observer = new MutationObserver(() => {
					const error = document.querySelector('#password-error')
					if (error) errors.push(error.textContent ?? '')
				})
				observer.observe(document.body, {childList: true, subtree: true, characterData: true})
				return errors
			})

			if (submitWith === 'Enter') {
				await page.locator('#password').press('Enter')
			} else {
				await page.locator('#register-submit').click()
			}
			await expect(page).toHaveURL('/')
			expect(await errors.jsonValue()).toEqual([])
			await errors.dispose()
			await page.reload()
			await expect(page.locator('main h1')).toContainText(username)
		})
	}


	test('Should show a confirmation notice when the email needs to be verified', async ({page}) => {
		// e2e API has no mailer, so mock the 412 the auto-login would get
		await page.route('**/api/v1/login', route => route.fulfill({
			status: 412,
			contentType: 'application/json',
			body: JSON.stringify({code: 1012, message: 'Please confirm your email address.'}),
		}))

		await page.goto('/register')
		await page.locator('#username').fill('unconfirmeduser')
		await page.locator('#email').fill('unconfirmed@example.com')
		await page.locator('#password').fill('12345678')
		await page.locator('#register-submit').click()

		await expect(page.locator('div.message.success')).toContainText('check your inbox')
		await expect(page.locator('div.message.danger')).not.toBeVisible()
		await expect(page).toHaveURL(/\/register/)
	})

	test('Should fail', async ({page, apiContext}) => {
		const fixture = {
			username: 'test',
			password: '12345678',
			email: 'testuser@example.com',
		}

		await page.goto('/register')
		await page.locator('#username').fill(fixture.username)
		await page.locator('#email').fill(fixture.email)
		await page.locator('#password').fill(fixture.password)
		await page.locator('#register-submit').click()
		await expect(page.locator('div.message.danger')).toContainText('A user with this username already exists.')
	})
})
