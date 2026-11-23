<template>
	<div>
		<Teleport
			defer
			to="#trash-actions"
		>
			<XButton
				v-cy="'emptyProjectTrash'"
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
				:has-content="false"
				:loading="isFetching"
			>
				<ul class="trashed-projects">
					<li
						v-for="project in items"
						:key="project.id"
						v-cy="'trashedProject'"
						:data-trash-row="project.id"
					>
						<div class="trashed-project">
							<ColorBubble
								v-if="getHexColor(project.hex_color)"
								:color="getHexColor(project.hex_color)!"
							/>
							<span class="trashed-project__title">{{ project.title }}</span>
							<BaseButton
								v-if="project.trashed_sub_projects.length"
								v-cy="'toggleTrashedSubProjects'"
								class="trashed-project__toggle"
								:aria-expanded="expanded.has(project.id)"
								@click="toggle(project.id)"
							>
								<Icon
									icon="chevron-down"
									class="trashed-project__chevron"
									:class="{'is-collapsed': !expanded.has(project.id)}"
								/>
								{{ $t('trash.subProjects', project.trashed_sub_projects.length) }}
							</BaseButton>
							<span
								v-tooltip="formatDateLong(project.deleted_at)"
								class="trashed-project__meta"
							>
								{{ deletedLabel(project) }} ·
								{{ $t('trash.daysLeftShort', trashDaysLeft(project.deleted_at)) }}
							</span>
							<TrashRowActions
								:pending="isPending(project.id)"
								can-delete-forever
								restore-cy="restoreProject"
								delete-forever-cy="deleteProjectForever"
								@restore="restore(project.id)"
								@deleteForever="confirmDeleteForever(project)"
							/>
						</div>
						<ul
							v-if="expanded.has(project.id)"
							v-cy="'trashedSubProjects'"
							class="trashed-sub-projects"
						>
							<li
								v-for="sub in project.trashed_sub_projects"
								:key="sub.id"
								:style="{paddingInlineStart: `${(sub.depth ?? 1) * 1.25}rem`}"
							>
								{{ sub.title }}
							</li>
						</ul>
					</li>
				</ul>
			</Card>
			<p
				v-else-if="showEmptyState"
				ref="emptyStateElement"
				tabindex="-1"
				class="trash-empty"
			>
				{{ $t('trash.noProjects') }}
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
				<span>{{ $t('trash.deleteProjectForeverModal.header') }}</span>
			</template>
			<template #text>
				<p class="tw:text-balance">
					{{ $t('trash.deleteProjectForeverModal.text', {project: itemToDelete?.title}) }}
				</p>
			</template>
		</Modal>

		<EmptyTrashModal
			v-model:include-others="includeOthers"
			:enabled="showEmptyModal"
			:count="emptyCount"
			:texts="{text: 'trash.emptyProjectsModal.text', byOthers: 'trash.emptyProjectsModal.byOthers', includeOthers: 'trash.emptyProjectsModal.includeOthers'}"
			@close="closeEmptyModal()"
			@submit="emptyTrash()"
		/>
	</div>
</template>

<script setup lang="ts">
import {computed, reactive} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import BaseButton from '@/components/base/BaseButton.vue'
import Card from '@/components/misc/Card.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import Modal from '@/components/misc/Modal.vue'
import PaginationEmit from '@/components/misc/PaginationEmit.vue'
import EmptyTrashModal from '@/components/trash/EmptyTrashModal.vue'
import TrashRowActions from '@/components/trash/TrashRowActions.vue'

import {
	projectTrashCountQuery,
	trashDaysLeft,
	trashedProjectsQuery,
	useDeleteProjectPermanentlyMutation,
	useEmptyProjectTrashMutation,
	useRestoreProjectMutation,
} from '@/client/queries/trash'
import {useDeletedLabel} from '@/composables/useDeletedLabel'
import {useTrashList} from '@/composables/useTrashList'
import {getHexColor} from '@/models/task'
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
	query: page => useQuery(computed(() => trashedProjectsQuery(page.value))),
	restore: useRestoreProjectMutation(),
	deleteForever: useDeleteProjectPermanentlyMutation(),
	count: enabled => useQuery(computed(() => ({...projectTrashCountQuery(), enabled: enabled.value}))),
	empty: useEmptyProjectTrashMutation(),
})

const expanded = reactive(new Set<number>())
function toggle(projectId: number) {
	if (!expanded.delete(projectId)) {
		expanded.add(projectId)
	}
}
</script>

<style lang="scss" scoped>
.trashed-projects {
	list-style: none;
	margin: 0;
	padding: 0;

	> li {
		border-block-end: 1px solid var(--wm-line-faint);

		&:last-child {
			border-block-end: 0;
		}
	}
}

.trashed-project {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--wm-space-2);
	padding: var(--wm-space-2) var(--wm-space-3);
	transition: background-color var(--wm-duration) var(--wm-ease);

	&:hover {
		background-color: var(--wm-surface-hover);
	}
}

.trashed-project__title {
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.trashed-project__toggle {
	@include mono-data;

	display: inline-flex;
	align-items: center;
	gap: var(--wm-space-1);
	color: var(--wm-text-tertiary);
	font-size: var(--wm-text-xs);

	&:hover,
	&:focus-visible {
		color: var(--wm-text);
	}
}

.trashed-project__chevron {
	font-size: .7rem;
	transition: transform var(--wm-duration) var(--wm-ease);

	&.is-collapsed {
		transform: rotate(-90deg);
	}
}

.trashed-project__meta {
	@include mono-data;

	margin-inline-start: auto;
	color: var(--wm-text-tertiary);
	font-size: var(--wm-text-xs);
	white-space: nowrap;
}

.trashed-sub-projects {
	list-style: none;
	margin: 0 0 var(--wm-space-2);
	padding: 0 var(--wm-space-3);
	color: var(--wm-text-secondary);
	font-size: var(--wm-text-sm);

	li {
		padding-block: .15rem;
	}
}

.trash-empty {
	text-align: center;
	color: var(--wm-text-tertiary);
	font-style: italic;
}
</style>
