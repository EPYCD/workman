import {shallowRef} from 'vue'

// Task lists load their own pages instead of sharing a cache, so a task restored from the
// trash (e.g. by undoing a delete) needs a nudge to show up in the list that is already open.
// A new object per restore, so restoring the same task twice still notifies watchers.
export const lastRestoredTask = shallowRef<{id: number} | null>(null)

export function notifyTaskRestored(id: number) {
	lastRestoredTask.value = {id}
}
