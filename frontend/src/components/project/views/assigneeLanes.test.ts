import {describe, expect, it} from 'vitest'

import {buildAssigneeLanes, type LaneContext} from './assigneeLanes'
import type {IBucket} from '@/modelTypes/IBucket'
import type {ITask} from '@/modelTypes/ITask'

const AKSHAT = {id: 7, username: 'akshat', name: 'Akshat'}
const SUBIN = {id: 8, username: 'subin', name: 'Subin'}

function task(id: number, assignees: unknown[] = [], leases = 0): ITask {
	return {id, title: `task ${id}`, assignees, leases: Array(leases).fill({})} as unknown as ITask
}

// A Done column as the board actually sees it: 122 tasks on the server, a page
// of them loaded.
function doneBucket(loaded: ITask[]): IBucket {
	return {id: 9, title: 'Done', count: 122, limit: 0, tasks: loaded} as unknown as IBucket
}

function ctx(counts: Record<string, number>, leases: Record<string, number> = {}): LaneContext {
	return {
		totals: Object.fromEntries(Object.entries(counts).map(([k, count]) => [k, {count, leases: leases[k] ?? 0}])),
		ownerByUserId: {},
		labelByUserId: {7: 'Akshat', 8: 'Subin'},
		displayName: (u: {name?: string, username?: string}) => u.name || u.username || '',
		unassignedLabel: 'Unassigned',
	}
}

describe('buildAssigneeLanes', () => {
	it('counts a lane over the whole bucket, not over the loaded cards', () => {
		// Two of Akshat's nine have loaded. Counting the cards gave 2 here, and
		// 3 after the next page arrived, and both looked like totals.
		const lanes = buildAssigneeLanes(
			doneBucket([task(1, [AKSHAT]), task(2, [AKSHAT])]),
			ctx({'9:7': 9, '9:0': 110}),
		)

		const akshat = lanes.find(l => l.key === 'user-7')
		expect(akshat).toBeDefined()
		expect(akshat!.total).toBe(9)
		expect(akshat!.tasks).toHaveLength(2)
	})

	it('shows a person whose tasks have not loaded at all', () => {
		// Subin holds three in this column and none of them are in the loaded
		// page. Building lanes from the cards dropped the lane entirely, which
		// reads as "nobody else is working here".
		const lanes = buildAssigneeLanes(
			doneBucket([task(1, [AKSHAT])]),
			ctx({'9:7': 9, '9:8': 3}),
		)

		const subin = lanes.find(l => l.key === 'user-8')
		expect(subin).toBeDefined()
		expect(subin!.total).toBe(3)
		expect(subin!.tasks).toHaveLength(0)
		expect(subin!.label).toBe('Subin')
	})

	it('counts a shared task in both lanes', () => {
		const lanes = buildAssigneeLanes(
			doneBucket([task(1, [AKSHAT, SUBIN])]),
			ctx({'9:7': 1, '9:8': 1}),
		)

		expect(lanes.find(l => l.key === 'user-7')!.tasks).toHaveLength(1)
		expect(lanes.find(l => l.key === 'user-8')!.tasks).toHaveLength(1)
	})

	it('keeps the unassigned lane last and counts it from the server too', () => {
		const lanes = buildAssigneeLanes(
			doneBucket([task(1, [AKSHAT]), task(2)]),
			ctx({'9:7': 9, '9:0': 110}),
		)

		expect(lanes[lanes.length - 1].key).toBe('unassigned')
		expect(lanes[lanes.length - 1].total).toBe(110)
	})

	it('shows the unassigned lane when none of its tasks have loaded', () => {
		const lanes = buildAssigneeLanes(doneBucket([task(1, [AKSHAT])]), ctx({'9:7': 9, '9:0': 110}))

		expect(lanes[lanes.length - 1].key).toBe('unassigned')
		expect(lanes[lanes.length - 1].tasks).toHaveLength(0)
	})

	it('leaves out a lane the server reports as empty', () => {
		const lanes = buildAssigneeLanes(doneBucket([]), ctx({'9:7': 0, '9:0': 0}))

		expect(lanes).toHaveLength(0)
	})

	it('survives a bucket that has no tasks array yet', () => {
		// The board hands over a bucket without tasks while it is still
		// loading, and the filter-configured views build buckets without them
		// at all. Reading .length off that threw and took the whole board down.
		const loading = {id: 9, title: 'Done', count: 122, limit: 0} as unknown as IBucket

		expect(() => buildAssigneeLanes(loading, ctx({'9:7': 9}))).not.toThrow()
		expect(buildAssigneeLanes(loading, ctx({'9:7': 9}))[0].total).toBe(9)
	})

	it('ignores totals belonging to another bucket', () => {
		const lanes = buildAssigneeLanes(doneBucket([]), ctx({'7:8': 40}))

		expect(lanes).toHaveLength(0)
	})

	it('takes the lease count from the server, not from the loaded cards', () => {
		// Two loaded cards carry three leases between them; the nine tasks in
		// the lane carry eleven. Summing the cards gave 3, which is the same
		// partial answer the task count was giving.
		const lanes = buildAssigneeLanes(
			doneBucket([task(1, [AKSHAT], 2), task(2, [AKSHAT], 1)]),
			ctx({'9:7': 9}, {'9:7': 11}),
		)

		expect(lanes.find(l => l.key === 'user-7')!.leases).toBe(11)
	})
})
