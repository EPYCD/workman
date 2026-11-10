<template>
	<div>
		<Teleport
			defer
			to="#trash-actions"
		>
			<XButton
				v-cy="'emptyTaskTrash'"
				variant="secondary"
				icon="trash-alt"
				danger
				:aria-disabled="total === 0 || undefined"
				@click="openEmptyModal()"
			>
				{{ $t('trash.empty') }}
			</XButton>
		</Teleport>

		<div
			ref="listElement"
			tabindex="-1"
		>
			<Card
				v-if="items.length > 0"
				:padding="false"
				class="has-overflow"
				:has-content="false"
				:loading="isFetching"
			>
				<ul class="trashed-items">
					<li
						v-for="item in items"
						:key="item.id"
						v-cy="'trashedTask'"
						:data-trash-row="item.id"
						class="trashed-item"
					>
						<SingleTaskInlineReadonly
							:task="item.task"
							show-project
						/>
						<span
							v-tooltip="formatDateLong(item.deleted_at)"
							class="trashed-item__meta"
						>
							{{ deletedLabel(item) }} ·
							{{ $t('trash.daysLeftShort', trashDaysLeft(item.deleted_at)) }}
						</span>
						<TrashRowActions
							:pending="isPending(item.id)"
							:can-delete-forever="item.can_delete_permanently"
							restore-cy="restoreTask"
							delete-forever-cy="deleteTaskForever"
							@restore="restore(item.id)"
							@deleteForever="confirmDeleteForever(item)"
						/>
					</li>
				</ul>
			</Card>
			<p
				v-else-if="showEmptyState"
				ref="emptyStateElement"
				tabindex="-1"
				class="trash-empty"
			>
				{{ $t('trash.noTasks') }}
			</p>
		</div>

		<PaginationEmit
			v-if="totalPages > 1"
			:total-pages="totalPages"
			:current-page="currentPage"
			@pageChanged="currentPage = $event"
		/>

		<Modal
			:enabled="itemToDelete !== null"
			@close="cancelDeleteForever()"
			@submit="deleteForever()"
		>
			<template #header>
				<span>{{ $t('trash.deleteForeverModal.header') }}</span>
			</template>
			<template #text>
				<p class="tw:text-balance">
					{{ $t('trash.deleteForeverModal.text', {task: itemToDelete?.title}) }}
				</p>
			</template>
		</Modal>

		<EmptyTrashModal
			v-model:include-others="includeOthers"
			:enabled="showEmptyModal"
			:count="emptyCount"
			:texts="{text: 'trash.emptyModal.text', byOthers: 'trash.emptyModal.byOthers', includeOthers: 'trash.emptyModal.includeOthers'}"
			@close="closeEmptyModal()"
			@submit="emptyTrash()"
		/>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import Card from '@/components/misc/Card.vue'
import Modal from '@/components/misc/Modal.vue'
import PaginationEmit from '@/components/misc/PaginationEmit.vue'
import SingleTaskInlineReadonly from '@/components/tasks/partials/SingleTaskInlineReadonly.vue'
import EmptyTrashModal from '@/components/trash/EmptyTrashModal.vue'
import TrashRowActions from '@/components/trash/TrashRowActions.vue'

import {
	taskTrashCountQuery,
	trashDaysLeft,
	trashedTasksQuery,
	useDeleteTaskPermanentlyMutation,
	useEmptyTaskTrashMutation,
	useRestoreTaskMutation,
} from '@/client/queries/trash'
import {useDeletedLabel} from '@/composables/useDeletedLabel'
import {useTrashList} from '@/composables/useTrashList'
import {formatDateLong} from '@/helpers/time/formatDate'

const deletedLabel = useDeletedLabel({
	unknown: 'trash.deleted',
	by: 'trash.deletedBy',
	byYou: 'trash.deletedByYou',
})

const {
	currentPage,
	items,
	total,
	totalPages,
	isFetching,
	showEmptyState,
	listElement,
	emptyStateElement,
	isPending,
	itemToDelete,
	showEmptyModal,
	emptyCount,
	includeOthers,
	restore,
	confirmDeleteForever,
	cancelDeleteForever,
	deleteForever,
	openEmptyModal,
	closeEmptyModal,
	emptyTrash,
} = useTrashList({
	query: page => useQuery(computed(() => trashedTasksQuery(page.value))),
	restore: useRestoreTaskMutation(),
	deleteForever: useDeleteTaskPermanentlyMutation(),
	count: enabled => useQuery(computed(() => ({...taskTrashCountQuery(), enabled: enabled.value}))),
	empty: useEmptyTaskTrashMutation(),
})
</script>

<style lang="scss" scoped>
.trashed-items {
	list-style: none;
	margin: 0;
	padding: 0;
}

.trashed-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--wm-space-2);
	padding: var(--wm-space-2) var(--wm-space-3);
	border-block-end: 1px solid var(--wm-line-faint);
	transition: background-color var(--wm-duration) var(--wm-ease);

	&:last-child {
		border-block-end: 0;
	}

	&:hover {
		background-color: var(--wm-surface-hover);
	}

	:deep(.task) {
		cursor: default;
	}
}

.trashed-item__meta {
	@include mono-data;

	margin-inline-start: auto;
	color: var(--wm-text-tertiary);
	font-size: var(--wm-text-xs);
	white-space: nowrap;
}

.trash-empty {
	text-align: center;
	color: var(--wm-text-tertiary);
	font-style: italic;
}
</style>
