import type {IBucket} from '@/modelTypes/IBucket'
import type {ITask} from '@/modelTypes/ITask'

export interface AssigneeLane {
	key: string
	label: string
	owner: string | null
	tasks: ITask[]
	// How many path leases those tasks hold, from the server for the same
	// reason `total` is: summing the leases of the loaded cards answers a
	// different question.
	leases: number
	// How many tasks this person holds in the bucket, from the server.
	// `tasks` is only what has been loaded so far, and the two differ whenever
	// the column is longer than a page.
	total: number
}

export interface LaneTotals {
	count: number
	leases: number
}

export interface LaneContext {
	// `${bucketId}:${userId}` -> totals, with userId 0 for unassigned.
	totals: Record<string, LaneTotals>
	// The human behind a bot account, when there is one.
	ownerByUserId: Record<number, string>
	// Names for people the loaded cards never mention.
	labelByUserId: Record<number, string>
	displayName: (user: ITask['assignees'][number]) => string
	unassignedLabel: string
}

// buildAssigneeLanes groups a bucket's loaded cards by who holds them, and
// takes every count from the server rather than from the cards.
//
// The board can only hold a page of a column — 25 cards against a Done column
// of 122 — so a lane counted from what is on screen answers "how many have
// loaded", while looking exactly like an answer to "how many does this person
// have". That is how a lane read 4, then 5 on the next load, when the figure
// was 9 both times.
export function buildAssigneeLanes(bucket: IBucket, ctx: LaneContext): AssigneeLane[] {
	const totalsFor = (userId: number) => ctx.totals[`${bucket.id}:${userId}`] ?? {count: 0, leases: 0}

	const lanes = new Map<string, AssigneeLane>()
	const unassignedTotals = totalsFor(0)
	const unassigned: AssigneeLane = {
		key: 'unassigned',
		label: ctx.unassignedLabel,
		owner: null,
		tasks: [],
		leases: unassignedTotals.leases,
		total: unassignedTotals.count,
	}

	// The board hands over a bucket without tasks while it is still loading.
	for (const task of bucket.tasks ?? []) {
		if (task.assignees.length === 0) {
			unassigned.tasks.push(task)
			continue
		}
		for (const user of task.assignees) {
			const key = `user-${user.id}`
			let lane = lanes.get(key)
			if (!lane) {
				const totals = totalsFor(user.id)
				lane = {
					key,
					label: ctx.displayName(user),
					owner: ctx.ownerByUserId[user.id] ?? null,
					tasks: [],
					leases: totals.leases,
					total: totals.count,
				}
				lanes.set(key, lane)
			}
			lane.tasks.push(task)
		}
	}

	// Somebody whose tasks are all further down the column has no loaded card
	// to build a lane from. Leaving them out is how a column of 122 shows three
	// people when five are working in it — the most confident kind of wrong.
	for (const [key, totals] of Object.entries(ctx.totals)) {
		const [bucketID, userID] = key.split(':').map(Number)
		if (bucketID !== bucket.id || userID === 0 || totals.count === 0 || lanes.has(`user-${userID}`)) {
			continue
		}
		lanes.set(`user-${userID}`, {
			key: `user-${userID}`,
			label: ctx.labelByUserId[userID] ?? `#${userID}`,
			owner: ctx.ownerByUserId[userID] ?? null,
			tasks: [],
			leases: totals.leases,
			total: totals.count,
		})
	}

	const out = [...lanes.values()].sort((a, b) => a.label.localeCompare(b.label))
	if (unassigned.tasks.length > 0 || unassigned.total > 0) {
		out.push(unassigned)
	}
	return out
}
