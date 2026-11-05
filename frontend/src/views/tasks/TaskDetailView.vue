<template>
	<div
		ref="taskViewContainer"
		class="loader-container task-view-container"
		:class="{
			'is-loading': taskService.loading || !visible,
			'is-modal': isModal,
		}"
	>
		<!-- Removing everything until the task is loaded to prevent empty initialization of other components -->
		<div
			v-if="visible"
			class="task-view"
		>
			<BaseButton
				v-if="!isModal"
				class="back-button mbs-2"
				@click="goBack()"
			>
				<Icon icon="arrow-left" />
				{{ $t('task.detail.back') }}
			</BaseButton>
			<Heading
				ref="heading"
				:task="task"
				:can-write="canWrite"
				:has-close="isModal"
				@update:task="Object.assign(task, $event)"
				@close="$emit('close')"
			/>
			<nav
				v-if="project?.id"
				aria-label="Breadcrumb"
				class="subtitle"
			>
				<template
					v-for="p in projectStore.getAncestors(project)"
					:key="p.id"
				>
					<a
						v-if="router.options.history.state?.back?.includes('/projects/'+p.id+'/') || false"
						v-shortcut="p.id === project?.id ? SHORTCUTS.taskDetail.openProject : ''"
						@click="router.back()"
					>
						{{ getProjectTitle(p) }}
					</a>
					<RouterLink
						v-else
						v-shortcut="p.id === project?.id ? SHORTCUTS.taskDetail.openProject : ''"
						:to="{ name: 'project.index', params: { projectId: p.id } }"
					>
						{{ getProjectTitle(p) }}
					</RouterLink>
					<span
						v-if="p.id !== project?.id"
						class="has-text-grey-light"
					> &gt; </span>
				</template>
				<BucketSelect
					:task="task"
					:can-write="canWrite"
					@update:task="Object.assign(task, $event)"
				/>
			</nav>

			<ChecklistSummary :task="task" />

			<div class="columns task-columns mbs-2">
				<div class="column is-two-thirds detail-content">
					<!-- Description -->
					<div class="details content description">
						<Description
							:model-value="task"
							:can-write="canWrite"
							:attachment-upload="attachmentUpload"
							@update:modelValue="Object.assign(task, $event)"
						/>
					</div>

					<!-- Reactions -->
					<Reactions
						v-model="task.reactions"
						entity-kind="tasks"
						:entity-id="task.id"
						class="details d-print-none"
						:disabled="!canWrite"
					/>

					<!-- Attachments -->
					<div
						v-show="activeSections.attachments || hasAttachments"
						class="content attachments"
					>
						<Attachments
							:ref="e => { setFieldRef('attachments', e); attachmentsRef = e as any }"
							:edit-enabled="canWrite"
							:task="task"
							@taskChanged="({coverImageAttachmentId}) => task.coverImageAttachmentId = coverImageAttachmentId"
							@update:attachments="onAttachmentsUpdated"
						/>
					</div>

					<!-- Time Tracking -->
					<div
						v-if="timeTrackingEnabled && activeSections.timeTracking"
						:ref="e => setFieldRef('timeTracking', e)"
						class="content time-tracking"
					>
						<TaskTimeTracking :task-id="task.id" />
					</div>

					<!-- Related Tasks -->
					<div
						v-if="activeSections.relatedTasks"
						class="content details mbe-0"
					>
						<h2 class="task-section-title">
							<span class="icon is-grey">
								<Icon icon="sitemap" />
							</span>
							{{ $t('task.attributes.relatedTasks') }}
						</h2>
						<RelatedTasks
							:ref="e => setFieldRef('relatedTasks', e)"
							:edit-enabled="canWrite"
							:initial-related-tasks="task.relatedTasks"
							:project-id="task.projectId"
							:show-no-relations-notice="true"
							:task-id="taskId"
						/>
					</div>

					<!-- Scope -->
					<div
						v-show="activeSections.scope"
						class="content details"
					>
						<h2 class="task-section-title">
							<span class="icon is-grey">
								<Icon icon="code" />
							</span>
							{{ $t('task.scope.title') }}
						</h2>
						<TaskScopeSection
							v-if="task.id"
							:ref="e => setFieldRef('scope', e)"
							:task-id="task.id"
							:project-id="task.projectId"
							:can-write="canWrite"
							@loaded="hasScope => { if (hasScope) activeSections.scope = true }"
						/>
					</div>

					<!-- Gate receipts -->
					<div
						v-show="hasReceipts"
						class="content details"
					>
						<TaskReceiptsSection
							v-if="task.id"
							:task-id="task.id"
							@loaded="has => hasReceipts = has"
						/>
					</div>

					<!-- Spec references -->
					<div
						v-if="task.id && configStore.marshalUrl"
						class="content details"
					>
						<TaskReferencesSection :task-id="task.id" />
					</div>

					<!-- Move Task -->
					<div
						v-if="activeSections.moveProject"
						class="content details"
					>
						<h2 class="task-section-title">
							<span class="icon is-grey">
								<Icon icon="list" />
							</span>
							{{ $t('task.detail.move') }}
						</h2>
						<div class="field has-addons">
							<div class="control is-expanded">
								<ProjectSearch
									:ref="e => setFieldRef('moveProject', e)"
									:filter="project => project.id !== task.projectId"
									@update:modelValue="changeProject"
								/>
							</div>
						</div>
					</div>

					<!-- Comments -->
					<Comments
						:can-write="canWrite"
						:task-id="taskId"
						:project-id="task.projectId"
						:initial-comments="task.comments"
					/>

					<!-- Marker element for scroll-to-bottom button visibility -->
					<div
						ref="contentBottomMarker"
						class="content-bottom-marker"
					/>
				</div>

				<aside class="column is-one-third action-buttons task-sidebar">
					<div
						v-if="canWrite"
						class="sidebar-toolbar d-print-none"
					>
						<XButton
							v-shortcut="SHORTCUTS.taskDetail.done"
							:class="{'is-pending': !task.done}"
							class="button--mark-done"
							icon="check-double"
							variant="secondary"
							@click="toggleTaskDone()"
						>
							{{ task.done ? $t('task.detail.undone') : $t('task.detail.done') }}
						</XButton>
						<BaseButton
							v-shortcut="SHORTCUTS.taskDetail.favorite"
							v-tooltip="favoriteLabel"
							class="toolbar-icon-button"
							:class="{'is-favorite': task.isFavorite}"
							:aria-label="favoriteLabel"
							:aria-pressed="Boolean(task.isFavorite)"
							@click="toggleFavorite"
						>
							<Icon :icon="task.isFavorite ? 'star' : ['far', 'star']" />
						</BaseButton>
						<Dropdown
							class="task-actions-menu"
							:trigger-label="$t('task.detail.moreActions')"
						>
							<template #trigger="{toggleOpen, open}">
								<BaseButton
									v-tooltip="$t('task.detail.moreActions')"
									v-cy="'taskDetail.moreActions'"
									class="toolbar-icon-button"
									:aria-label="$t('task.detail.moreActions')"
									:aria-expanded="open"
									@click="toggleOpen"
								>
									<Icon icon="ellipsis-h" />
								</BaseButton>
							</template>
							<template #default="{close}">
								<div @click="close">
									<TaskSubscription
										entity="task"
										type="dropdown"
										:entity-id="task.id"
										:model-value="task.subscription"
										@update:modelValue="sub => task.subscription = sub"
									/>
									<DropdownItem
										icon="paperclip"
										@click="openAttachments()"
									>
										{{ $t('task.detail.actions.attachments') }}
									</DropdownItem>
									<DropdownItem
										icon="sitemap"
										@click="setRelatedTasksActive()"
									>
										{{ $t('task.detail.actions.relatedTasks') }}
									</DropdownItem>
									<DropdownItem
										icon="code"
										@click="setFieldActive('scope')"
									>
										{{ $t('task.detail.actions.scope') }}
									</DropdownItem>
									<DropdownItem
										v-if="timeTrackingEnabled"
										v-cy="'taskTrackTimeAction'"
										:icon="['far', 'clock']"
										@click="setFieldActive('timeTracking')"
									>
										{{ $t('task.detail.actions.timeTracking') }}
									</DropdownItem>
									<DropdownItem
										icon="list"
										@click="setFieldActive('moveProject')"
									>
										{{ $t('task.detail.actions.moveProject') }}
									</DropdownItem>
									<DropdownItem
										icon="copy"
										@click="duplicateCurrentTask"
									>
										{{ $t('task.detail.actions.duplicate') }}
									</DropdownItem>
									<hr class="dropdown-divider">
									<DropdownItem
										icon="trash-alt"
										icon-class="has-text-danger"
										class="has-text-danger"
										@click="showDeleteModal = true"
									>
										{{ $t('task.detail.actions.delete') }}
									</DropdownItem>
								</div>
							</template>
						</Dropdown>
					</div>

					<dl
						v-if="canWrite || hasAnyProperty"
						class="property-list"
					>
						<div
							v-if="canWrite || isSet.assignees"
							class="property property-assignees"
							:class="{'is-set': isSet.assignees}"
						>
							<dt>
								<Icon icon="users" />
								{{ $t('task.attributes.assignees') }}
							</dt>
							<dd>
								<EditAssignees
									v-if="canWrite"
									:ref="e => setFieldRef('assignees', e)"
									v-model="task.assignees"
									:project-id="task.projectId"
									:task-id="task.id"
								/>
								<AssigneeList
									v-else
									:assignees="task.assignees"
								/>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.labels"
							class="property property-labels"
							:class="{'is-set': isSet.labels}"
						>
							<dt>
								<Icon icon="tags" />
								{{ $t('task.attributes.labels') }}
							</dt>
							<dd>
								<EditLabels
									:ref="e => setFieldRef('labels', e)"
									v-model="task.labels"
									:disabled="!canWrite"
									:task-id="taskId"
									:creatable="!authStore.isLinkShareAuth"
									:creation-disabled-message="authStore.isLinkShareAuth ? $t('task.label.linkShareCannotCreate') : ''"
								/>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.priority"
							class="property property-priority"
							:class="{'is-set': isSet.priority}"
						>
							<dt>
								<Icon icon="exclamation-circle" />
								{{ $t('task.attributes.priority') }}
							</dt>
							<dd>
								<PrioritySelect
									:ref="e => setFieldRef('priority', e)"
									v-model="task.priority"
									:disabled="!canWrite"
									@update:modelValue="setPriority"
								/>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.percentDone"
							class="property property-percent-done"
							:class="{'is-set': isSet.percentDone}"
						>
							<dt>
								<Icon icon="percent" />
								{{ $t('task.attributes.percentDone') }}
							</dt>
							<dd>
								<PercentDoneSelect
									v-model="task.percentDone"
									:disabled="!canWrite"
									@update:modelValue="setPercentDone"
								/>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.dueDate"
							class="property property-due-date"
							:class="{'is-set': isSet.dueDate}"
						>
							<dt>
								<Icon icon="calendar" />
								{{ $t('task.detail.properties.dueDate') }}
							</dt>
							<dd>
								<Datepicker
									:ref="e => setFieldRef('dueDate', e)"
									v-model="task.dueDate"
									:choose-date-label="$t('task.detail.chooseDueDate')"
									:empty-label="$t('misc.notSet')"
									:disabled="taskService.loading || !canWrite"
									@closeOnChange="saveTask()"
								/>
								<BaseButton
									v-if="isSet.dueDate && canWrite"
									v-tooltip="$t('task.detail.removeDueDate')"
									class="remove"
									:aria-label="$t('task.detail.removeDueDate')"
									@click="() => {task.dueDate = null;saveTask()}"
								>
									<Icon icon="times" />
								</BaseButton>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.startDate"
							class="property property-start-date"
							:class="{'is-set': isSet.startDate}"
						>
							<dt>
								<Icon icon="play" />
								{{ $t('task.detail.properties.startDate') }}
							</dt>
							<dd>
								<Datepicker
									v-model="task.startDate"
									:choose-date-label="$t('task.detail.chooseStartDate')"
									:empty-label="$t('misc.notSet')"
									:disabled="taskService.loading || !canWrite"
									@closeOnChange="saveTask()"
								/>
								<BaseButton
									v-if="isSet.startDate && canWrite"
									v-tooltip="$t('task.detail.removeStartDate')"
									class="remove"
									:aria-label="$t('task.detail.removeStartDate')"
									@click="() => {task.startDate = null;saveTask()}"
								>
									<Icon icon="times" />
								</BaseButton>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.endDate"
							class="property property-end-date"
							:class="{'is-set': isSet.endDate}"
						>
							<dt>
								<Icon icon="stop" />
								{{ $t('task.detail.properties.endDate') }}
							</dt>
							<dd>
								<Datepicker
									v-model="task.endDate"
									:choose-date-label="$t('task.detail.chooseEndDate')"
									:empty-label="$t('misc.notSet')"
									:disabled="taskService.loading || !canWrite"
									@closeOnChange="saveTask()"
								/>
								<BaseButton
									v-if="isSet.endDate && canWrite"
									v-tooltip="$t('task.detail.removeEndDate')"
									class="remove"
									:aria-label="$t('task.detail.removeEndDate')"
									@click="() => {task.endDate = null;saveTask()}"
								>
									<Icon icon="times" />
								</BaseButton>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.reminders"
							class="property property-reminders"
							:class="{'is-set': isSet.reminders}"
						>
							<dt>
								<Icon :icon="['far', 'clock']" />
								{{ $t('task.attributes.reminders') }}
							</dt>
							<dd>
								<Reminders
									:ref="e => setFieldRef('reminders', e)"
									v-model="task.reminders"
									:default-relative-to="remindersDefaultRelativeTo"
									:disabled="!canWrite"
									@update:modelValue="saveTask()"
								/>
							</dd>
						</div>

						<div
							v-if="canWrite || isSet.repeatAfter"
							class="property property-repeat"
							:class="{'is-set': isSet.repeatAfter, 'is-expanded': repeatEditorOpen}"
						>
							<dt id="task-property-repeat-label">
								<Icon icon="history" />
								{{ $t('task.attributes.repeat') }}
							</dt>
							<dd>
								<BaseButton
									id="task-property-repeat-value"
									aria-labelledby="task-property-repeat-label task-property-repeat-value"
									class="property-value-button"
									:class="{'property-empty': !isSet.repeatAfter}"
									:disabled="!canWrite"
									:aria-expanded="canWrite ? repeatEditorOpen : undefined"
									@click="repeatEditorOpen = !repeatEditorOpen"
								>
									{{ repeatSummary }}
									<Icon
										v-if="canWrite"
										icon="chevron-down"
										class="chevron"
									/>
								</BaseButton>
								<BaseButton
									v-if="isSet.repeatAfter && canWrite"
									v-tooltip="$t('task.detail.removeRepeat')"
									class="remove"
									:aria-label="$t('task.detail.removeRepeat')"
									@click="removeRepeatAfter"
								>
									<Icon icon="times" />
								</BaseButton>
							</dd>
							<div
								v-if="repeatEditorOpen && canWrite"
								class="property-editor"
							>
								<RepeatAfter
									v-model="task"
									@update:modelValue="saveTask()"
								/>
							</div>
						</div>

						<div
							v-if="canWrite || isSet.color"
							class="property property-color"
							:class="{'is-set': isSet.color}"
						>
							<dt>
								<Icon icon="fill-drip" />
								{{ $t('task.attributes.color') }}
							</dt>
							<dd>
								<ColorPicker
									v-if="canWrite"
									:ref="e => setFieldRef('color', e)"
									v-model="taskColor"
									:resettable="false"
									@update:modelValue="saveTask()"
								/>
								<ColorBubble
									v-else
									:color="color"
								/>
								<BaseButton
									v-if="isSet.color && canWrite"
									v-tooltip="$t('task.detail.removeColor')"
									class="remove"
									:aria-label="$t('task.detail.removeColor')"
									@click="() => {taskColor = '';saveTask()}"
								>
									<Icon icon="times" />
								</BaseButton>
							</dd>
						</div>
					</dl>

					<!-- Created / Updated [by] -->
					<CreatedUpdated :task="task" />
				</aside>
			</div>
		</div>

		<BaseButton
			v-if="showScrollToCommentsButton"
			v-tooltip="$t('task.detail.scrollToBottom')"
			class="scroll-to-comments-button d-print-none"
			:aria-label="$t('task.detail.scrollToBottom')"
			@click="scrollToBottom"
		>
			<Icon icon="chevron-down" />
		</BaseButton>

		<Modal
			:enabled="showDeleteModal"
			@close="showDeleteModal = false"
			@submit="deleteTask()"
		>
			<template #header>
				<span>{{ $t('task.detail.delete.header') }}</span>
			</template>

			<template #text>
				<p class="tw:text-balance">
					{{ $t('task.detail.delete.text1') }}
				</p>
				<p class="tw:text-balance">
					{{ $t('task.detail.delete.text2') }}
				</p>
			</template>
		</Modal>
	</div>
