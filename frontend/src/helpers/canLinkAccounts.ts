import type {ConfigState} from '@/stores/config'

export function canLinkAccounts(
	openidConnect: ConfigState['auth']['openidConnect'],
	info: {isLocalUser?: boolean} | null,
): boolean {
	return openidConnect.providers.length > 0
		&& info?.isLocalUser === true
}
