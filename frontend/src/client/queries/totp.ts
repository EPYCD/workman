import {queryOptions} from '@tanstack/vue-query'
import {totpGet, type Totp} from '@/client/generated'
import type {VikunjaErrorModel} from '@/client/generated'

// Only the status read for reauthentication prompts; the fork's TOTP settings page uses TotpService.
export const totpKeys = {
	current: ['totp'] as const,
}

export function totpQuery() {
	return queryOptions({
		queryKey: totpKeys.current,
		queryFn: async ({signal}): Promise<Totp> => {
			try {
				return (await totpGet({signal})).data
			} catch (cause) {
				// 1016 = TOTP not enrolled.
				if ((cause as VikunjaErrorModel)?.code === 1016) return {enabled: false}
				throw cause
			}
		},
		// The enrollment secret must not outlive the view.
		gcTime: 0,
	})
}
