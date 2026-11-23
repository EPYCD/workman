<script lang="ts" setup>
import {computed, ref, watch} from 'vue'

import type {IWebhook} from '@/modelTypes/IWebhook'
import WebhookModel from '@/models/webhook'
import BaseButton from '@/components/base/BaseButton.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import FormField from '@/components/input/FormField.vue'
import FormInput from '@/components/input/FormInput.vue'
import Expandable from '@/components/base/Expandable.vue'
import User from '@/components/misc/User.vue'
import {formatDateShort} from '@/helpers/time/formatDate'
import {isValidHttpUrl} from '@/helpers/isValidHttpUrl'

const props = defineProps<{
	webhooks: IWebhook[]
	availableEvents: string[]
	loading?: boolean
}>()

const emit = defineEmits<{
	create: [webhook: IWebhook]
	delete: [webhookId: number]
}>()

defineOptions({name: 'WebhookManager'})

const showNewForm = ref(false)
const showBasicAuth = ref(false)
const newWebhook = ref(new WebhookModel())
const newWebhookEvents = ref<Record<string, boolean>>({})

function initEvents(events: string[]) {
	newWebhookEvents.value = Object.fromEntries(
		events.map(event => [event, false]),
	)
}

watch(() => props.availableEvents, (events) => {
	if (events) initEvents(events)
}, {immediate: true})

const webhookTargetUrlValid = ref(true)
const selectedEventsValid = ref(true)
const showDeleteModal = ref(false)
const webhookIdToDelete = ref<number>()

function validateTargetUrl() {
	webhookTargetUrlValid.value = isValidHttpUrl(newWebhook.value.targetUrl)
}

const eventGroups = computed(() => {
	const groups: Record<string, string[]> = {}
	for (const event of props.availableEvents) {
		const group = event.split('.')[0]
		groups[group] ??= []
		groups[group].push(event)
	}
	return groups
})

function allSelected(events: string[]) {
	return events.length > 0 && events.every(event => newWebhookEvents.value[event])
}

function setEventsSelected(events: string[], selected: boolean) {
	for (const event of events) {
		newWebhookEvents.value[event] = selected
	}
	validateSelectedEvents()
}

function getSelectedEventsArray() {
	return Object.entries(newWebhookEvents.value)
		.filter(([, use]) => use)
		.map(([event]) => event)
}

function validateSelectedEvents() {
	const events = getSelectedEventsArray()
	selectedEventsValid.value = events.length > 0
}

function create() {
	validateTargetUrl()
	if (!webhookTargetUrlValid.value) {
		return
	}

	const selectedEvents = getSelectedEventsArray()
	newWebhook.value.events = selectedEvents

	validateSelectedEvents()
	if (!selectedEventsValid.value) {
		return
	}

	emit('create', newWebhook.value)
	newWebhook.value = new WebhookModel()
	initEvents(props.availableEvents)
	showNewForm.value = false
}

function confirmDelete(webhookId: number) {
	webhookIdToDelete.value = webhookId
	showDeleteModal.value = true
}

function doDelete() {
	if (webhookIdToDelete.value) {
		emit('delete', webhookIdToDelete.value)
	}
	showDeleteModal.value = false
}
</script>

