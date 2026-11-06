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
		// Bulma sizes the wrapper to --input-height; the margin matches the date rows' SimpleButton.
		block-size: auto;
		margin-block: .1rem;

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

		.input-wrapper:not(:focus-within) {
			// Beats Multiselect's !important hover border.
			border-color: transparent !important;

			&:not(:hover) {
				background: transparent;
			}
		}
	}

	// The ring goes on the field, not the borderless input inside it.
	.user-is-tabbing & :deep(.multiselect) .input-wrapper:focus-within {
		@include focus-ring;

		.input {
			box-shadow: none;
		}
	}

	:deep(.datepicker) {
		flex: 1;
		min-inline-size: 0;

		.show {
			@include mono-data;

			color: var(--wm-text);
			transition: background-color var(--wm-duration) var(--wm-ease);
			border-radius: 0;
			display: block;
			inline-size: 100%;
			min-block-size: 2rem;
			text-align: start;

			i {
				color: var(--wm-text-tertiary);
			}

			&:hover:not(:disabled) {
				background: var(--wm-surface-hover);
			}
		}
	}

	// The selects' border, so keyboard focus looks the same without moving the text.
	:deep(.datepicker) .show,
	:deep(.reminders .simple-button:not(.option-button)),
	:deep(.property-value-button) {
		border: 1px solid transparent;
		padding: calc(var(--wm-space-1) - 1px) calc(var(--wm-space-2) - 1px);

		&:not(:disabled):focus-visible {
			border-color: var(--wm-accent);
			background: var(--wm-surface-hover);
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
		margin-block: .1rem;
		padding-inline-start: var(--wm-space-2);

		.picker:has(:focus-visible) {
			border-color: var(--wm-accent);
			@include focus-ring;
		}
	}

	:deep(.color-bubble) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		margin: calc(.375rem + .1rem) var(--wm-space-2);
	}

	// 1px border + .25rem padding + 1.375rem avatar = the other rows' 2rem controls.
	:deep(.edit-assignees) {
		.input-wrapper {
			gap: var(--wm-space-1);
			margin-block: .1rem;
			padding: var(--wm-space-1) var(--wm-space-2);
		}

		input {
			block-size: 1.375rem;
			padding: 0;
		}
	}

	// The placeholder alone keeps the other rows' text inset.
	:deep(.edit-assignees.has-assignees) .input-wrapper {
		padding-inline-start: var(--wm-space-1);
	}

	// Read-only list, without the Multiselect wrapper.
	> :deep(.assignees-list) {
		min-block-size: 2rem;
		margin-block: .1rem;
		// The editable field's border + padding.
		padding-inline: calc(var(--wm-space-1) + 1px);
		align-items: center;
	}

	// Overlapping avatars can't wrap, so a long list would overflow the row.
	:deep(.assignees-list) {
		flex-wrap: wrap;
		gap: var(--wm-space-1);

		// Otherwise the wrapper's gap still pushes the input away.
		&:empty {
			display: none;
		}

		.assignee:not(:first-child) {
			margin-inline-start: 0;
		}

		.avatar-wrapper {
			margin-inline-end: 0;
		}

		.avatar {
			inline-size: 1.375rem;
			block-size: 1.375rem;
		}

		.remove-assignee {
			inset-block-start: -.25rem;
			inset-inline: auto -.25rem;
			inline-size: .75rem;
			block-size: .75rem;
			padding: 0;
			font-size: .5rem;
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
