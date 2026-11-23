<template>
	<form
		ref="formEl"
		v-cy="'timeEntryForm'"
		class="time-entry-form"
		@submit.prevent="saveEntry"
	>
		<div
			v-if="taskId === undefined"
			class="field-columns"
		>
			<div class="field">
				<label class="label">{{ $t('task.attributes.project') }}</label>
				<ProjectSearch v-model="selectedProject" />
			</div>

			<div class="field">
				<label class="label">{{ $t('timeTracking.form.task') }}</label>
				<Multiselect
					v-model="selectedTask"
					:placeholder="$t('timeTracking.form.taskSearch')"
					:loading="taskService.loading"
					:search-results="foundTasks"
					label="title"
					@search="findTasks"
				>
					<template #searchResult="{option}">
						{{ option.title }}
					</template>
				</Multiselect>
			</div>
		</div>
		<p
			v-if="showPrivateHint"
			v-cy="'timeEntryPrivateHint'"
			class="help mbe-3"
		>
			{{ $t('timeTracking.form.privateHint') }}
		</p>

		<div class="field">
			<label class="label">{{ $t('timeTracking.commentLabel') }}</label>
			<input
				v-model="comment"
				v-cy="'timeEntryComment'"
				class="input"
				type="text"
				:placeholder="$t('timeTracking.form.commentPlaceholder')"
			>
		</div>

		<div class="field is-grouped from-to-row">
			<div class="control is-expanded">
				<label class="label">{{ $t('input.datepickerRange.from') }}</label>
				<Datepicker
					v-model="from"
					:show-shortcuts="false"
				/>
			</div>
			<div class="control is-expanded">
				<label class="label">{{ $t('input.datepickerRange.to') }}</label>
				<Datepicker
					v-model="to"
					:show-shortcuts="false"
					:empty-label="$t('misc.notSet')"
				/>
			</div>
			<div class="control">
				<BaseButton
					v-tooltip="$t('timeTracking.form.smartFill')"
					v-cy="'smartFill'"
					class="smart-fill"
					:aria-label="$t('timeTracking.form.smartFill')"
					@click="smartFill"
				>
					<Icon :icon="['far', 'clock']" />
				</BaseButton>
			</div>
		</div>

		<div class="field form-actions">
			<template v-if="isEditing">
				<XButton
					v-cy="'updateTimeEntry'"
					:loading="isSaving"
					@click="saveEntry"
				>
					{{ $t('timeTracking.form.update') }}
				</XButton>
				<XButton
					variant="secondary"
					:disabled="isSaving"
					@click="cancelEdit"
				>
					{{ $t('misc.cancel') }}
				</XButton>
			</template>
			<template v-else>
				<XButton
					v-cy="'saveTimeEntry'"
					:loading="isSaving"
					@click="saveEntry"
				>
					{{ $t('timeTracking.form.save') }}
				</XButton>
				<XButton
					v-cy="'startTimer'"
					variant="secondary"
					:loading="isSaving"
					@click="startTimer"
				>
					{{ $t('timeTracking.form.startTimer') }}
				</XButton>
			</template>
		</div>
		<p
			v-if="backdatedStopAt !== null"
			v-cy="'backdatedStopHint'"
			class="help"
		>
			{{ $t('timeTracking.form.stopsRunningTimerAt', {time: formatDayTime(backdatedStopAt, timeFormat)}) }}
		</p>
	</form>
</template>

<script setup lang="ts">
import {ref, computed, shallowReactive, watch, nextTick} from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import Multiselect from '@/components/input/Multiselect.vue'
import Datepicker from '@/components/input/Datepicker.vue'
import ProjectSearch from '@/components/tasks/partials/ProjectSearch.vue'