</template>

<script lang="ts" setup>
import {ref, reactive, shallowReactive, computed, watch, nextTick, onBeforeUnmount, onMounted} from 'vue'
import {useRouter, useRoute, type RouteLocation, onBeforeRouteLeave} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {type MaybeElementRef, unrefElement, useDebounceFn, useElementSize, useIntersectionObserver, useMutationObserver} from '@vueuse/core'
import {klona} from 'klona/lite'

import TaskService from '@/services/task'
import TaskModel from '@/models/task'

import type {ITask} from '@/modelTypes/ITask'
import type {IAttachment} from '@/modelTypes/IAttachment'
import type {IProject} from '@/modelTypes/IProject'

import {PRIORITIES, type Priority} from '@/constants/priorities'
import {PERMISSIONS} from '@/constants/permissions'
import {PRO_FEATURE} from '@/constants/proFeatures'
import {SHORTCUTS} from '@/constants/shortcuts'

import BaseButton from '@/components/base/BaseButton.vue'

// partials
import Attachments from '@/components/tasks/partials/Attachments.vue'
import TaskTimeTracking from '@/components/time-tracking/TaskTimeTracking.vue'
import ChecklistSummary from '@/components/tasks/partials/ChecklistSummary.vue'
import ColorPicker from '@/components/input/ColorPicker.vue'
import Comments from '@/components/tasks/partials/Comments.vue'
import CreatedUpdated from '@/components/tasks/partials/CreatedUpdated.vue'
import Datepicker from '@/components/input/Datepicker.vue'
import Description from '@/components/tasks/partials/Description.vue'
import EditAssignees from '@/components/tasks/partials/EditAssignees.vue'
import EditLabels from '@/components/tasks/partials/EditLabels.vue'
import Heading from '@/components/tasks/partials/Heading.vue'
import ProjectSearch from '@/components/tasks/partials/ProjectSearch.vue'
import PercentDoneSelect from '@/components/tasks/partials/PercentDoneSelect.vue'
import PrioritySelect from '@/components/tasks/partials/PrioritySelect.vue'
import RelatedTasks from '@/components/tasks/partials/RelatedTasks.vue'
import TaskScopeSection from '@/components/tasks/partials/TaskScopeSection.vue'
import TaskReceiptsSection from '@/components/tasks/partials/TaskReceiptsSection.vue'
import TaskReferencesSection from '@/components/tasks/partials/TaskReferencesSection.vue'
import Reminders from '@/components/tasks/partials/Reminders.vue'
import RepeatAfter from '@/components/tasks/partials/RepeatAfter.vue'
import TaskSubscription from '@/components/misc/Subscription.vue'
import Dropdown from '@/components/misc/Dropdown.vue'
import DropdownItem from '@/components/misc/DropdownItem.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'
import BucketSelect from '@/components/tasks/partials/BucketSelect.vue'
import Reactions from '@/components/input/Reactions.vue'

