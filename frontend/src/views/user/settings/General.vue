<template>
	<GeneralSettingsForm
		ref="form"
		:initial-settings="authStore.settings"
		:is-external-user="authStore.info?.isLocalUser === false"
		:auth-provider="authStore.info?.authProvider"
		:loading="authStore.isLoadingGeneralSettings"
		own-account
		@save="save"
	/>
</template>

<script setup lang="ts">
import {useTemplateRef} from 'vue'
import {useI18n} from 'vue-i18n'

import GeneralSettingsForm from './GeneralSettingsForm.vue'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import type {IUserSettings} from '@/modelTypes/IUserSettings'

defineOptions({name: 'UserSettingsGeneral'})

const {t} = useI18n({useScope: 'global'})
useTitle(() => `${t('user.settings.general.title')} - ${t('user.settings.title')}`)

const authStore = useAuthStore()
const form = useTemplateRef('form')

async function save(settings: IUserSettings) {
	await authStore.saveUserSettings({settings})
	form.value?.markSaved()
}
</script>
