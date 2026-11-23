<script setup lang="ts">
import {onBeforeMount, ref, watch} from 'vue'

import type {IProjectView} from '@/modelTypes/IProjectView'
import type {IFilters} from '@/modelTypes/ISavedFilter'

import {hasFilterQuery} from '@/helpers/filters'

import XButton from '@/components/input/Button.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import FilterEditor from '@/components/input/filter/FilterEditor.vue'
import FormField from '@/components/input/FormField.vue'

const props = withDefaults(defineProps<{
	modelValue: IProjectView,
	loading?: boolean,
	showSaveButtons?: boolean,
}>(), {
	loading: false,
	showSaveButtons: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: IProjectView],
	'cancel': [],
}>()

type LoadedProjectView = Omit<IProjectView, 'filter'> & {filter: IFilters & {include_subprojects: boolean}}

const view = ref<LoadedProjectView>()

const transformFilterFromApi = (filterInput?: IFilters): IFilters => {
	const camelCaseFilter = filterInput as unknown as {
		sortBy?: IFilters['sort_by'],
		orderBy?: IFilters['order_by'],
		filterIncludeNulls?: boolean,
	} | undefined
	// The editor takes and returns the api form of a query; it resolves titles itself.
	const filterString = filterInput?.filter ?? ''

	const filter: IFilters = {
		sort_by: filterInput?.sort_by ?? camelCaseFilter?.sortBy ?? [],
		order_by: filterInput?.order_by ?? camelCaseFilter?.orderBy ?? [],
		filter: '',
		filter_include_nulls: false,
		s: '',
	}
	if (hasFilterQuery(filterString)) {
		filter.filter = filterString
	} else {
		filter.s = filterString
	}

	if (filter.s === '') {
		filter.s = filterInput?.s ?? ''
	}

	if (filter.filter === '') {
		filter.filter = filter.s
	}

	filter.filter_include_nulls = filterInput?.filter_include_nulls
		?? camelCaseFilter?.filterIncludeNulls
		?? false

	return filter
}

function transformViewFromApi(modelValue: IProjectView): LoadedProjectView {
	return {
		...modelValue,
		filter: {
			...transformFilterFromApi(modelValue.filter),
			include_subprojects: modelValue.filter?.include_subprojects ?? false,
		},
		bucketConfiguration: modelValue.bucketConfiguration.map(bc => ({
			title: bc.title,
			filter: transformFilterFromApi(bc.filter),
		})),
	}
}

onBeforeMount(() => {
	const transformed = transformViewFromApi(props.modelValue)

	if (JSON.stringify(view.value) !== JSON.stringify(transformed)) {
		view.value = transformed
	}

	watch(() => view.value?.viewKind, kind => {
		if (kind === 'kanban' && view.value?.bucketConfigurationMode === 'none') {
			view.value.bucketConfigurationMode = 'manual'
		}
	}, {immediate: true})
})

function save() {
	if (!view.value) {
		return
	}

	const transformFilterForApi = (filterInput?: IFilters): IFilters => {
		const filterString = filterInput?.filter || ''
		const filter: IFilters = {
			sort_by: filterInput?.sort_by ?? [],
			order_by: filterInput?.order_by ?? [],
			filter: '',
			filter_include_nulls: filterInput?.filter_include_nulls ?? false,
			s: '',
		}
		if (hasFilterQuery(filterString)) {
			filter.filter = filterString
		} else {
			filter.s = filterString
		}

		return filter
	}

	emit('update:modelValue', {
		...view.value,
		filter: {
			...transformFilterForApi(view.value.filter),
			include_subprojects: view.value.filter.include_subprojects ?? false,
		},
		bucketConfiguration: view.value.bucketConfiguration.map(bc => ({
			title: bc.title,
			filter: transformFilterForApi(bc.filter),
		})),
	})
}

const titleValid = ref(true)

function validateTitle() {
	titleValid.value = view.value?.title !== ''
}

function handleBubbleSave() {
	if (props.showSaveButtons) {
		return
	}

	save()
}
</script>