import TaskService from '@/services/task'
import TaskModel from '@/models/task'
import {smartFillStart} from '@/helpers/time/smartFillStart'
import {useTimeTrackingStore} from '@/stores/timeTracking'
import {backdatedStop} from '@/helpers/time/backdatedStop'
import {formatDayTime} from '@/helpers/time/formatTimeRange'
import {useTimeFormat} from '@/composables/useTimeFormat'
import {useAuthStore} from '@/stores/auth'
import {useProjectStore} from '@/stores/projects'

import type {IProject} from '@/modelTypes/IProject'
import type {ITask} from '@/modelTypes/ITask'
import type {ITimeEntry} from '@/modelTypes/ITimeEntry'

const props = withDefaults(defineProps<{
	// When set, the entry is locked to this task and the project/task pickers are hidden.
	taskId?: number
	// When set, the form edits this entry (Update + Cancel) instead of creating.
	entry?: ITimeEntry | null
	// Entries the smart-clock looks at to continue from the last one's end.
	recentEntries?: ITimeEntry[]
}>(), {
	taskId: undefined,
	entry: undefined,
	recentEntries: () => [],
})

const emit = defineEmits<{
	saved: []
	cancel: []
}>()

const timeTrackingStore = useTimeTrackingStore()
const authStore = useAuthStore()
const projectStore = useProjectStore()
const {store: timeFormat} = useTimeFormat()

const isEditing = computed(() => props.entry != null)

const formEl = ref<HTMLFormElement | null>(null)
const selectedProject = ref<IProject | null>(null)
const selectedTask = ref<ITask | null>(null)
const start = ref<{date: Date | null, chosen: boolean}>({
	date: new Date(),
	chosen: false,
})
const from = computed({
	get: () => start.value.date,
	set: date => {
		start.value = {
			date,
			chosen: true,
		}
	},
})
const to = ref<Date | null>(null)

const backdatedStopAt = computed(() => {
	const runningStart = timeTrackingStore.activeTimer?.startTime ?? null
	if (isEditing.value || !start.value.chosen || start.value.date === null || runningStart === null) {
		return null
	}
	return backdatedStop(runningStart, start.value.date, new Date())
})
const comment = ref('')
const isSaving = ref(false)

// Mutually exclusive so applyTarget never picks a stale target.
watch(selectedTask, task => {
	if (task !== null) {
		selectedProject.value = null
	}
})
watch(selectedProject, project => {
	if (project !== null) {
		selectedTask.value = null
	}
})

const taskService = shallowReactive(new TaskService())
const foundTasks = ref<ITask[]>([])
async function findTasks(query: string) {
	if (query === '') {
		foundTasks.value = []
		return
	}
	const result = await taskService.getAll({}, {s: query, sort_by: 'done'}) as ITask[]
	foundTasks.value = selectedProject.value === null
		? result
		: result.filter(task => task.projectId === selectedProject.value?.id)
}

// False until the edited entry's container is in the pickers; a failed lookup must not read as "detach".
const containerLoaded = ref(false)
const showPrivateHint = computed(() => props.taskId === undefined
	&& selectedTask.value === null
	&& selectedProject.value === null
	&& (!isEditing.value || containerLoaded.value))

function smartFill() {
	from.value = smartFillStart(
		props.recentEntries,
		authStore.settings.frontendSettings.timeTrackingDefaultStart ?? '09:00',
		new Date(),
	)
	to.value = new Date()
}

function applyTarget(payload: Partial<ITimeEntry>) {
	if (props.taskId !== undefined) {
		payload.taskId = props.taskId
	} else if (selectedTask.value !== null) {
		payload.taskId = selectedTask.value.id
	} else if (selectedProject.value !== null) {
		payload.projectId = selectedProject.value.id
	}
}

function buildPayload(includeEnd: boolean): Partial<ITimeEntry> {
	const payload: Partial<ITimeEntry> = {
		comment: comment.value,
		startTime: from.value ?? new Date(),
	}
	applyTarget(payload)
	// Saving a manual entry always has an end (an empty "To" means "until now");
	// only the Start-timer path omits it to create a running timer.
	if (includeEnd) {
		payload.endTime = to.value ?? new Date()
	}
	return payload
}

