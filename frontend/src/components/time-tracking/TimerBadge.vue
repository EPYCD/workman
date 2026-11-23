<template>
	<div
		v-if="timeTrackingStore.hasActiveTimer"
		v-cy="'timerBadge'"
		class="timer-badge"
	>
		<RouterLink
			:to="{ name: 'time-tracking' }"
			class="timer-badge__elapsed"
			:title="$t('timeTracking.title')"
		>
			{{ elapsed }}
			<span
				v-if="timeTrackingStore.activeTimer && isPrivateEntry(timeTrackingStore.activeTimer)"
				class="timer-badge__label"
			>
				{{ $t('timeTracking.noProject') }}
			</span>
		</RouterLink>
		<BaseButton
			v-tooltip="$t('timeTracking.stop')"
			v-cy="'stopTimer'"
			class="timer-badge__stop"
			:aria-label="$t('timeTracking.stop')"
			@click="stop"
		>
			<Icon icon="stop" />
		</BaseButton>
	</div>
</template>

<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import {useTimeTrackingStore} from '@/stores/timeTracking'
import {useConfigStore} from '@/stores/config'
import {PRO_FEATURE} from '@/constants/proFeatures'
import {useElapsed} from '@/composables/useElapsed'
import {isPrivateEntry} from '@/services/timeEntry'

const timeTrackingStore = useTimeTrackingStore()
const configStore = useConfigStore()

const elapsed = useElapsed(() => timeTrackingStore.activeTimer?.startTime)

const isStopping = ref(false)
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

onMounted(() => {
	// The badge lives in the always-mounted header, so it owns the app-wide timer
	// sync. Subscribing is harmless when the feature is off (no events are emitted);
	// only the hydrate hits the gated endpoint, so guard that.
	timeTrackingStore.subscribeToTimerEvents()
	if (configStore.isProFeatureEnabled(PRO_FEATURE.TIME_TRACKING)) {
		timeTrackingStore.hydrateActiveTimer()
	}
})

onUnmounted(() => {
	timeTrackingStore.unsubscribeFromTimerEvents()
})
</script>

<style lang="scss" scoped>
.timer-badge {
	display: inline-flex;
	align-items: center;
	gap: .25rem;
	white-space: nowrap;
}

.timer-badge__elapsed {
	padding-inline: var(--wm-space-3) var(--wm-space-1);
	color: var(--wm-accent-text);
	font-family: $workman-mono-font;
	font-size: var(--wm-text-xs);
	font-variant-numeric: tabular-nums;
	font-weight: 500;
}

.timer-badge__label {
	margin-inline-start: .25rem;
	color: var(--grey-600);
	font-weight: normal;
}

.timer-badge__stop {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding-inline: var(--wm-space-2);
	color: var(--wm-text-tertiary);
	transition: color var(--wm-duration) var(--wm-ease);

	&:hover {
		color: var(--danger-text);
	}
}
</style>