<template>
	<form
		@focusout="handleBubbleSave"
		@submit.prevent="save"
	>
		<FormField
			id="title"
			v-model="view.title"
			v-focus
			:label="$t('project.views.title')"
			:placeholder="$t('project.share.links.namePlaceholder')"
			:error="titleValid ? null : $t('project.views.titleRequired')"
			@blur="validateTitle"
		/>

		<FormField :label="$t('project.views.kind')">
			<template #default="{ id }">
				<div class="select">
					<select
						:id="id"
						v-model="view.viewKind"
					>
						<option value="list">
							{{ $t('project.list.title') }}
						</option>
						<option value="gantt">
							{{ $t('project.gantt.title') }}
						</option>
						<option value="table">
							{{ $t('project.table.title') }}
						</option>
						<option value="kanban">
							{{ $t('project.kanban.title') }}
						</option>
					</select>
				</div>
			</template>
		</FormField>

		<p class="label">
			{{ $t('project.views.filter') }}
		</p>
		<FilterEditor
			v-model="view.filter.filter"
			:label="$t('project.views.filter')"
			:project-id="view.projectId"
			class="mbe-1"
		/>

		<div
			v-if="view.viewKind !== 'kanban'"
			class="field mbe-3"
		>
			<FancyCheckbox
				v-model="view.filter.include_subprojects"
				v-tooltip="$t('project.views.includeSubprojectsHint')"
			>
				{{ $t('project.views.includeSubprojects') }}
			</FancyCheckbox>
		</div>

		<div class="field mbe-3">
			<FancyCheckbox
				v-model="view.filter.filter_include_nulls"
			>
				{{ $t('filters.attributes.includeNulls') }}
			</FancyCheckbox>
		</div>

		<div
			v-if="view.viewKind === 'kanban'"
			class="field"
		>
			<label
				class="label"
				for="configMode"
			>
				{{ $t('project.views.bucketConfigMode') }}
			</label>
			<div
				id="configMode"
				class="control"
			>
				<label class="radio">
					<input
						v-model="view.bucketConfigurationMode"
						type="radio"
						name="configMode"
						value="manual"
					>
					{{ $t('project.views.bucketConfigManual') }}
				</label>
				<label class="radio">
					<input
						v-model="view.bucketConfigurationMode"
						type="radio"
						name="configMode"
						value="filter"
					>
					{{ $t('project.views.filter') }}
				</label>
			</div>
		</div>

		<div
			v-if="view.viewKind === 'kanban' && view.bucketConfigurationMode === 'filter'"
			class="field"
		>
			<label class="label">
				{{ $t('project.views.bucketConfig') }}
			</label>
			<div class="control">
				<div
					v-for="(b, index) in view.bucketConfiguration"
					:key="'bucket_'+index"
					class="filter-bucket"
				>
					<button
						class="is-danger"
						@click.prevent="() => view.bucketConfiguration.splice(index, 1)"
					>
						<Icon icon="trash-alt" />
					</button>
					<div class="filter-bucket-form">
						<FormField
							:id="'bucket_'+index+'_title'"
							v-model="view.bucketConfiguration[index].title"
							:label="$t('project.views.title')"
							:placeholder="$t('project.share.links.namePlaceholder')"
						/>

						<FilterEditor
							v-model="view.bucketConfiguration[index].filter.filter"
							:label="$t('project.views.bucketFilter', {title: view.bucketConfiguration[index].title})"
							:project-id="view.projectId"
							class="mbe-2"
						/>

						<div class="field mbe-3">
							<FancyCheckbox
								v-model="view.bucketConfiguration[index].filter.filter_include_nulls"
							>
								{{ $t('filters.attributes.includeNulls') }}
							</FancyCheckbox>
						</div>
					</div>
				</div>
				<div class="is-flex is-justify-content-end">
					<XButton
						variant="secondary"
						icon="plus"
						@click="() => view.bucketConfiguration.push({title: '', filter: {filter: '', filter_include_nulls: false}})"
					>
						{{ $t('project.kanban.addBucket') }}
					</XButton>
				</div>
			</div>
		</div>
		<div
			v-if="showSaveButtons"
			class="is-flex is-justify-content-end"
		>
			<XButton
				variant="tertiary"
				class="mie-2"
				@click="emit('cancel')"
			>
				{{ $t('misc.cancel') }}
			</XButton>
			<XButton
				:loading="loading"
				type="submit"
			>
				{{ $t('misc.save') }}
			</XButton>
		</div>
	</form>
</template>

<style scoped lang="scss">
.filter-bucket {
	display: flex;

	button {
		background: transparent;
		border: none;
		color: var(--danger);
		padding-inline-end: var(--wm-space-3);
		cursor: pointer;
	}

	&-form {
		margin-block-end: var(--wm-space-2);
		padding: var(--wm-space-2);
		border: 1px solid var(--wm-line);
		inline-size: 100%;
	}
}

// Ported from bulma-css-variables/sass/form/checkbox-radio.sass
// (the %checkbox-radio placeholder plus the .radio + .radio sibling rule),
// scoped to this component so we can drop the global Bulma import.
label.radio {
	cursor: pointer;
	display: inline-block;
	line-height: 1.25;
	position: relative;

	input {
		cursor: pointer;
	}

	&:hover {
		color: var(--input-hover-color);
	}

	&[disabled],
	input[disabled] {
		color: var(--input-disabled-color);
		cursor: not-allowed;
	}

	& + .radio {
		margin-inline-start: var(--wm-space-2);
	}
}
</style>