import {uploadFile} from '@/helpers/attachments'
import {getProjectTitle} from '@/helpers/getProjectTitle'
import {getDefaultProjectView, getProjectViewId} from '@/helpers/projectView'
import {scrollIntoView} from '@/helpers/scrollIntoView'
import {TASK_REPEAT_MODES} from '@/types/IRepeatMode'
import {REMINDER_PERIOD_RELATIVE_TO_TYPES} from '@/types/IReminderPeriodRelativeTo'
import {playPopSound} from '@/helpers/playPop'
import {isTypingTarget, matchesKey, parseKey} from '@/helpers/shortcut'
import {secondsToPeriod} from '@/helpers/time/period'
import {SECONDS_A_DAY, SECONDS_A_HOUR, SECONDS_A_MINUTE, SECONDS_A_MONTH, SECONDS_A_WEEK, SECONDS_A_YEAR} from '@/constants/date'
import type {IRepeatAfter, IRepeatType} from '@/types/IRepeatAfter'

import {useTaskStore} from '@/stores/tasks'
import {useKanbanStore} from '@/stores/kanban'
import {useProjectStore} from '@/stores/projects'
import {useAuthStore} from '@/stores/auth'
import {useBaseStore} from '@/stores/base'
import {useConfigStore} from '@/stores/config'

