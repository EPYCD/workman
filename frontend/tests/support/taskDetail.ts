import {expect, type Page} from '@playwright/test'

export async function openTaskActions(page: Page) {
	await page.locator('[data-cy="taskDetail.moreActions"]').click()
	return page.locator('.task-view .task-actions-menu .dropdown-menu')
}

export async function clickTaskAction(page: Page, label: string) {
	const menu = await openTaskActions(page)
	await menu.getByRole('button', {name: label, exact: true}).click()
}

// The fork confirms deletes in a modal; upstream deletes straight from the menu and offers undo.
export async function deleteTaskFromDetail(page: Page) {
	await clickTaskAction(page, 'Delete')
	await expect(page.locator('dialog[open] .modal-content .modal-header')).toContainText('Delete this task')
	await page.locator('dialog[open] .modal-content .actions .button').filter({hasText: 'Do it!'}).click()
}
