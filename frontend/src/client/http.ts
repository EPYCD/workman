import {client} from '@/client/generated/client.gen'
import type {ResolvedRequestOptions} from '@/client/generated/client/types.gen'
import {getToken, getTokenIdentity, refreshToken} from '@/helpers/auth'
import {getApiV2BaseUrl} from '@/helpers/fetcher'
import {AUTH_TYPES} from '@/modelTypes/IUser'

async function getProblemCode(response: Response): Promise<number | null> {
	try {
		const problem = await response.clone().json() as {code?: unknown}
		return typeof problem.code === 'number' ? problem.code : null
	} catch {
		return null
	}
}

// Only a parsed JSON body; Error instances come from the transport or our own interceptors.
function isWireProblem(error: unknown): error is Record<string, unknown> {
	return typeof error === 'object' && error !== null && Object.getPrototypeOf(error) === Object.prototype
}

// Echo rejects some /api/v2 requests before Huma (rate limits, invalid JWT) and answers with a
// v1-shaped body, so the top-level status/detail of api.md only holds once we stamp it on.
function normalizeProblemBody(error: unknown, response: Response | undefined): unknown {
	if (!response || !isWireProblem(error) || typeof error.status === 'number') {
		return error
	}
	return {
		...error,
		status: response.status,
		detail: error.detail ?? error.message,
	}
}

export function configureApiClient(): void {
	const retryRequests = new WeakMap<Request, {
		request: Request
		token: string
		identity: {id: number; type: number} | null
	}>()

	client.setConfig({
		baseUrl: getApiV2BaseUrl(),
		credentials: 'include',
		throwOnError: true,
	})
	client.interceptors.request.clear()
	client.interceptors.response.clear()
	client.interceptors.error.clear()

	client.interceptors.request.use((request) => {
		if (request.headers.has('Authorization')) {
			return request
		}

		const headers = new Headers(request.headers)
		const token = getToken()
		if (!token) {
			return request
		}

		headers.set('Authorization', `Bearer ${token}`)
		const managedRequest = new Request(request, {headers})
		retryRequests.set(managedRequest, {
			request: managedRequest.clone(),
			token,
			identity: getTokenIdentity(token),
		})
		return managedRequest
	})

	client.interceptors.response.use(async (response, request, options: ResolvedRequestOptions) => {
		const retryRequest = retryRequests.get(request)
		retryRequests.delete(request)
		if (!retryRequest || response.status !== 401 || await getProblemCode(response) !== 11) {
			return response
		}

		const originalIdentity = retryRequest.identity
		if (originalIdentity?.type !== AUTH_TYPES.USER) {
			return response
		}

		const hasOriginalIdentity = (token: string | null) => {
			const identity = getTokenIdentity(token)
			return identity?.id === originalIdentity.id && identity.type === originalIdentity.type
		}

		let replacementToken = getToken()
		if (!replacementToken || !hasOriginalIdentity(replacementToken)) {
			return response
		}

		if (replacementToken === retryRequest.token) {
			try {
				await refreshToken(true)
			} catch {
				return response
			}

			replacementToken = getToken()
			if (!replacementToken || !hasOriginalIdentity(replacementToken)) {
				return response
			}
		}

		const headers = new Headers(retryRequest.request.headers)
		headers.set('Authorization', `Bearer ${replacementToken}`)
		const retry = new Request(retryRequest.request, {headers})
		return (options.fetch ?? globalThis.fetch)(retry)
	})

	client.interceptors.error.use((error, response) => normalizeProblemBody(error, response))
}