import {useTitle} from '@/composables/useTitle'
import {useTaskDetailShortcuts} from '@/composables/useTaskDetailShortcuts'

import {error, success} from '@/message'
import type {Action as MessageAction} from '@/message'

const props = defineProps<{
	taskId: ITask['id'],
	backdropView?: RouteLocation['fullPath'],
}>()

defineEmits<{
	'close': [],
}>()

const router = useRouter()
const route = useRoute()
const {t} = useI18n({useScope: 'global'})

const projectStore = useProjectStore()
const taskStore = useTaskStore()
const configStore = useConfigStore()
const timeTrackingEnabled = computed(() => configStore.isProFeatureEnabled(PRO_FEATURE.TIME_TRACKING))
const hasReceipts = ref(false)
const kanbanStore = useKanbanStore()
const authStore = useAuthStore()
const baseStore = useBaseStore()

const task = ref<ITask>(new TaskModel())
const hasAttachments = computed(() => (task.value.attachments?.length ?? 0) > 0)
const remindersDefaultRelativeTo = computed(() => {
	if (task.value.dueDate) {
		return REMINDER_PERIOD_RELATIVE_TO_TYPES.DUEDATE
	}
	if (task.value.startDate) {
		return REMINDER_PERIOD_RELATIVE_TO_TYPES.STARTDATE
	}
	if (task.value.endDate) {
		return REMINDER_PERIOD_RELATIVE_TO_TYPES.ENDDATE
	}
	return null
})
const taskNotFound = ref(false)
const taskTitle = computed(() => task.value.title)
useTitle(taskTitle)

const lastProject = computed(() => {
	const backRoute = router.options.history.state?.back
	if (!backRoute || typeof backRoute !== 'string') {
		return null
	}

	const projectMatch = backRoute.match(/\/projects\/(-?\d+)/)
	if (!projectMatch || !projectMatch[1]) {
		return null
	}

	const id = parseInt(projectMatch[1])

	return projectStore.projects[id] ?? null
})

const lastProjectOrTaskProject = computed(() => lastProject.value ?? project.value)

onBeforeRouteLeave(async () => {
	if (taskNotFound.value) {
		return
	}

	if (!lastProjectOrTaskProject.value) {
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				stop()
				resolve()
			}, 5000) // 5 second timeout
			
			const stop = watch(lastProjectOrTaskProject, (p) => {
				if (p) {
					clearTimeout(timeout)
					stop()
					resolve()
				}
			})
		})
	}

	if (lastProjectOrTaskProject.value) {
		await baseStore.handleSetCurrentProjectIfNotSet(lastProjectOrTaskProject.value)
	}
})

// We doubled the task color property here because verte does not have a real change property, leading
// to the color property change being triggered when the # is removed from it, leading to an update,
// which leads in turn to a change... This creates an infinite loop in which the task is updated, changed,
// updated, changed, updated and so on.
// To prevent this, we put the task color property in a separate value which is set to the task color
// when it is saved and loaded.
const taskColor = ref<ITask['hexColor']>('')

// Used to avoid flashing of empty elements if the task content is not yet loaded.
const visible = ref(false)

const project = computed(() => projectStore.projects[task.value.projectId])

const projectRoute = computed(() => ({
	name: 'project.index',
	params: {projectId: task.value.projectId},
	hash: route.hash,
}))

const canWrite = computed(() => (
	task.value.maxPermission !== null &&
	task.value.maxPermission > PERMISSIONS.READ
))

const color = computed(() => {
	const color = task.value.getHexColor
		? task.value.getHexColor()
		: undefined

	return color
})

const isModal = computed(() => Boolean(props.backdropView))

async function attachmentUpload(file: File, onSuccess?: (url: string) => void) {
	const uploaded = await uploadFile(props.taskId, file, onSuccess)
	if (uploaded.length > 0) {
		onAttachmentsUpdated([...task.value.attachments, ...uploaded])
	}
	return uploaded
}

function onAttachmentsUpdated(attachments: IAttachment[]) {
	task.value.attachments = attachments
	kanbanStore.setTaskInBucket({
		...task.value,
		attachments,
	})
}

const heading = ref<HTMLElement | null>(null)

async function scrollToHeading() {
	scrollIntoView(unrefElement(heading))
}

const attachmentsRef = ref<InstanceType<typeof Attachments> | null>(null)

const taskViewContainer = ref<HTMLElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const contentBottomMarker = ref<HTMLElement | null>(null)
const bottomMarkerVisible = ref(true)
const isScrollable = ref(false)

