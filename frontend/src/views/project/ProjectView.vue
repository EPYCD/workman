<script setup lang="ts">
import {computed, ref, shallowReactive, watch, watchEffect} from 'vue'
import {useRoute, useRouter} from 'vue-router'

import {useBaseStore} from '@/stores/base'
import {useProjectStore} from '@/stores/projects'
import {useAuthStore} from '@/stores/auth'

import {getDefaultProjectView, saveProjectView} from '@/helpers/projectView'
import ProjectService from '@/services/project'

import ProjectList from '@/components/project/views/ProjectList.vue'
import ProjectGantt from '@/components/project/views/ProjectGantt.vue'
import ProjectTable from '@/components/project/views/ProjectTable.vue'
import ProjectKanban from '@/components/project/views/ProjectKanban.vue'
import ProjectInTrashNotice from '@/components/project/ProjectInTrashNotice.vue'

import {projectInTrashFromError, type ProjectInTrash} from '@/client/queries/trashErrors'
import {useFocusAfterRemoval} from '@/composables/useFocusAfterRemoval'
import {saveProjectToHistory} from '@/modules/projectHistory'
import type {IProject} from '@/modelTypes/IProject'

const props = defineProps<{
	projectId: number,
	viewId: number,
}>()

const router = useRouter()
const baseStore = useBaseStore()
const projectStore = useProjectStore()
const authStore = useAuthStore()
const route = useRoute()

const currentProject = computed(() => projectStore.projects[props.projectId])

const currentView = computed(() => {
	return currentProject.value?.views.find(v => v.id === props.viewId)
})

const projectService = shallowReactive(new ProjectService())
const isLoadingProject = computed(() => projectService.loading)
const loadedProjectId = ref(0)
const projectInTrash = ref<ProjectInTrash | null>(null)
useFocusAfterRemoval(() => projectInTrash.value !== null, () => document.getElementById('main-content'))

async function loadProject(projectIdToLoad: number) {
	console.debug('Loading project, $route.params =', route.params, `, loadedProjectId = ${loadedProjectId.value}, currentProject = `, currentProject.value)

	try {
		const loadedProject = await projectService.get({id: projectIdToLoad})
		projectInTrash.value = null

		// Here, we only set the new project in the projectStore.
		// Setting that projet as the current one in the baseStore is handled by the watcher below.
		projectStore.setProject(loadedProject)
	} catch (e) {
		const inTrash = projectInTrashFromError(e)
		if (!inTrash) {
			throw e
		}
		projectInTrash.value = inTrash
		// Trashed elsewhere: drop it from the sidebar too.
		const stale = projectStore.projects[projectIdToLoad]
		if (stale) {
			projectStore.removeProjectById(stale as IProject)
		}
	} finally {
		loadedProjectId.value = projectIdToLoad
	}
}

watch(
	() => props.projectId,
	async (projectIdToLoad, oldProjectIdToLoad) => {
		if (projectIdToLoad !== oldProjectIdToLoad) {
			loadedProjectId.value = 0
			projectInTrash.value = null
		}
		await loadProject(projectIdToLoad)
	},
	{immediate: true},
)

watch(
	() => [currentProject.value, props.viewId],
	([newCurrentProject, newViewId]) => {
		if (!newCurrentProject) {
			baseStore.handleSetCurrentProject({project: null})
			return
		}
		
		baseStore.handleSetCurrentProject({
			project: newCurrentProject,
			currentProjectViewId: newViewId,
		})
	}, {
		deep: true,
		immediate: true,
	},
)

function redirectToDefaultViewIfNecessary() {
	if (props.viewId === 0 || !currentView.value) {
		// Project views may arrive after the router resolves.
		const view = getDefaultProjectView(
			currentProject.value?.views ?? [],
			authStore.settings.frontendSettings.defaultView,
		)

		if (view) {
			router.replace({
				name: 'project.view',
				params: {
					projectId: props.projectId,
					viewId: view.id,
				},
			})
		}
	}
}

watch(
	() => props.viewId,
	redirectToDefaultViewIfNecessary,
	{immediate: true},
)

watch(
	currentProject,
	redirectToDefaultViewIfNecessary,
)

watchEffect(() => {
	// Don't save to history if the user is not authenticated (e.g., during logout)
	if (authStore.authenticated) {
		saveProjectToHistory({id: props.projectId})
	}
})
watchEffect(() => saveProjectView(props.projectId, props.viewId))

watchEffect(() => baseStore.setCurrentProjectViewId(props.viewId))
</script>

<template>
	<div
		v-if="projectInTrash"
		class="content is-max-width-desktop"
	>
		<ProjectInTrashNotice
			:in-trash="projectInTrash"
			@restored="loadProject(projectId)"
		/>
	</div>
	<template v-else>
		<ProjectList
			v-if="currentView?.viewKind === 'list'"
			:project-id="projectId"
			:is-loading-project="isLoadingProject"
			:view-id
		/>
		<ProjectGantt
			v-if="currentView?.viewKind === 'gantt'"
			:route
			:is-loading-project="isLoadingProject"
			:view-id
		/>
		<ProjectTable
			v-if="currentView?.viewKind === 'table'"
			:project-id="projectId"
			:is-loading-project="isLoadingProject"
			:view-id
		/>
		<ProjectKanban
			v-if="currentView?.viewKind === 'kanban'"
			:project-id="projectId"
			:is-loading-project="isLoadingProject"
			:view-id
		/>
	</template>
</template>
