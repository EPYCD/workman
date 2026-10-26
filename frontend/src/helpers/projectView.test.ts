import {describe, expect, it} from 'vitest'
import type {IProjectView} from '@/modelTypes/IProjectView'

import {getDefaultProjectView} from './projectView'

const views = [
	{
		id: 1,
		viewKind: 'list',
	},
	{
		id: 2,
		viewKind: 'kanban',
	},
] as IProjectView[]

describe('getDefaultProjectView', () => {
	it('uses the first view when configured', () => {
		expect(getDefaultProjectView(views, 'first')).toBe(views[0])
	})

	it('selects the preferred view kind', () => {
		expect(getDefaultProjectView(views, 'kanban')).toBe(views[1])
	})

	it('falls back to the first view when the preferred kind is missing', () => {
		expect(getDefaultProjectView(views, 'table')).toBe(views[0])
	})

	it('returns no view while the project has no views', () => {
		expect(getDefaultProjectView([], 'first')).toBeUndefined()
	})
})