function resolveScrollContainer() {
	// Null after unmount; deferred callers must not fall back to `document` then.
	if (!taskViewContainer.value) {
		return
	}

	let el: HTMLElement | null = taskViewContainer.value

	while (el) {
		const overflowY = getComputedStyle(el).overflowY
		if (['auto', 'scroll', 'overlay'].includes(overflowY)) {
			scrollContainer.value = el
			return
		}
		el = el.parentElement
	}

	scrollContainer.value = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

function updateScrollable() {
	const scroller = scrollContainer.value
	if (!scroller) {
		isScrollable.value = false
		return
	}

	isScrollable.value = scroller.scrollHeight > scroller.clientHeight + 1
}

const showScrollToCommentsButton = computed(() => {
	return isScrollable.value && !bottomMarkerVisible.value
})

function scrollToBottom() {
	if (!contentBottomMarker.value) {
		return
	}

	contentBottomMarker.value.scrollIntoView({
		behavior: 'smooth',
		block: 'end',
		inline: 'nearest',
	})
}

useIntersectionObserver(
	contentBottomMarker,
	([entry]) => {
		bottomMarkerVisible.value = entry?.isIntersecting ?? true
	},
	{threshold: 0.1},
)

const debouncedMutationHandler = useDebounceFn(async () => {
	await nextTick()
	resolveScrollContainer()
	updateScrollable()
}, 100)

useMutationObserver(
	taskViewContainer,
	debouncedMutationHandler,
	{subtree: true, childList: true},
)
onBeforeUnmount(() => debouncedMutationHandler.cancel())

const {height: scrollContainerHeight} = useElementSize(scrollContainer)
watch(scrollContainerHeight, () => updateScrollable())

onMounted(async () => {
	await nextTick()
	resolveScrollContainer()
	updateScrollable()
})

const taskService = shallowReactive(new TaskService())

// load task
watch(
	() => props.taskId,
	async (id) => {
		if (id === undefined) {
			return
		}

		try {
			const expand = ['reactions', 'comments', 'is_unread', 'buckets']
			if (timeTrackingEnabled.value) {
				// Only request the (server-computed) count when the feature is on.
				expand.push('time_entries_count')
			}
			const loaded = await taskService.get({id}, {expand})
			Object.assign(task.value, loaded)
			taskColor.value = task.value.hexColor
			resetSections()

			if (task.value.isUnread) {
				await taskStore.markTaskAsRead(task.value.id)
				task.value.isUnread = false
			}

			if (lastProject.value) {
				await baseStore.handleSetCurrentProjectIfNotSet(lastProject.value)
			}
		} catch (e) {
			// 403 means the task exists but is not visible to us; treat it like
			// a 404 so we route away instead of rendering an empty task shell.
			if (e?.response?.status === 404 || e?.response?.status === 403) {
				taskNotFound.value = true
				router.replace({name: 'not-found'})
				return
			}

			throw e
		} finally {
			await nextTick()
			scrollToHeading()
			resolveScrollContainer()
			updateScrollable()
			visible.value = true
		}
	}, {immediate: true})

type FieldType =
	| 'assignees'
	| 'attachments'
	| 'color'
	| 'dueDate'
	| 'labels'
	| 'moveProject'
	| 'priority'
	| 'relatedTasks'
	| 'reminders'
	| 'scope'
	| 'timeTracking'

// Value fields are always visible in the sidebar; only these sections are revealed on demand.
type SectionType = 'attachments' | 'moveProject' | 'relatedTasks' | 'scope' | 'timeTracking'

const activeSections: Record<SectionType, boolean> = reactive({
	attachments: false,
	moveProject: false,
	relatedTasks: false,
	scope: false,
	timeTracking: false,
})

// Only reveals sections: a save must not hide one the user just opened.
function revealSectionsWithData() {
	activeSections.attachments ||= hasAttachments.value
	activeSections.timeTracking ||= (task.value.timeEntriesCount ?? 0) > 0
	activeSections.relatedTasks ||= Object.keys(task.value.relatedTasks ?? {}).length > 0
}

// Scope is revealed by TaskScopeSection's @loaded once it knows whether the task has one.
function resetSections() {
	for (const section of Object.keys(activeSections) as SectionType[]) {
		activeSections[section] = false
	}
	repeatEditorOpen.value = false
	revealSectionsWithData()
}

const isSet = computed(() => ({
	assignees: (task.value.assignees?.length ?? 0) > 0,
	labels: (task.value.labels?.length ?? 0) > 0,
	priority: task.value.priority !== PRIORITIES.UNSET,
	percentDone: (task.value.percentDone ?? 0) > 0,
	dueDate: task.value.dueDate !== null,
	startDate: task.value.startDate !== null,
	endDate: task.value.endDate !== null,
	reminders: (task.value.reminders?.length ?? 0) > 0,
	repeatAfter: ((task.value.repeatAfter as IRepeatAfter | undefined)?.amount ?? 0) > 0
		|| task.value.repeatMode !== TASK_REPEAT_MODES.REPEAT_MODE_DEFAULT,
	color: Boolean(color.value),
}))
const hasAnyProperty = computed(() => Object.values(isSet.value).some(Boolean))

const favoriteLabel = computed(() => task.value.isFavorite
	? t('task.detail.actions.unfavorite')
	: t('task.detail.actions.favorite'))

const REPEAT_TYPE_SECONDS: Record<IRepeatType, number> = {
	seconds: 1,
	minutes: SECONDS_A_MINUTE,
	hours: SECONDS_A_HOUR,
	days: SECONDS_A_DAY,
	weeks: SECONDS_A_WEEK,
	months: SECONDS_A_MONTH,
	years: SECONDS_A_YEAR,
}

const repeatEditorOpen = ref(false)
const repeatSummary = computed(() => {
	if (!isSet.value.repeatAfter) {
		return t('misc.notSet')
	}
	if (task.value.repeatMode === TASK_REPEAT_MODES.REPEAT_MODE_MONTH) {
		return t('task.repeat.monthly')
	}
	const fromCurrentDate = task.value.repeatMode === TASK_REPEAT_MODES.REPEAT_MODE_FROM_CURRENT_DATE
	const repeatAfter = task.value.repeatAfter as IRepeatAfter | undefined
	// The model splits seconds into months/years too; the summary only knows minutes..weeks.
	const seconds = Math.round((repeatAfter?.amount ?? 0) * REPEAT_TYPE_SECONDS[repeatAfter?.type ?? 'hours'])
	const {unit, amount} = secondsToPeriod(seconds)
	if (amount === 0) {
		return t('task.repeat.fromCurrentDate')
	}
	const interval = t(`task.repeat.summary.${unit}`, {count: amount}, amount)
	return fromCurrentDate
		? t('task.repeat.summary.fromCurrentDate', {interval})
		: interval
})

const activeFieldElements: { [id in FieldType]: HTMLElement | null } = reactive({
	assignees: null,
	attachments: null,
	color: null,
	dueDate: null,
	labels: null,
	moveProject: null,
	priority: null,
	relatedTasks: null,
	reminders: null,
	scope: null,
	timeTracking: null,
})

function setFieldRef(name: FieldType, e: unknown) {
	const element = unrefElement(e as MaybeElementRef)
	activeFieldElements[name] = element instanceof HTMLElement ? element : null
}

const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'

function setFieldActive(fieldName: FieldType) {
	if (fieldName in activeSections) {
		activeSections[fieldName as SectionType] = true
	}
	nextTick(() => {
		const el = activeFieldElements[fieldName]

		if (!el) {
			return
		}

		// Multiselect's tabindex=-1 root forwards focus to its search input.
		const focusable = el.matches(`[tabindex], ${FOCUSABLE}`) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
		focusable?.focus()

		// scroll the field to the center of the screen if not in viewport already
		scrollIntoView(el)
	})
}

// v-shortcut only clicks; these need focus, or live in the closed actions menu.
const fieldShortcuts = ([
	[SHORTCUTS.taskDetail.labels, () => setFieldActive('labels')],
	[SHORTCUTS.taskDetail.priority, () => setFieldActive('priority')],
	[SHORTCUTS.taskDetail.color, () => setFieldActive('color')],
	[SHORTCUTS.taskDetail.assignees, () => setFieldActive('assignees')],
	[SHORTCUTS.taskDetail.dueDate, () => setFieldActive('dueDate')],
	[SHORTCUTS.taskDetail.reminder, () => setFieldActive('reminders')],
	[SHORTCUTS.taskDetail.attachments, () => openAttachments()],
	[SHORTCUTS.taskDetail.relatedTasks, () => setRelatedTasksActive()],
	[SHORTCUTS.taskDetail.moveProject, () => setFieldActive('moveProject')],
	[SHORTCUTS.taskDetail.delete, () => { showDeleteModal.value = true }],
] as const).map(([key, run]) => [parseKey(key), run] as const)

function handleFieldShortcut(event: KeyboardEvent) {
	if (!canWrite.value || event.defaultPrevented || event.repeat || event.isComposing || isTypingTarget(event)) {
		return
	}
	for (const [parsed, run] of fieldShortcuts) {
		if (matchesKey(event, parsed)) {
			event.preventDefault()
			run()
			return
		}
	}
}

onMounted(() => document.addEventListener('keydown', handleFieldShortcut))
onBeforeUnmount(() => document.removeEventListener('keydown', handleFieldShortcut))

function openAttachments() {
	activeSections.attachments = true
	nextTick(() => {
		const el = activeFieldElements.attachments
		if (el) {
			scrollIntoView(el)
		}
		attachmentsRef.value?.openFilePicker()
	})
}

async function saveTask(
	currentTask: ITask | null = null,
	undoCallback?: () => void,
) {
	if (currentTask === null) {
		currentTask = klona(task.value)
	}

	if (!canWrite.value) {
		return
	}

	currentTask.hexColor = taskColor.value

	// If no end date is being set, but a start date and due date,
	// use the due date as the end date
	if (
		currentTask.endDate === null &&
		currentTask.startDate !== null &&
		currentTask.dueDate !== null
	) {
		currentTask.endDate = currentTask.dueDate
	}

	const updatedTask = await taskStore.update(currentTask) // TODO: markraw ?
	Object.assign(task.value, updatedTask)
	revealSectionsWithData()

	let actions: MessageAction[] = []
	if (undoCallback) {
		actions = [{
			title: t('task.undo'),
			callback: undoCallback,
		}]
	}
	success({message: t('task.detail.updateSuccess')}, actions)
}

useTaskDetailShortcuts({
	task: () => task.value,
	taskTitle: () => taskTitle.value,
	onSave: saveTask,
	onDoneAndBack: markDoneAndGoBack,
})

const showDeleteModal = ref(false)

async function deleteTask() {
	await taskStore.delete(task.value)
	success({message: t('task.detail.deleteSuccess')})
	router.push({name: 'project.index', params: {projectId: task.value.projectId}})
}

async function toggleTaskDone() {
	const newTask = {
		...task.value,
		done: !task.value.done,
	}

	if (newTask.done) {
		playPopSound()
	}

	await saveTask(
		newTask,
		toggleTaskDone,
	)
}

async function markDoneAndGoBack() {
	if (!canWrite.value || task.value.done) {
		return
	}

	// Keydown handlers bypass Vue's errorHandler, so surface save errors here.
	try {
		await toggleTaskDone()
	} catch (e) {
		error(e)
		return
	}
	goBack()
}

function goBack() {
	if (lastProject.value) {
		router.back()
		return
	}
	router.push(projectRoute.value)
}

async function changeProject(project: IProject | null) {
	if (project === null) {
		return
	}
	kanbanStore.removeTaskInBucket(task.value)
	await saveTask({
		...task.value,
		projectId: project.id,
	})
	baseStore.setCurrentProject(project)
}

async function toggleFavorite() {
	const newTask = await taskStore.toggleFavorite(task.value)
	Object.assign(task.value, newTask)
}

async function duplicateCurrentTask() {
	const duplicatedTask = await taskStore.duplicateTask(task.value.id)
	if (duplicatedTask) {
		success({message: t('task.detail.duplicateSuccess')})
		router.push({
			name: 'task.detail',
			params: {id: duplicatedTask.id},
		})
	}
}

async function setPriority(priority: Priority) {
	const newTask: ITask = {
		...task.value,
		priority,
	}

	return saveTask(newTask)
}

async function setPercentDone(percentDone: number) {
	const newTask: ITask = {
		...task.value,
		percentDone,
	}

	return saveTask(newTask)
}

async function removeRepeatAfter() {
	task.value.repeatAfter.amount = 0
	task.value.repeatMode = TASK_REPEAT_MODES.REPEAT_MODE_DEFAULT
	await saveTask()
}

function setRelatedTasksActive() {
	setFieldActive('relatedTasks')

	// If the related tasks are already available, show the form again
	const el = activeFieldElements['relatedTasks']
	if (!el) {
		return
	}
	for (const child of Array.from(el.children)) {
		if ((child as HTMLElement).id === 'showRelatedTasksFormButton') {
			(child as HTMLElement).click()
			break
		}
	}
}
</script>

<style lang="scss" scoped>
.task-view-container {
	// simulate sass lighten($primary, 30) by increasing lightness 30% to 73%
	--primary-light: hsla(var(--primary-h), var(--primary-s), 73%, var(--primary-a));
	padding-block-end: 0;

	@media screen and (min-width: $desktop) {
		padding-block-end: var(--wm-space-4);
	}
}

.task-view {
	padding-block-start: var(--wm-space-4);
	padding-inline: var(--wm-space-2);
	background-color: var(--wm-canvas);

	@media screen and (min-width: $desktop) {
		padding: var(--wm-space-4);
	}
}

.is-modal .task-view {
	border-radius: 0;
	padding: var(--wm-space-4);
	color: var(--wm-text);
	background-color: var(--wm-canvas) !important;
}

.task-view * {
	transition: opacity var(--wm-duration-fast) var(--wm-ease);
}

.is-loading .task-view * {
	opacity: 0;
}


// The breadcrumb is positional data, so it reads as data: mono, quiet, tight.
.subtitle {
	@include mono-data;

	font-size: var(--wm-text-xs);
	color: var(--wm-text-tertiary);
	margin-block-end: var(--wm-space-4);

	a {
		color: var(--wm-text-secondary);
		transition: color var(--wm-duration) var(--wm-ease);

		&:hover {
			color: var(--wm-accent-text);
		}
	}
}

h2 .button {
	vertical-align: middle;
}

.icon.is-grey {
	color: var(--wm-text-tertiary);
}

.details {
	padding-block-end: var(--wm-space-3);
	margin-block-end: 0;
}

:deep(.details),
:deep(.heading) {
	.input:not(.has-defaults),
	.textarea,
	.select:not(.has-defaults) select {
		cursor: pointer;
		transition: all var(--wm-duration) var(--wm-ease);

		&::placeholder {
			color: var(--wm-text-tertiary);
			opacity: 1;
			font-style: italic;
		}

		&:not(:disabled) {
			&:hover,
			&:active,
			&:focus {
				background: var(--wm-surface);
				border-color: var(--wm-line);
				cursor: text;
			}

			&:hover,
			&:active {
				cursor: text;
				border-color: var(--wm-accent);
			}
		}
	}

	.select:not(.has-defaults):after {
		opacity: 0;
	}

	.select:not(.has-defaults):hover:after {
		opacity: 1;
	}
}

.attachments {
	margin-block-end: 0;

	table tr:last-child td {
		border-inline-end: none;
	}
}

// keep the title clear of the modal's fixed close button
.is-modal .heading {
	@media screen and (min-width: $tablet) and (max-width: $desktop) {
		padding-inline-end: 3.5rem;
	}
}

.checklist-summary {
	padding-inline-start: var(--wm-space-1);
}

.detail-content {
	@media print {
		inline-size: 100% !important;
	}
}

// Bulma stacks columns as blocks on narrow screens, so flex is needed for `order`.
.task-columns {
	@media screen and (max-width: $tablet), print {
		display: flex;
		flex-direction: column;
	}
}

// Not sticky: the list can outgrow the viewport and its popups open downwards.
.task-sidebar {
	container: task-sidebar / inline-size;

	@media screen and (max-width: $tablet), print {
		order: -1;
	}

	@media print {
		inline-size: 100% !important;

		.property:not(.is-set),
		.remove,
		.chevron,
		:deep(.multiselect input),
		:deep(.remove-assignee),
		:deep(.tag .delete),
		:deep(.reminders .remove),
		:deep(.reminders > :not(.reminder-input)) {
			display: none;
		}
	}
}

.sidebar-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
	gap: var(--wm-space-2);
	margin-block-end: var(--wm-space-3);

	.button--mark-done {
		flex: 1 1 10rem;
		justify-content: flex-start;
		text-align: start;
		background-color: transparent;
		box-shadow: none;

		// The affirmative action, but still an outlined control: a solid
		// green fill here was the loudest thing on the page and outranked
		// the crimson that is supposed to own the hierarchy. Green stays as
		// the semantic signal, carried by the border and the label.
		&.is-pending {
			border-color: var(--success);
			color: var(--success);

			&:hover,
			&:focus-visible {
				background-color: hsla(var(--wm-success-h), var(--wm-success-s), var(--wm-success-l), .16);
				border-color: var(--success);
				color: var(--success);
			}

			&:focus-visible {
				outline-color: var(--success);
			}
		}
	}
}

