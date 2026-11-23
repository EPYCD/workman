<template>
	<div class="admin-user-settings">
		<div class="admin-user-settings__header">
			<RouterLink :to="{name: 'admin.users'}">
				{{ $t('admin.users.backToUsers') }}
			</RouterLink>
			<h2
				v-if="data"
				class="title is-4"
			>
				{{ $t('admin.users.settingsTitle', {username: data.user.username}) }}
			</h2>
		</div>
		<Message
			v-if="data && data.user.id !== authStore.info?.id"
			variant="warning"
			class="admin-user-settings__warning"
		>
			{{ $t('admin.users.settingsEditingOther', {username: data.user.username}) }}
		</Message>

		<p v-if="isPending">
			{{ $t('misc.loading') }}
		</p>
		<!-- The form seeds its draft once, so it may only mount with the settings loaded. -->
		<GeneralSettingsForm
			v-else-if="data"
			ref="form"
			:key="userId"
			:initial-settings="data.settings"
			:is-external-user="!!data.user.authProvider"
			:auth-provider="data.user.authProvider"
			:loading="isSaving"
			:own-account="false"
			@save="save"
		/>
	</div>
</template>

<script setup lang="ts">
import {ref, useTemplateRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import Message from '@/components/misc/Message.vue'
import GeneralSettingsForm from '@/views/user/settings/GeneralSettingsForm.vue'
import AdminUserService, {type AdminSettingsUser} from '@/services/admin/userService'
import type {IUserSettings} from '@/modelTypes/IUserSettings'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {error, success} from '@/message'

const props = defineProps<{userId: number}>()

defineOptions({name: 'AdminUserSettings'})

const {t} = useI18n({useScope: 'global'})
const authStore = useAuthStore()
const adminUserService = new AdminUserService()

const data = ref<{settings: IUserSettings, user: AdminSettingsUser}>()
const isPending = ref(true)
const isSaving = ref(false)
const form = useTemplateRef('form')

useTitle(() => data.value ? t('admin.users.settingsTitle', {username: data.value.user.username}) : t('admin.title'))

watch(() => props.userId, async id => {
	isPending.value = true
	data.value = undefined
	try {
		const loaded = await adminUserService.getSettings(id)
		// A slow response for a user the admin already left must not win.
		if (id === props.userId) {
			data.value = loaded
		}
	} catch (e) {
		error(e)
	} finally {
		if (id === props.userId) {
			isPending.value = false
		}
	}
}, {immediate: true})

async function save(settings: IUserSettings) {
	// Captured now: a re-keyed form must not adopt this baseline.
	const target = form.value
	const id = props.userId
	isSaving.value = true
	try {
		await adminUserService.updateSettings(id, settings)
		target?.markSaved()
		success({message: t('user.settings.general.savedSuccess')})
		// The admin may be editing their own account.
		if (id === authStore.info?.id) {
			await authStore.refreshUserInfo()
		}
	} catch (e) {
		error(e)
	} finally {
		isSaving.value = false
	}
}
</script>

<style lang="scss" scoped>
.admin-user-settings__header {
	margin-block-end: var(--wm-space-4);

	.title {
		margin-block-start: var(--wm-space-2);
	}
}

// Not inside the header: sticky only sticks within its parent.
.admin-user-settings__warning {
	position: sticky;
	inset-block-start: $navbar-height;
	z-index: 5;
	margin-block-end: var(--wm-space-4);
}
</style>
