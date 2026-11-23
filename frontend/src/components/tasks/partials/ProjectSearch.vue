<template>
	<Multiselect
		class="control is-expanded"
		:placeholder="$t('project.search')"
		:search-results="foundProjects"
		label="title"
		:select-placeholder="$t('project.searchSelect')"
		:model-value="multiple ? modelValue as IProject[] : project"
		:multiple="multiple"
		:close-after-select="!multiple"
		@update:modelValue="update"
		@select="select"
		@search="findProjects"
	>
		<template #searchResult="{option}">
			<span
				v-if="projectStore.getAncestors(option).length > 1"
				class="has-text-grey"
			>
				{{ projectStore.getAncestors(option).filter(p => p.id !== option.id).map(p => getProjectTitle(p)).join(' &gt; ') }} &gt;
			</span>
			{{ getProjectTitle(option) }}
		</template>
	</Multiselect>
</template>

<script lang="ts" setup generic="Multiple extends boolean = false">
import {reactive, ref, watch} from 'vue'

import type {IProject} from '@/modelTypes/IProject'

import {useProjectStore} from '@/stores/projects'
import {getProjectTitle} from '@/helpers/getProjectTitle'

import ProjectModel from '@/models/project'
import Multiselect from '@/components/input/Multiselect.vue'

type Selection = Multiple extends true ? IProject[] : IProject | null

const props = withDefaults(defineProps<{
	modelValue?: Selection
	// `& boolean` keeps Vue's runtime Boolean casting for a bare `multiple` attribute.
	multiple?: Multiple & boolean
	savedFiltersOnly?: boolean
	filter?: (project: IProject) => boolean,
}>(), {
	modelValue: undefined,
	multiple: undefined,
	savedFiltersOnly: false,
	filter: () => true,
})

const emit = defineEmits<{
	'update:modelValue': [value: Selection]
}>()

const project: IProject = reactive(new ProjectModel())

watch(
	() => props.multiple ? null : props.modelValue as IProject | null | undefined,
	(newProject) => Object.assign(project, newProject ?? new ProjectModel()),
	{
		immediate: true,
		deep: true,
	},
)

const projectStore = useProjectStore()

const foundProjects = ref<IProject[]>([])
function findProjects(query: string) {
	if (query === '' && !props.multiple) {
		select(null)
	}
	
	if (props.savedFiltersOnly) {
		const found = projectStore.searchSavedFilter(query)
		foundProjects.value = found.filter(props.filter)
		return
	}
	
	const found = projectStore.searchProject(query)
	foundProjects.value = found.filter(props.filter)
}

function update(value: IProject | IProject[] | null) {
	if (Array.isArray(value)) {
		emit('update:modelValue', value as Selection)
	} else if (value === null) {
		select(null)
	} else {
		Object.assign(project, value)
	}
}

function select(p: IProject | null) {
	if (props.multiple) {
		return
	}
	if (p === null) {
		Object.assign(project, new ProjectModel())
		emit('update:modelValue', null as Selection)
		return
	}
	Object.assign(project, p)
	emit('update:modelValue', project as Selection)
}
</script>
