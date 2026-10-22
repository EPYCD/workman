import type {IAbstract} from './IAbstract'
import type {IUser} from './IUser'

export interface ITimeEntry extends IAbstract {
	id: number
	// Derived from user.id; the API returns the user object, not user_id.
	userId: number
	// The user who tracked the entry; null if the server did not send one.
	user: IUser | null
	// Exactly one of taskId / projectId is set (0 means unset).
	taskId: number
	projectId: number
	startTime: Date
	// null while the live timer is running.
	endTime: Date | null
	comment: string

	created: Date
	updated: Date
}
