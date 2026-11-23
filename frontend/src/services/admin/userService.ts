import AbstractService from '@/services/abstractService'
import AdminUserModel from '@/models/adminUser'
import type {IAdminUser} from '@/modelTypes/IAdminUser'
import {apiV2Url} from '@/helpers/fetcher'
import {objectToSnakeCase} from '@/helpers/case'
import UserSettingsModel from '@/models/userSettings'
import type {IUserSettings} from '@/modelTypes/IUserSettings'

export interface CreateAdminUserBody {
	username: string
	email: string
	password: string
	name?: string
	language?: string
	isAdmin?: boolean
	skipEmailConfirm?: boolean
}

export type DeleteUserMode = 'now' | 'scheduled'

export interface AdminSettingsUser {
	id: number
	username: string
	authProvider?: string
}

// The v2 api rejects properties it does not know, and the settings model carries a few of its own.
function settingsBody(settings: IUserSettings) {
	const body: Record<string, unknown> = {...settings}
	delete body.maxPermission
	delete body.extraSettingsLinks
	return body
}

export default class AdminUserService extends AbstractService<IAdminUser> {
	constructor() {
		super({
			getAll: '/admin/users',
		})
	}

	modelFactory(data: Partial<IAdminUser>) {
		return new AdminUserModel(data)
	}

	async setAdmin(id: IAdminUser['id'], isAdmin: boolean) {
		const {data} = await this.http.patch(`/admin/users/${id}/admin`, {is_admin: isAdmin})
		return this.modelUpdateFactory(data)
	}

	async setStatus(id: IAdminUser['id'], status: number) {
		const {data} = await this.http.patch(`/admin/users/${id}/status`, {status})
		return this.modelUpdateFactory(data)
	}

	// The password endpoints only exist on /api/v2, hence the absolute URLs.
	async setPassword(id: IAdminUser['id'], newPassword: string) {
		const {data} = await this.http.patch(apiV2Url(`admin/users/${id}/password`), {new_password: newPassword})
		return this.modelUpdateFactory(data)
	}

	async sendPasswordResetEmail(id: IAdminUser['id']) {
		await this.http.post(apiV2Url(`admin/users/${id}/password-reset-email`))
	}

	// General settings of another user; like the password endpoints these only exist on /api/v2.
	async getSettings(id: IAdminUser['id']): Promise<{settings: IUserSettings, user: AdminSettingsUser}> {
		const {data} = await this.http.get(apiV2Url(`admin/users/${id}/settings/general`))
		// $schema is response metadata, not a setting.
		const {user, $schema: _schema, ...settings} = data
		return {
			settings: new UserSettingsModel(settings),
			user: {id: user?.id, username: user?.username, authProvider: user?.auth_provider},
		}
	}

	async updateSettings(id: IAdminUser['id'], settings: IUserSettings) {
		// A merge patch: only what is sent changes, and frontend_settings merges key by key.
		await this.http.patch(
			apiV2Url(`admin/users/${id}/settings/general`),
			objectToSnakeCase(settingsBody(settings)),
			{headers: {'Content-Type': 'application/merge-patch+json'}},
		)
	}

	async createUser(body: CreateAdminUserBody) {
		const {data} = await this.http.post('/admin/users', body)
		return this.modelCreateFactory(data)
	}

	async deleteUser(id: IAdminUser['id'], mode: DeleteUserMode) {
		await this.http.delete(`/admin/users/${id}`, {params: {mode}})
	}
}
