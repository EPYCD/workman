<template>
	<component
		:is="is"
		class="switch-view"
	>
		<slot />
	</component>
</template>

<script setup lang="ts">
import type {Component} from 'vue'

withDefaults(defineProps<{
	is?: string | Component,
}>(), {
	is: 'div',
})
</script>

<style lang="scss" scoped>
// Segmented control: one hairline-outlined strip, mono labels, the active
// segment filled with the accent. Square corners on purpose.
.switch-view {
	display: inline-flex;
	align-items: stretch;
	background: var(--wm-surface);
	border: 1px solid var(--wm-line-strong);
	block-size: var(--wm-control-height);
}

::v-slotted(.switch-view-button) {
	@include mono-label;

	display: inline-flex;
	align-items: center;
	white-space: nowrap;
	padding-inline: var(--wm-space-3);
	color: var(--wm-text-secondary);
	background: transparent;
	transition:
		background-color var(--wm-duration) var(--wm-ease),
		color var(--wm-duration) var(--wm-ease);

	&:not(:first-child) {
		border-inline-start: 1px solid var(--wm-line);
	}

	&:hover {
		background: var(--wm-surface-hover);
		color: var(--wm-text);
	}

	// The ring is drawn by the global :focus-visible rule; lifting the segment
	// keeps it from being painted over by the neighbouring segments.
	&:focus-visible {
		position: relative;
		z-index: 1;
	}

	&.is-active {
		color: var(--wm-on-accent);
		background: var(--wm-accent);
	}
}
</style>
