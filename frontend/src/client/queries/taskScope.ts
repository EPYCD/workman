import {toValue, type MaybeRefOrGetter} from 'vue'
import {queryOptions, useMutation} from '@tanstack/vue-query'

import {
	projectsAgents,
	projectsLeasesList,
	projectsViewsAssigneeCounts,
	projectsViewsReadiness,
	tasksLeasesRelease,
	tasksScopeUpdate,
	tasksScopeRead,
} from '@/client/generated'
import type {BucketAssigneeCount, ProjectAgent, TaskPathLease, TaskReadiness, TaskScope, TaskScopeWritable} from '@/client/generated'
import {queryClient} from '@/client/queryClient'

export const scopeKeys = {
	all: ['task-scope'] as const,
	task: (taskId: number) => ['task-scope', 'task', taskId] as const,
	projectLeases: (projectId: number) => ['task-scope', 'leases', projectId] as const,
	projectAgents: (projectId: number) => ['task-scope', 'agents', projectId] as const,
	readiness: (projectId: number, viewId: number) => ['task-scope', 'readiness', projectId, viewId] as const,
	assigneeCounts: (projectId: number, viewId: number) => ['task-scope', 'assignee-counts', projectId, viewId] as const,
}

export type ScopeList = 'paths_owned' | 'paths_affected' | 'endpoints'

export const READINESS_REASON = {
	DONE: 'done',
	ASSIGNED: 'assigned',
	BLOCKED: 'blocked',
	LEASE_CONFLICT: 'lease_conflict',
} as const

export function emptyScope(taskId: number): TaskScope {
	return {task_id: taskId, paths_owned: [], paths_affected: [], endpoints: [], notes: ''}
}

// The server omits a list it has nothing for; the editor wants arrays.
function normaliseScope(scope: TaskScope, taskId: number): TaskScope {
	return {
		...scope,
		task_id: scope.task_id ?? taskId,
		paths_owned: scope.paths_owned ?? [],
		paths_affected: scope.paths_affected ?? [],
		endpoints: scope.endpoints ?? [],
		notes: scope.notes ?? '',
	}
}

export function taskScopeQuery(taskId: number) {
	return queryOptions({
		queryKey: scopeKeys.task(taskId),
		queryFn: async () => {
			const {data} = await tasksScopeRead({path: {projecttask: taskId}})
			return normaliseScope(data, taskId)
		},
		staleTime: 30 * 1000,
	})
}

export interface LeaseList {
	items: TaskPathLease[]
	// What the server says the project holds. Kept because a header that shows
	// items.length is only right while the endpoint returns everything, and
	// nothing on the client can tell when that stops being true.
	total: number
}

export function projectLeasesQuery(projectId: number) {
	return queryOptions({
		queryKey: scopeKeys.projectLeases(projectId),
		queryFn: async (): Promise<LeaseList> => {
			const {data} = await projectsLeasesList({path: {project: projectId}})
			const items = data.items ?? []
			return {items, total: data.total ?? items.length}
		},
		staleTime: 15 * 1000,
	})
}

// Who is working in the project; bots carry the human behind them so the
// board can say "bot-alice · for Alice" instead of an opaque bot name.
export function projectAgentsQuery(projectId: number) {
	return queryOptions({
		queryKey: scopeKeys.projectAgents(projectId),
		queryFn: async (): Promise<ProjectAgent[]> => {
			const {data} = await projectsAgents({path: {project: projectId}})
			return data.items ?? []
		},
		staleTime: 30 * 1000,
	})
}

export function viewReadinessQuery(projectId: number, viewId: number) {
	return queryOptions({
		queryKey: scopeKeys.readiness(projectId, viewId),
		queryFn: async (): Promise<TaskReadiness[]> => {
			const {data} = await projectsViewsReadiness({path: {project: projectId, view: viewId}})
			return data.items ?? []
		},
		staleTime: 15 * 1000,
	})
}

// How many tasks each person holds in each bucket, counted over the whole
// bucket rather than the page of it a board has loaded.
//
// A column of 122 loads 25 at a time, so a lane counted from the cards on
// screen reads 4, then 5, then more as somebody scrolls — and every one of
// those looks like a total.
export function viewAssigneeCountsQuery(projectId: number, viewId: number) {
	return queryOptions({
		queryKey: scopeKeys.assigneeCounts(projectId, viewId),
		queryFn: async (): Promise<BucketAssigneeCount[]> => {
			const {data} = await projectsViewsAssigneeCounts({path: {project: projectId, view: viewId}})
			return data.items ?? []
		},
		staleTime: 15 * 1000,
	})
}

export interface LaneTotals {
	count: number
	leases: number
}

// Keyed by `${bucketId}:${userId}`, with userId 0 for the unassigned lane.
export function assigneeCountsByLane(rows: BucketAssigneeCount[]): Record<string, LaneTotals> {
	const out: Record<string, LaneTotals> = {}
	for (const row of rows) {
		out[`${row.bucket_id ?? 0}:${row.user_id ?? 0}`] = {count: row.count ?? 0, leases: row.leases ?? 0}
	}
	return out
}

export interface TaskReadinessWithRank extends TaskReadiness {
	// 1-based position among the ready tasks, in the order agents pick them
	// (the bucket's drag order); undefined when the task is not ready.
	rank?: number
}

export function readinessByTask(rows: TaskReadiness[]): Record<number, TaskReadinessWithRank> {
	const out: Record<number, TaskReadinessWithRank> = {}
	let rank = 0
	for (const row of rows) {
		if (!row.task?.id) {
			continue
		}
		out[row.task.id] = row.ready ? {...row, rank: ++rank} : row
	}
	return out
}

export function invalidateReadiness(projectId: number, viewId?: number) {
	return queryClient.invalidateQueries({
		queryKey: viewId ? scopeKeys.readiness(projectId, viewId) : ['task-scope', 'readiness', projectId],
	})
}

function invalidateLeaseViews(projectId: number) {
	return Promise.all([
		queryClient.invalidateQueries({queryKey: scopeKeys.projectLeases(projectId)}),
		queryClient.invalidateQueries({queryKey: scopeKeys.projectAgents(projectId)}),
		invalidateReadiness(projectId),
	])
}

export function useUpdateTaskScope(taskId: MaybeRefOrGetter<number>, projectId: MaybeRefOrGetter<number>) {
	return useMutation({
		mutationFn: async (scope: TaskScopeWritable) => {
			const id = toValue(taskId)
			const {data} = await tasksScopeUpdate({path: {projecttask: id}, body: scope})
			return normaliseScope(data, id)
		},
		onSuccess: async (scope) => {
			queryClient.setQueryData(scopeKeys.task(toValue(taskId)), scope)
			await invalidateLeaseViews(toValue(projectId))
		},
	})
}

export function useReleaseTaskLeases(taskId: MaybeRefOrGetter<number>, projectId: MaybeRefOrGetter<number>) {
	return useMutation({
		mutationFn: async () => {
			await tasksLeasesRelease({path: {projecttask: toValue(taskId)}})
		},
		onSuccess: () => invalidateLeaseViews(toValue(projectId)),
	})
}
