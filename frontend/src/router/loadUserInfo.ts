import {useAuthStore} from '@/stores/auth'
import {useBaseStore} from '@/stores/base'

export async function loadUserInfo() {
	// appReady doesn't wait on router.isReady(), so this can't deadlock the initial navigation.
	await useBaseStore().appReady
	const authStore = useAuthStore()
	// Workman keeps the JWT-built user in info until /user loads; only /user sets isAdmin.
	if (authStore.info?.isAdmin === undefined) {
		await authStore.refreshUserInfo()
	}
	return authStore.info
}
