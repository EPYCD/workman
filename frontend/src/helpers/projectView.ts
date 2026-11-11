import type {IProject} from '@/modelTypes/IProject'
import {DEFAULT_PROJECT_VIEW_SETTINGS, type DefaultProjectViewKind, type IProjectView} from '@/modelTypes/IProjectView'

export type ProjectViewSettings = Record<IProject['id'], number>

const SETTINGS_KEY_PROJECT_VIEW = 'projectView'

// Generic so deep-readonly store views come back with their own type.
export function getDefaultProjectView<V extends Pick<IProjectView, 'viewKind'>>(views: readonly V[], preferredKind: DefaultProjectViewKind | undefined): V | undefined {
	return (preferredKind !== DEFAULT_PROJECT_VIEW_SETTINGS.FIRST
		? views.find(view => view.viewKind === preferredKind)
		: undefined) ?? views[0]
}

/**
 * Save the current project view to local storage
 */
export function saveProjectView(projectId: IProject['id'], viewId: number) {
	if (!projectId || !viewId) {
		return
	}

	// We use local storage and not the store here to make it persistent across reloads.
	const savedProjectView = localStorage.getItem(SETTINGS_KEY_PROJECT_VIEW)
	let savedProjectViewSettings: ProjectViewSettings | false = false
	if (savedProjectView !== null) {
		savedProjectViewSettings = JSON.parse(savedProjectView) as ProjectViewSettings
	}

	let projectViewSettings: ProjectViewSettings = {}
	if (savedProjectViewSettings) {
		projectViewSettings = savedProjectViewSettings
	}

	projectViewSettings[projectId] = viewId
	localStorage.setItem(SETTINGS_KEY_PROJECT_VIEW, JSON.stringify(projectViewSettings))
}

export function getProjectViewId(projectId: IProject['id']): number {
	const projectViewSettingsString = localStorage.getItem(SETTINGS_KEY_PROJECT_VIEW)
	if (!projectViewSettingsString) {
		return 0
	}

	const projectViewSettings = JSON.parse(projectViewSettingsString) as ProjectViewSettings
	if (isNaN(projectViewSettings[projectId])) {
		return 0
	}
	return projectViewSettings[projectId]
}
