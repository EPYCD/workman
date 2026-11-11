<script setup lang="ts">
import type {IReactionPerEntity, ReactionKind} from '@/modelTypes/IReaction'
import EmojiPicker from '@/components/input/EmojiPicker.vue'
import ReactionService from '@/services/reactions'
import ReactionModel from '@/models/reaction'
import BaseButton from '@/components/base/BaseButton.vue'
import type {IUser} from '@/modelTypes/IUser'
import {getDisplayName} from '@/models/user'
import {useI18n} from 'vue-i18n'
import {nextTick, ref, useId} from 'vue'
import Popup from '@/components/misc/Popup.vue'
import {useAuthStore} from '@/stores/auth'

const props = withDefaults(defineProps<{
	entityKind: ReactionKind,
	entityId: number,
	disabled?: boolean,
}>(), {
	disabled: false,
})

const model = defineModel<IReactionPerEntity>()

const authStore = useAuthStore()
const {t} = useI18n()
const reactionService = new ReactionService()

async function addReaction(value: string) {
	const reaction = new ReactionModel({
		id: props.entityId,
		kind: props.entityKind,
		value,
	})
	await reactionService.create(reaction)
	if (showEmojiPicker.value) closeEmojiPicker()

	if (typeof model.value === 'undefined') {
		model.value = {}
	}

	if (!authStore.info || !model.value) return

	const modelValue = model.value
	if (typeof modelValue[reaction.value] === 'undefined') {
		modelValue[reaction.value] = [authStore.info]
	} else {
		modelValue[reaction.value]!.push(authStore.info)
	}
}

async function removeReaction(value: string) {
	const reaction = new ReactionModel({
		id: props.entityId,
		kind: props.entityKind,
		value,
	})
	await reactionService.delete(reaction)
	if (showEmojiPicker.value) closeEmojiPicker()

	if (!model.value) return

	const modelValue = model.value
	const userIndex = modelValue[reaction.value]?.findIndex(u => u.id === authStore.info?.id) ?? -1
	if (userIndex !== -1) {
		modelValue[reaction.value]!.splice(userIndex, 1)
	}
	if(modelValue[reaction.value]!.length === 0) {
		delete modelValue[reaction.value]
	}
}

function getReactionTooltip(users: IUser[], value: string | number) {
	const names = users.map(u => getDisplayName(u))
	const valueStr = String(value)

	if (names.length === 1) {
		return t('reaction.reactedWith', {user: names[0], value: valueStr})
	}

	if (names.length > 1 && names.length < 10) {
		return t('reaction.reactedWithAnd', {
			users: names.slice(0, names.length - 1).join(', '),
			lastUser: names[names.length - 1],
			value: valueStr,
		})
	}

	return t('reaction.reactedWithAndMany', {
		users: names.slice(0, 10).join(', '),
		num: names.length - 10,
		value: valueStr,
	})
}

const showEmojiPicker = ref(false)
const emojiPickerButtonRef = ref<InstanceType<typeof BaseButton> | null>(null)
const pickerId = useId()

async function closeEmojiPicker() {
	showEmojiPicker.value = false
	await nextTick()
	emojiPickerButtonRef.value?.$el?.focus()
}

function hasCurrentUserReactedWithEmoji(value: string | number): boolean {
	if (!model.value || !authStore.info) return false
	const user = model.value[String(value)]?.find(u => u.id === authStore.info!.id)
	return typeof user !== 'undefined'
}

async function toggleReaction(value: string | number) {
	const valueStr = String(value)
	if (hasCurrentUserReactedWithEmoji(valueStr)) {
		return removeReaction(valueStr)
	}

	return addReaction(valueStr)
}
</script>

<template>
	<div class="reactions">
		<BaseButton
			v-for="(users, value) in (model as IReactionPerEntity)"
			:key="'button' + value"
			v-tooltip="getReactionTooltip(users, value)"
			class="reaction-button"
			:class="{'current-user-has-reacted': hasCurrentUserReactedWithEmoji(value)}"
			:disabled
			@click="toggleReaction(value)"
		>
			{{ value }} {{ users.length }}
		</BaseButton>
		<Popup
			v-if="!disabled"
			v-model:open="showEmojiPicker"
		>
			<template #trigger="{toggle}">
				<BaseButton
					ref="emojiPickerButtonRef"
					v-tooltip="$t('reaction.add')"
					class="reaction-button"
					:aria-expanded="showEmojiPicker"
					:aria-controls="showEmojiPicker ? pickerId : undefined"
					@click.stop="toggle"
				>
					<span class="is-sr-only">{{ $t('reaction.add') }}</span>
					<Icon :icon="['far', 'face-laugh']" />
				</BaseButton>
			</template>
			<template #content>
				<EmojiPicker
					v-if="showEmojiPicker"
					:id="pickerId"
					@select="addReaction"
					@keydown.esc.stop.prevent="closeEmojiPicker"
				/>
			</template>
		</Popup>
	</div>
</template>

<style scoped lang="scss">
.reaction-button {
	margin-inline-end: .25rem;
	margin-block-end: .25rem;
	padding: .175rem .5rem .15rem;
	border: 1px solid var(--grey-400);
	background: var(--grey-100);
	border-radius: 100px;
	font-size: .75rem;

	&.current-user-has-reacted {
		border-color: var(--primary);
		background-color: hsla(var(--primary-h), var(--primary-s), var(--primary-light-l), 0.5);
	}
}

// Workman's Popup has no anchor: it opens below the reactions row.
.reactions {
	position: relative;

	:deep(.popup) {
		inset-block-start: 100%;
	}
}
</style>
