<template>
	<Multiselect
		v-model="assignees"
		class="edit-assignees"
		:class="{'has-assignees': assignees.length > 0}"
		:loading="projectUserService.loading || userService.loading"
		:placeholder="placeholder ?? (assignees.length > 0 ? $t('task.assignee.placeholderMore') : $t('task.assignee.placeholder'))"
		:multiple="true"
		:search-results="foundUsers"
		:show-empty="true"
		label="name"
		:select-placeholder="$t('task.assignee.selectPlaceholder')"
		:autocomplete-enabled="false"
		@search="findUser"
		@select="addAssignee"
		@focusin="preloadUsers"
	>
		<template #items="{items}">
			<AssigneeList
				:assignees="items"
				:disabled="disabled"
				can-remove
				@remove="removeAssignee"
			/>
		</template>
		<template #searchResult="{option: user}">
			<User
				:avatar-size="24"
				:show-username="true"
				:user="user"
			/>
		</template>
	</Multiselect>
</template>

<script setup lang="ts">
import {ref, shallowReactive, watch, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'

import User from '@/components/misc/User.vue'
import Multiselect from '@/components/input/Multiselect.vue'

import {includesById} from '@/helpers/utils'
import ProjectUserService from '@/services/projectUsers'
import UserService from '@/services/user'
import {success} from '@/message'
import {useAuthStore} from '@/stores/auth'
import {useTaskStore} from '@/stores/tasks'

import type {IUser} from '@/modelTypes/IUser'
import {getDisplayName} from '@/models/user'
import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'

const props = withDefaults(defineProps<{
	modelValue: IUser[] | undefined,
	// Without a task the picker only edits its model, e.g. as a filter input.
	taskId?: number,
	// Without a project it searches all users.
	projectId?: number,
	disabled?: boolean,
	filter?: (user: IUser) => boolean,
	placeholder?: string,
}>(), {
	taskId: 0,
	projectId: 0,
	disabled: false,
	filter: () => true,
	placeholder: undefined,
})

const emit = defineEmits<{
	'update:modelValue': [value: IUser[] | undefined],
}>()

const authStore = useAuthStore()
const taskStore = useTaskStore()
const {t} = useI18n({useScope: 'global'})

const projectUserService = shallowReactive(new ProjectUserService())
const userService = shallowReactive(new UserService())
const foundUsers = ref<IUser[]>([])
const assignees = ref<IUser[]>([])
let isAdding = false

let hasPreloaded = false

function preloadUsers() {
	if (hasPreloaded) return
	hasPreloaded = true
	findUser()
}

watch(
	() => props.modelValue,
	(value) => {
		assignees.value = value
	},
	{
		immediate: true,
		deep: true,
	},
)

async function addAssignee(user: IUser) {
	if (props.taskId === 0) {
		emit('update:modelValue', assignees.value)
		return
	}

	if (isAdding) {
		return
	}

	try {
		nextTick(() => isAdding = true)

		await taskStore.addAssignee({user: user, taskId: props.taskId})
		emit('update:modelValue', assignees.value)
		success({message: t('task.assignee.assignSuccess')})
	} finally {
		nextTick(() => isAdding = false)
	}
}

async function removeAssignee(user: IUser) {
	if (props.taskId !== 0) {
		await taskStore.removeAssignee({user: user, taskId: props.taskId})
	}

	assignees.value = (assignees.value ?? []).filter(a => a.id !== user.id)
	emit('update:modelValue', assignees.value)
	if (props.taskId !== 0) {
		success({message: t('task.assignee.unassignSuccess')})
	}
}

async function findUser(query = '') {
	let response: IUser[]
	if (props.projectId > 0) {
		response = await projectUserService.getAll({projectId: props.projectId} as unknown as IUser, {s: query}) as IUser[]
	} else if (query !== '') {
		response = await userService.getAll({} as IUser, {s: query}) as IUser[]
	} else {
		// The global user search needs something to search for.
		response = []
	}

	const currentUserId = authStore.info?.id

	// Filter the results to not include users who are already assigned
	foundUsers.value = response
		.filter(props.filter)
		.filter(({id}) => !includesById(assignees.value, id))
		.map(u => {
			// Users may not have a display name set, so we fall back on the username in that case
			u.name = getDisplayName(u)
			return u
		})
		.sort((a, b) => {
			if (a.id === currentUserId) return -1
			if (b.id === currentUserId) return 1
			return a.name.localeCompare(b.name)
		})
}
</script>

<style lang="scss">
.edit-assignees.has-assignees.multiselect .input {
	padding-inline-start: 0;
}
</style>
