import {computed, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {useIntervalFn} from '@vueuse/core'

/**
 * A ticking `h:mm:ss` / `mm:ss` label for the time since startTime, or '' without one.
 */
export function useElapsed(startTime: MaybeRefOrGetter<Date | string | null | undefined>) {
	const now = ref(new Date())
	useIntervalFn(() => {
		now.value = new Date()
	}, 1000)
	return computed(() => {
		const raw = toValue(startTime)
		const start = raw ? new Date(raw) : null
		if (start === null || Number.isNaN(start.getTime())) {
			return ''
		}
		const seconds = Math.max(0, Math.floor((now.value.getTime() - start.getTime()) / 1000))
		const pad = (n: number) => n.toString().padStart(2, '0')
		const hours = Math.floor(seconds / 3600)
		const mmss = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
		return hours >= 1 ? `${hours}:${mmss}` : mmss
	})
}
