<script lang="ts" setup>
import {ref, computed, watchEffect} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useTitle} from '@vueuse/core'

import ProjectService from '@/services/project'
import ProjectModel from '@/models/project'
import BotUserService from '@/services/botUser'
import type {IProject} from '@/modelTypes/IProject'
import type {IUser} from '@/modelTypes/IUser'

import CreateEdit from '@/components/misc/CreateEdit.vue'
import {useBaseStore} from '@/stores/base'
import {success} from '@/message'

defineOptions({name: 'ProjectSettingsGates'})

const {t} = useI18n({useScope: 'global'})
useTitle(t('project.gates.title'))

const route = useRoute()
const projectId = computed(() => route.params.projectId !== undefined
	? parseInt(route.params.projectId as string)
	: undefined,
)

const project = ref<IProject>()
const bots = ref<IUser[]>([])
// 0 is the API's "no gate", so it doubles as the empty selection.
const selected = ref(0)
const loading = ref(false)

const projectService = new ProjectService()
const botUserService = new BotUserService()

// The bot named on the project may not be one this user owns, so it will not
// always appear in the list below. Show it anyway, or the select would silently
// change the setting the moment someone saves.
const currentBotMissing = computed(() => project.value !== undefined
	&& project.value.receiptBotId !== 0
	&& !bots.value.some(bot => bot.id === project.value?.receiptBotId),
)

async function load(id: number) {
	loading.value = true
	try {
		const loaded = await projectService.get(new ProjectModel({id}))
		await useBaseStore().handleSetCurrentProject({project: loaded})
		project.value = loaded
		selected.value = loaded.receiptBotId ?? 0
		bots.value = await botUserService.getAll()
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
		project.value.receiptBotId = selected.value
		const saved = await projectService.update(project.value)
		project.value = saved
		selected.value = saved.receiptBotId ?? 0
		success({message: t('project.gates.saveSuccess')})
	} finally {
		loading.value = false
	}
}
</script>

<template>
	<CreateEdit
		:title="$t('project.gates.title')"
		:primary-label="$t('misc.save')"
		:loading="loading"
		@primary="save"
	>
		<p>{{ $t('project.gates.explanation') }}</p>

		<div class="field">
			<label
				class="label"
				for="receiptBot"
			>{{ $t('project.gates.receiptBot') }}</label>
			<div class="control">
				<div class="select">
					<select
						id="receiptBot"
						v-model="selected"
						:disabled="loading"
					>
						<option :value="0">
							{{ $t('project.gates.noGate') }}
						</option>
						<option
							v-if="currentBotMissing"
							:value="project?.receiptBotId"
						>
							{{ $t('project.gates.currentBot', {id: project?.receiptBotId}) }}
						</option>
						<option
							v-for="bot in bots"
							:key="bot.id"
							:value="bot.id"
						>
							{{ bot.username }}
						</option>
					</select>
				</div>
			</div>
			<p class="help">
				{{ selected === 0 ? $t('project.gates.noGateHelp') : $t('project.gates.gateOnHelp') }}
			</p>
		</div>
	</CreateEdit>
</template>
