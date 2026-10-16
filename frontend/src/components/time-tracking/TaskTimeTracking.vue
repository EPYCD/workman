<template>
	<div class="task-time-tracking">
		<XButton
			v-if="entries.length > 0"
			v-tooltip="$t('timeTracking.logTime')"
			v-cy="'addTaskTimeEntry'"
			:aria-label="$t('timeTracking.logTime')"
			class="is-pulled-end add-time-entry-button d-print-none"
			:class="{'is-active': showForm}"
			variant="secondary"
			icon="plus"
			:shadow="false"
			@click="showForm = !showForm"
		/>
		<h2 class="task-section-title">
			<span class="icon is-grey">
				<Icon :icon="['far', 'clock']" />
			</span>
			{{ $t('timeTracking.title') }}
		</h2>
		<div
			v-if="runningTimer"
			v-cy="'taskRunningTimer'"
			class="running-timer"
		>
			<span class="has-text-grey">{{ $t('timeTracking.running') }}</span>
			<span class="running-timer__elapsed">{{ elapsed }}</span>
			<span
				v-if="runningTimer.comment"
				class="running-timer__comment has-text-grey"
			>{{ runningTimer.comment }}</span>
			<XButton
				v-cy="'stopTaskTimer'"
				class="running-timer__stop"
				variant="secondary"
				icon="stop"
				:shadow="false"
				:loading="isStopping"
				@click="stop"
			>
				{{ $t('timeTracking.stop') }}
			</XButton>
		</div>
		<TimeEntryForm
			v-if="formVisible"
			:task-id="taskId"
			:entry="editingEntry"
			:recent-entries="entries"
			@saved="onSaved"
			@cancel="editingEntry = null"
		/>
		<TimeEntryList
			class="mbs-4"
			:entries="entries"
			:card="false"
			:empty-text="$t('timeTracking.list.emptyTask')"
			hide-label-column
			@edit="editingEntry = $event"
			@delete="onDelete"
		/>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'

import TimeEntryForm from '@/components/time-tracking/TimeEntryForm.vue'
import TimeEntryList from '@/components/time-tracking/TimeEntryList.vue'

import {useTimeEntryService} from '@/services/timeEntry'
import {useTimeTrackingStore} from '@/stores/timeTracking'
import {useElapsed} from '@/composables/useElapsed'

import type {ITimeEntry} from '@/modelTypes/ITimeEntry'

const props = defineProps<{
	taskId: number
}>()

const timeTrackingStore = useTimeTrackingStore()
const entries = ref<ITimeEntry[]>([])
const runningTimer = computed(() => timeTrackingStore.activeTimer?.taskId === props.taskId ? timeTrackingStore.activeTimer : null)
const elapsed = useElapsed(() => runningTimer.value?.startTime)
const isStopping = ref(false)
const editingEntry = ref<ITimeEntry | null>(null)
const showForm = ref(false)

// Like related tasks: the form is implicit when empty, otherwise behind the +.
const formVisible = computed(() => entries.value.length === 0 || showForm.value || editingEntry.value !== null)

async function load() {
	const {items} = await useTimeEntryService().getAll({
		filter: `task_id = ${props.taskId}`,
		perPage: 250,
	})
	entries.value = items
}

async function stop() {
	if (isStopping.value) {
		return
	}
	isStopping.value = true
	try {
		await timeTrackingStore.stopTimer()
	} finally {
		isStopping.value = false
	}
}

async function onSaved() {
	editingEntry.value = null
	showForm.value = false
	await load()
}

async function onDelete(id: number) {
	await timeTrackingStore.removeEntry(id)
	await load()
}

watch(() => props.taskId, load, {immediate: true})
// The header badge can start/stop the timer without going through this form;
// reload so the row reflects the stop (its new end time).
watch(() => timeTrackingStore.activeTimer, load)
</script>

<style lang="scss" scoped>
.add-time-entry-button {
	svg {
		transition: transform $transition;
	}

	&.is-active svg {
		transform: rotate(45deg);
	}
}

.running-timer {
	display: flex;
	align-items: center;
	gap: .5rem;
	margin-block-end: 1rem;
}

.running-timer__elapsed {
	color: var(--primary);
	font-variant-numeric: tabular-nums;
	font-weight: 600;
}

.running-timer__comment {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.running-timer__stop {
	margin-inline-start: auto;
}
</style>
