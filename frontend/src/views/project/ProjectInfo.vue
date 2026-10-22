<!-- eslint-disable vue/no-v-html -->
<template>
	<Modal
		@close="goBack()"
	>
		<Card
			:title="project?.title"
			class="is-justify-content-start"
			:show-close="true"
			@close="goBack()"
		>
			<div
				v-if="htmlDescription !== ''"
				class="has-text-start"
				data-user-content
				v-html="htmlDescription"
			/>
			<p
				v-else
				class="is-italic"
			>
				{{ $t('project.noDescriptionAvailable') }}
			</p>
		</Card>
	</Modal>
</template>

<script lang="ts" setup>
import {computed} from 'vue'
import {useProjectStore} from '@/stores/projects'
import {useI18n} from 'vue-i18n'
import {useGoBack} from '@/composables/useGoBack'
import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'

const props = defineProps<{
	projectId: number
}>()

const goBack = useGoBack()

const {t} = useI18n()

const projectStore = useProjectStore()
const project = computed(() => projectStore.projects[props.projectId])
const htmlDescription = computed(() => {
	const description = project.value?.description || ''
	if (description === '') {
		return ''
	}

	if (project.value.id === -1) {
		return t('project.favoriteDescription')
	}

	return sanitizeProjectDescription(description)
})
</script>