// Square outlined controls beside mark-done, same height as the buttons.
.toolbar-icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: var(--wm-control-height);
	min-block-size: var(--wm-control-height);
	border: 1px solid var(--wm-line-control);
	color: var(--wm-text-secondary);
	background: transparent;
	transition:
		color var(--wm-duration) var(--wm-ease),
		background-color var(--wm-duration) var(--wm-ease),
		border-color var(--wm-duration) var(--wm-ease);

	&:hover,
	&:focus-visible {
		color: var(--wm-text);
		border-color: var(--wm-line-strong);
		background: var(--wm-surface-hover);
	}

	&:focus-visible {
		@include focus-ring;
	}

	&.is-favorite {
		color: var(--warning);
		border-color: color-mix(in srgb, var(--warning) 40%, transparent);
		background: color-mix(in srgb, var(--warning) 10%, transparent);
	}
}

.property-list {
	margin: 0;
	border-block-start: 1px solid var(--wm-line-faint);
}

.property {
	display: grid;
	grid-template-columns: minmax(6rem, 7.5rem) 1fr;
	column-gap: var(--wm-space-2);
	align-items: start;
	padding-block: var(--wm-space-1);
	border-block-end: 1px solid var(--wm-line-faint);

	// Every attribute is captioned like an instrument dial.
	dt {
		@include mono-label;

		display: flex;
		align-items: center;
		gap: var(--wm-space-2);
		// Line up the label with the value's first line, whose control has its own vertical padding.
		min-block-size: 2rem;
		color: var(--wm-text-tertiary);
		transition: color var(--wm-duration) var(--wm-ease);

		svg {
			inline-size: .75rem;
			flex-shrink: 0;
			transition: color var(--wm-duration) var(--wm-ease);
		}
	}

	dd {
		min-inline-size: 0;
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--wm-space-1);

		> * {
			min-inline-size: 0;
		}
	}

	// Between tablet and desktop the column is too narrow for label and value side by side.
	@container task-sidebar (inline-size < 19rem) {
		grid-template-columns: 1fr;

		dt {
			min-block-size: 1.5rem;
		}
	}

	// A set value lifts its caption; the accent stays reserved for the primary action.
	&.is-set dt {
		color: var(--wm-text-secondary);
	}

	.remove,
	:deep(.reminders .remove),
	:deep(.remove-assignee) {
		color: var(--wm-text-tertiary);
		line-height: 1;
		padding: var(--wm-space-1);
		transition:
			opacity var(--wm-duration) var(--wm-ease),
			color var(--wm-duration) var(--wm-ease);

		&:hover,
		&:focus-visible {
			color: var(--danger);
		}
	}

	@media (hover: hover) {
		.remove,
		:deep(.reminders .remove),
		:deep(.remove-assignee) {
			opacity: 0;
		}

		&:hover,
		&:focus-within {
			.remove,
			:deep(.reminders .remove),
			:deep(.remove-assignee) {
				opacity: 1;
			}
		}
	}

	&:not(.is-set) > dd :deep(select) {
		color: var(--wm-text-tertiary);
		font-style: italic;
	}
}

