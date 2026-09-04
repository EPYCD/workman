<script lang="ts" setup>
import {ref, computed, watchEffect} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useTitle} from '@vueuse/core'

import ProjectService from '@/services/project'
import ProjectModel from '@/models/project'
import type {IProject} from '@/modelTypes/IProject'

import CreateEdit from '@/components/misc/CreateEdit.vue'
import {useBaseStore} from '@/stores/base'
import {success} from '@/message'

defineOptions({name: 'ProjectSettingsDiscord'})

const {t} = useI18n({useScope: 'global'})
useTitle(t('project.discord.title'))

const route = useRoute()
const projectId = computed(() => route.params.projectId !== undefined
	? parseInt(route.params.projectId as string)
	: undefined,
)

const project = ref<IProject>()
const username = ref('')
const avatarUrl = ref('')
const events = ref('')
const loading = ref(false)

const projectService = new ProjectService()

async function load(id: number) {
	loading.value = true
	try {
		const loaded = await projectService.get(new ProjectModel({id}))
		await useBaseStore().handleSetCurrentProject({project: loaded})
		project.value = loaded
		username.value = loaded.discordUsername ?? ''
		avatarUrl.value = loaded.discordAvatarUrl ?? ''
		events.value = loaded.discordEvents ?? ''
	} finally {
		loading.value = false
	}
}

watchEffect(() => projectId.value !== undefined && load(projectId.value))

async function save() {
	if (project.value === undefined) {
		return
	}
	loading.value = true
	try {
		project.value.discordUsername = username.value.trim()
		project.value.discordAvatarUrl = avatarUrl.value.trim()
		// Stored as the API expects it: comma separated, no spaces, empty means
		// everything. Normalising here keeps "a, b" and "a,b" from being two
		// different filters that read identically.
		project.value.discordEvents = events.value
			.split(',')
			.map(event => event.trim())
			.filter(event => event !== '')
			.join(',')
		const saved = await projectService.update(project.value)
		project.value = saved
		events.value = saved.discordEvents ?? ''
		success({message: t('project.discord.saveSuccess')})
	} finally {
		loading.value = false
	}
}
</script>

<template>
	<CreateEdit
		:title="$t('project.discord.title')"
		:primary-label="$t('misc.save')"
		:loading="loading"
		@primary="save"
	>
		<p>{{ $t('project.discord.explanation') }}</p>
		<div class="message is-info">
			<div class="message-body">
				{{ $t('project.discord.webhookLivesElsewhere') }}
			</div>
		</div>

		<div class="field">
			<label
				class="label"
				for="discordUsername"
			>{{ $t('project.discord.username') }}</label>
			<div class="control">
				<input
					id="discordUsername"
					v-model="username"
					class="input"
					:disabled="loading"
					:placeholder="$t('project.discord.usernamePlaceholder')"
				>
			</div>
		</div>

		<div class="field">
			<label
				class="label"
				for="discordAvatar"
			>{{ $t('project.discord.avatar') }}</label>
			<div class="control">
				<input
					id="discordAvatar"
					v-model="avatarUrl"
					class="input"
					type="url"
					:disabled="loading"
					placeholder="https://…"
				>
			</div>
		</div>

		<div class="field">
			<label
				class="label"
				for="discordEvents"
			>{{ $t('project.discord.events') }}</label>
			<div class="control">
				<input
					id="discordEvents"
					v-model="events"
					class="input"
					:disabled="loading"
					:placeholder="$t('project.discord.eventsPlaceholder')"
				>
			</div>
			<p class="help">
				{{ $t('project.discord.eventsHelp') }}
			</p>
		</div>
	</CreateEdit>
</template>
