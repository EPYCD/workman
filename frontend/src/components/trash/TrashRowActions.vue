<template>
	<span class="trash-row-actions">
		<BaseButton
			v-tooltip="$t('trash.restore')"
			v-cy="restoreCy"
			:data-trash-action="TRASH_ROW_ACTION.restore"
			class="trash-action"
			:aria-label="$t('trash.restore')"
			:aria-disabled="pending || undefined"
			@click="emit('restore')"
		>
			<Icon icon="undo" />
		</BaseButton>
		<BaseButton
			v-if="canDeleteForever"
			v-tooltip="$t('trash.deleteForever')"
			v-cy="deleteForeverCy"
			:data-trash-action="TRASH_ROW_ACTION.deleteForever"
			class="trash-action trash-action--danger"
			:aria-label="$t('trash.deleteForever')"
			:aria-disabled="pending || undefined"
			@click="emit('deleteForever')"
		>
			<Icon icon="trash-alt" />
		</BaseButton>
	</span>
</template>

<script lang="ts">
export const TRASH_ROW_ACTION = {
	restore: 'restore',
	deleteForever: 'delete-forever',
} as const

export type RowAction = typeof TRASH_ROW_ACTION[keyof typeof TRASH_ROW_ACTION]
</script>

<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
	pending: boolean,
	canDeleteForever: boolean,
	restoreCy: string,
	deleteForeverCy: string,
}>()

const emit = defineEmits<{
	restore: [],
	deleteForever: [],
}>()
</script>

<style lang="scss" scoped>
.trash-row-actions {
	display: inline-flex;
	gap: var(--wm-space-1);
}

.trash-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 2rem;
	block-size: 2rem;
	color: var(--wm-text-tertiary);
	transition:
		color var(--wm-duration) var(--wm-ease),
		background-color var(--wm-duration) var(--wm-ease);

	&:hover,
	&:focus-visible {
		color: var(--wm-text);
		background-color: var(--wm-surface-hover);
	}

	&--danger:hover,
	&--danger:focus-visible {
		color: var(--danger);
	}

	&[aria-disabled='true'] {
		opacity: .5;
		cursor: progress;
	}
}
</style>