.property-empty {
	color: var(--wm-text-tertiary);
	font-style: italic;
}

.property-value-button {
	display: inline-flex;
	align-items: center;
	gap: var(--wm-space-2);
	flex: 1;
	min-block-size: 2rem;
	padding: var(--wm-space-1) var(--wm-space-2);
	text-align: start;
	color: var(--wm-text);
	transition: background-color var(--wm-duration) var(--wm-ease);

	.chevron {
		inline-size: .625rem;
		color: var(--wm-text-tertiary);
		transition: transform var(--wm-duration) var(--wm-ease);
	}

	&:not(:disabled):hover {
		background: var(--wm-surface-hover);
	}

	.is-expanded & .chevron {
		transform: rotate(180deg);
	}
}

.property-editor {
	grid-column: 1 / -1;
	padding: var(--wm-space-1) 0 var(--wm-space-1) var(--wm-space-2);
	border-inline-start: 2px solid var(--wm-line);
	margin-block-start: var(--wm-space-1);

	// Bulma addons don't shrink, which pushes the unit select out of the narrow sidebar.
	:deep(.field.has-addons) {
		min-inline-size: 0;

		.control:first-child {
			flex: 1 1 auto;
			min-inline-size: 0;
		}
	}
}

.property > dd {
	:deep(.select) {
		inline-size: 100%;

		select {
			inline-size: 100%;
			background: transparent;
			border-color: transparent;
			box-shadow: none;
			block-size: 2rem;
			padding-block: 0;
			padding-inline-start: var(--wm-space-2);
			line-height: 2rem;
		}

		&:not(.has-defaults):after {
			opacity: 0;
		}

		&:hover:not(.has-defaults):after {
			opacity: 1;
		}

		select:disabled {
			color: var(--wm-text);
			opacity: 1;
			cursor: default;
		}

		&:has(select:disabled)::after {
			display: none;
		}

		select:not(:disabled) {
			cursor: pointer;

			&:hover,
			&:focus {
				background: var(--wm-surface-hover);
				border-color: var(--wm-line);
			}

			&:focus-visible {
				border-color: var(--wm-accent);
				@include focus-ring;
			}
		}
	}

	:deep(.multiselect) {
		inline-size: 100%;
		min-inline-size: 0;

		input {
			flex: 1 1 5rem;
			min-inline-size: 5rem;
			inline-size: auto;
			text-overflow: ellipsis;
		}

		.tag {
			max-inline-size: 100%;

			> span {
				min-inline-size: 0;
				overflow: hidden;
				text-overflow: ellipsis;
			}
		}

		.input-wrapper {
			&:not(:focus-within, :hover) {
				background: transparent;
				border-color: transparent;
			}
		}
	}

	:deep(.datepicker) {
		flex: 1;
		min-inline-size: 0;

		.show {
			@include mono-data;

			color: var(--wm-text);
			padding: var(--wm-space-1) var(--wm-space-2);
			transition: background-color var(--wm-duration) var(--wm-ease);
			border-radius: 0;
			display: block;
			inline-size: 100%;
			min-block-size: 2rem;
			text-align: start;

			i {
				color: var(--wm-text-tertiary);
			}

			&:hover {
				background: var(--wm-surface-hover);
			}
		}

		&.disabled .show:hover {
			background: transparent;
		}
	}

	:deep(.reminders) {
		inline-size: 100%;

		.reminder-input:last-child {
			margin-block-end: 0;
		}
	}

	:deep(.color-picker-container) {
		justify-content: flex-start;
		min-block-size: 2rem;
		padding-inline-start: var(--wm-space-2);
	}

	:deep(.color-bubble) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		margin: .375rem var(--wm-space-2);
	}

	// Overlapping avatars can't wrap, so a long list would overflow the row.
	:deep(.assignees-list) {
		flex-wrap: wrap;
		gap: .375rem;
		padding-block-start: var(--wm-space-1);

		.assignee:not(:first-child) {
			margin-inline-start: 0;
		}

		.remove-assignee {
			inset-block-start: -.25rem;
			inset-inline: auto -.375rem;
			inline-size: 1rem;
			block-size: 1rem;
			padding: 0;
			font-size: .625rem;
			box-shadow: var(--shadow-sm);
		}

		.user {
			margin: 0;
		}

		.username {
			display: none;
		}
	}
}

