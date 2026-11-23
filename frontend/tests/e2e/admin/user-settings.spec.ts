import {test, expect} from '../../support/fixtures'
import {UserFactory} from '../../factories/user'
import {LicenseFactory} from '../../factories/license'
import {login} from '../../support/authenticateUser'

test.describe('Admin user settings', () => {
	test.beforeEach(async () => {
		await LicenseFactory.enable(['admin_panel'])
	})

	test.afterEach(async () => {
		await LicenseFactory.disable()
	})

	test('admin edits another user\'s general settings', async ({page, apiContext}) => {
		const [admin] = await UserFactory.create(1, {id: 1, is_admin: true}, false)
		await UserFactory.create(1, {id: 2, username: 'settings-target'}, false)
		const {token} = await login(page, apiContext, admin)
		await page.goto('/admin/users')
		await page.getByRole('row', {name: /settings-target/}).getByRole('button', {name: 'Details', exact: true}).click()
		await page.getByRole('dialog').getByRole('link', {name: 'Edit settings', exact: true}).click()
		await expect(page.getByRole('heading', {name: 'Settings of settings-target'})).toBeVisible()
		await expect(page.getByText('You are editing the settings of settings-target, not your own.', {exact: false})).toBeVisible()
		await page.getByText('Allow other users to add me as a member to teams or projects when they search for my name', {exact: true}).click()
		const saved = page.waitForResponse(r => r.url().endsWith('/admin/users/2/settings/general') && r.request().method() === 'PATCH')
		await page.getByRole('button', {name: 'Save', exact: true}).click()
		expect((await saved).ok()).toBe(true)
		const stored = await apiContext.get('/api/v2/admin/users/2/settings/general', {headers: {Authorization: `Bearer ${token}`}})
		expect(await stored.json()).toEqual(expect.objectContaining({discoverable_by_name: true}))
	})
})
