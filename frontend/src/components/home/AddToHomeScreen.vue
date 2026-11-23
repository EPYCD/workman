<template>
	<div
		v-if="shouldShowMessage"
		class="add-to-home-screen"
	>
		<Icon
			icon="arrow-up-from-bracket"
			class="add-icon"
		/>
		<p>
			{{ $t('home.addToHomeScreen') }}
		</p>
		<BaseButton
			:aria-label="$t('misc.closeBanner')"
			class="hide-button"
			@click="() => hideMessage = true"
		>
			<Icon icon="x" />
		</BaseButton>
	</div>
</template>

<script lang="ts" setup>
import BaseButton from '@/components/base/BaseButton.vue'
import {useLocalStorage} from '@vueuse/core'
import {computed} from 'vue'
import {useAuthStore} from '@/stores/auth'

const authStore = useAuthStore()

const hideMessage = useLocalStorage('hideAddToHomeScreenMessage', false)

const shouldShowMessage = computed(() => {
	if (!authStore.authenticated) {
		return false
	}

	if (hideMessage.value) {
		return false
	}

	if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
		return false
	}

	return true
})
</script>

<style lang="scss" scoped>
.add-to-home-screen {
	inline-size: fit-content;
	max-inline-size: calc(100% - 2 * var(--wm-space-4));
	margin: 0 auto var(--wm-space-4);

	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--wm-space-4);
	padding-block: var(--wm-space-2);
	padding-inline: var(--wm-space-4);
	background: var(--wm-surface-raised);
	color: var(--wm-text);
	font-size: var(--wm-text-sm);

	// The banner floats, but a chamfered element can't carry a box-shadow —
	// the outline traces the cut instead.
	@include chamfer(var(--wm-chamfer-sm), bottom-right);
	@include chamfer-outline(var(--wm-line-strong));

	@media screen and (min-width: $tablet) {
		display: none;
	}

	@media print {
		display: none;
	}
}

.add-icon {
	color: var(--wm-accent-text);
}

.hide-button {
	padding-block: var(--wm-space-1);
	padding-inline: var(--wm-space-2);
	cursor: pointer;
	color: var(--wm-text-tertiary);
	transition: color var(--wm-duration) var(--wm-ease);

	&:hover,
	&:focus-visible {
		color: var(--wm-text);
	}
}
</style>