:deep(.created) {
	@include mono-data;

	margin-block-start: var(--wm-space-4);
	font-size: var(--wm-text-xs);
	color: var(--wm-text-tertiary);
	text-align: start;
}

.scroll-to-comments-button {
	position: fixed;
	// Position above the keyboard shortcuts button (which is at bottom: calc(1rem - 4px))
	inset-block-end: calc(var(--bottom-banners-end-height, 0px) + 2.5rem);
	inset-inline-end: var(--wm-space-3);
	z-index: 10;
	inline-size: 2rem;
	block-size: 2rem;
	border-radius: var(--wm-radius-full);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	background-color: var(--wm-surface-raised);
	border: 1px solid var(--wm-line);
	color: var(--wm-text-secondary);
	box-shadow: var(--shadow-md);
	transition:
		background-color var(--wm-duration) var(--wm-ease),
		color var(--wm-duration) var(--wm-ease),
		border-color var(--wm-duration) var(--wm-ease);

	&:hover {
		background-color: var(--wm-surface-hover);
		border-color: var(--wm-line-strong);
		color: var(--wm-text);
	}

	@media screen and (max-width: $tablet) {
		// Hide on mobile since keyboard shortcuts button is also hidden
		display: none;
	}
}
</style>

<style lang="scss">
// global style to override position when the modal task detail is active
.modal-content .scroll-to-comments-button {
	inset-block-end: .75rem;
	inset-inline-end: 1rem;
}

// the task card spans the full width here, so the modal's white close button sits on it instead of the scrim
@media screen and (min-width: $tablet) and (max-width: $desktop) {
	.modal-dialog:has(.task-view-container.is-modal) .modal-container > .close {
		color: var(--text);
	}
}
</style>
