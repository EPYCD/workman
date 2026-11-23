import {computed, type ComputedGetter, type DeepReadonly} from 'vue'
import {useRouteQuery} from '@vueuse/router'

import type {IProjectView} from '@/modelTypes/IProjectView'

export const INCLUDE_SUBPROJECTS_QUERY_PARAM = 'include_subprojects'

// Views read from a store are readonly.
export type IncludeSubprojectsView = IProjectView | DeepReadonly<IProjectView> | null | undefined

// The view's own flag is only the default; toggling writes a query param instead.
export function useIncludeSubprojects(
	viewGetter: ComputedGetter<IncludeSubprojectsView>,
) {
	// The api ors the view's own setting in, so the query param cannot turn it back off.
	const fromView = computed(() => viewGetter()?.filter?.include_subprojects ?? false)
	const param = useRouteQuery<string | undefined>(INCLUDE_SUBPROJECTS_QUERY_PARAM)

	const includeSubprojects = computed({
		get: () => param.value === undefined ? fromView.value : param.value === 'true',
		set: (value: boolean) => {
			param.value = value === fromView.value ? undefined : String(value)
		},
	})

	const overridesView = computed(() => includeSubprojects.value && !fromView.value)

	return {
		includeSubprojects,
		fromView,
		overridesView,
		queryParam: computed(() => param.value),
	}
}