function reset() {
	selectedTask.value = null
	selectedProject.value = null
	comment.value = ''
	start.value = {
		date: new Date(),
		chosen: false,
	}
	to.value = null
}

// Prefill from the entry being edited; a null entry returns the form to create mode.
watch(() => props.entry, async entry => {
	containerLoaded.value = false
	if (entry == null) {
		reset()
		return
	}
	comment.value = entry.comment
	from.value = entry.startTime
	to.value = entry.endTime
	// Bring the form into view — the edit button may be far down the list.
	await nextTick()
	formEl.value?.scrollIntoView({behavior: 'smooth', block: 'center'})
	if (props.taskId !== undefined) {
		return
	}
	if (entry.taskId > 0) {
		selectedProject.value = null
		try {
			selectedTask.value = await taskService.get(new TaskModel({id: entry.taskId})) as ITask
			containerLoaded.value = true
		} catch {
			selectedTask.value = null
		}
	} else if (entry.projectId > 0) {
		selectedTask.value = null
		selectedProject.value = (projectStore.projects[entry.projectId] as IProject) ?? null
		containerLoaded.value = selectedProject.value !== null
	} else {
		selectedTask.value = null
		selectedProject.value = null
		containerLoaded.value = true
	}
}, {immediate: true})

// Omitting both keys keeps the server-side container; sending 0 for both detaches it.
function applyContainerChange(payload: Partial<ITimeEntry>, entry: ITimeEntry) {
	if (props.taskId !== undefined) {
		return
	}
	const taskId = selectedTask.value?.id ?? 0
	const projectId = selectedProject.value?.id ?? 0
	const unchanged = taskId === entry.taskId && projectId === entry.projectId
	if (unchanged || (!containerLoaded.value && taskId === 0 && projectId === 0)) {
		return
	}
	payload.taskId = taskId
	payload.projectId = projectId
}

async function submit(includeEnd: boolean) {
	if (isSaving.value) {
		return
	}
	isSaving.value = true
	try {
		const payload = buildPayload(includeEnd)
		// An untouched start would otherwise be when the form loaded, not click time.
		if (!includeEnd && !start.value.chosen) {
			payload.startTime = new Date()
		}
		await timeTrackingStore.createEntry(payload)
		reset()
		emit('saved')
	} finally {
		isSaving.value = false
	}
}

async function submitUpdate() {
	const entry = props.entry
	if (isSaving.value || entry == null) {
		return
	}
	isSaving.value = true
	try {
		const payload: Partial<ITimeEntry> & {id: number} = {
			id: entry.id,
			comment: comment.value,
			startTime: from.value ?? entry.startTime,
			// A running entry stays running (null); a completed one can't be reopened,
			// so keep its end if "To" was cleared (the API rejects clearing it).
			endTime: entry.endTime === null ? to.value : (to.value ?? entry.endTime),
		}
		applyContainerChange(payload, entry)
		await timeTrackingStore.updateEntry(payload)
		emit('saved')
	} finally {
		isSaving.value = false
	}
}

const saveEntry = () => (isEditing.value ? submitUpdate() : submit(true))
const startTimer = () => submit(false)
function cancelEdit() {
	emit('cancel')
}
</script>

<style lang="scss" scoped>
.field-columns {
	display: flex;
	gap: 1rem;

	> .field {
		flex: 1;
		min-inline-size: 0;
	}
}

.from-to-row {
	align-items: flex-end;
}

.smart-fill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	block-size: 2.5em;
	inline-size: 2.5em;
	border-radius: $radius;
	color: var(--primary);
	transition: background-color $transition;

	&:hover {
		background-color: var(--grey-100);
	}
}

.form-actions {
	display: flex;
	gap: .5rem;
}
</style>
