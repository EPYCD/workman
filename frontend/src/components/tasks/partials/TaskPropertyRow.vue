<template>
	<div
		v-if="canWrite || isSet"
		class="property"
		:class="[`property-${name}`, {'is-set': isSet}]"
	>
		<dt :id="`task-property-${name}-label`">
			<Icon :icon="icon" />
			{{ label }}
		</dt>
		<dd>
			<slot />
			<BaseButton
				v-if="removeLabel && isSet && canWrite"
				v-tooltip="removeLabel"
				class="remove"
				:aria-label="removeLabel"
				@click="emit('remove')"
			>
				<Icon icon="times" />
			</BaseButton>
		</dd>
		<slot name="editor" />
	</div>
</template>

<script setup lang="ts">
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
	name: string,
	icon: IconProp,
	label: string,
	isSet: boolean,
	canWrite: boolean,
	removeLabel?: string,
}>()

const emit = defineEmits<{
	remove: [],
}>()
</script>

<style lang="scss" scoped>
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

		// Slotted controls carry the parent's scope id, not this one.
		> :deep(*) {
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

	@media print {
		.remove {
			display: none;
		}
	}

	&:not(.is-set) > dd :deep(select) {
		color: var(--wm-text-tertiary);
		font-style: italic;
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
</style>