<template>
	<div>
		<XButton
			v-if="!(webhooks?.length === 0 || showNewForm)"
			icon="plus"
			class="mbe-4"
			@click="showNewForm = true"
		>
			{{ $t('project.webhooks.create') }}
		</XButton>

		<div
			v-if="webhooks?.length === 0 || showNewForm"
			class="p-4"
		>
			<FormField
				id="targetUrl"
				v-model="newWebhook.targetUrl"
				:label="$t('project.webhooks.targetUrl')"
				required
				:placeholder="$t('project.webhooks.targetUrl')"
				:error="webhookTargetUrlValid ? null : $t('project.webhooks.targetUrlInvalid')"
				@focusout="validateTargetUrl"
			/>
			<FormField :label="$t('project.webhooks.secret')">
				<template #default="{id}">
					<FormInput
						:id="id"
						v-model="newWebhook.secret"
					/>
				</template>
			</FormField>
			<p class="help">
				{{ $t('project.webhooks.secretHint') }}
				<BaseButton href="https://vikunja.io/docs/webhooks/">
					{{ $t('project.webhooks.secretDocs') }}
				</BaseButton>
			</p>
			<BaseButton
				class="mbe-2 has-text-primary"
				@click="showBasicAuth = !showBasicAuth"
			>
				{{ $t('project.webhooks.basicauthlink') }}
			</BaseButton>
			<Expandable
				:open="showBasicAuth"
				class="content"
			>
				<FormField :label="$t('project.webhooks.basicauthuser')">
					<template #default="{id}">
						<FormInput
							:id="id"
							v-model="newWebhook.basicAuthUser"
						/>
					</template>
				</FormField>
				<FormField :label="$t('project.webhooks.basicauthpassword')">
					<template #default="{id}">
						<FormInput
							:id="id"
							v-model="newWebhook.basicAuthPassword"
						/>
					</template>
				</FormField>
			</Expandable>
			<div class="field">
				<label
					class="label"
					for="events"
				>
					{{ $t('project.webhooks.events') }}
				</label>
				<p class="help">
					{{ $t('project.webhooks.eventsHint') }}
				</p>
				<div class="control">
					<FancyCheckbox
						:model-value="allSelected(availableEvents)"
						class="webhook-events-select-all has-text-weight-bold"
						@update:modelValue="checked => setEventsSelected(availableEvents, checked)"
					>
						{{ $t('project.webhooks.selectAllEvents') }}
					</FancyCheckbox>
					<div
						v-for="(events, group) in eventGroups"
						:key="group"
						class="webhook-events-group"
					>
						<FancyCheckbox
							:model-value="allSelected(events)"
							class="webhook-events-group-toggle is-capitalized has-text-weight-bold"
							@update:modelValue="checked => setEventsSelected(events, checked)"
						>
							{{ group }}
						</FancyCheckbox>
						<div class="mis-4">
							<FancyCheckbox
								v-for="event in events"
								:key="event"
								v-model="newWebhookEvents[event]"
								class="available-events-check"
								@update:modelValue="validateSelectedEvents"
							>
								{{ event }}
							</FancyCheckbox>
						</div>
					</div>
				</div>
				<p
					v-if="!selectedEventsValid"
					class="help is-danger"
				>
					{{ $t('project.webhooks.mustSelectEvents') }}
				</p>
			</div>
			<XButton
				icon="plus"
				@click="create"
			>
				{{ $t('project.webhooks.create') }}
			</XButton>
		</div>

		<table
			v-if="webhooks?.length > 0"
			class="table has-actions is-striped is-hoverable is-fullwidth"
		>
			<thead>
				<tr>
					<th>{{ $t('project.webhooks.targetUrl') }}</th>
					<th>{{ $t('project.webhooks.events') }}</th>
					<th>{{ $t('misc.created') }}</th>
					<th>{{ $t('misc.createdBy') }}</th>
					<th />
				</tr>
			</thead>
			<tbody>
				<tr
					v-for="w in webhooks"
					:key="w.id"
				>
					<td class="webhook-target-url">
						{{ w.targetUrl }}
					</td>
					<td>{{ w.events.join(', ') }}</td>
					<td>{{ formatDateShort(w.created) }}</td>
					<td>
						<User
							:avatar-size="25"
							:user="w.createdBy"
						/>
					</td>

					<td class="actions">
						<XButton
							danger
							icon="trash-alt"
							:aria-label="$t('project.webhooks.delete')"
							@click="() => confirmDelete(w.id)"
						/>
					</td>
				</tr>
			</tbody>
		</table>

		<Modal
			:enabled="showDeleteModal"
			@close="showDeleteModal = false"
			@submit="doDelete()"
		>
			<template #header>
				<span>{{ $t('project.webhooks.delete') }}</span>
			</template>

			<template #text>
				<p>{{ $t('project.webhooks.deleteText') }}</p>
			</template>
		</Modal>
	</div>
</template>

<style lang="scss" scoped>
.available-events-check {
	margin-inline-end: .5rem;
	inline-size: 12.5rem;
}

// Webhook URLs have no break opportunities, so without this the cell's min-content
// width forces the whole table wider than its container.
.webhook-target-url {
	overflow-wrap: anywhere;
}
</style>
