<!-- 탭 리스트를 렌더링하고, 사용자 상호작용을 처리합니다. -->
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';

	import * as Command from '$lib/components/ui/command';
	import { getLocalMessage } from '$lib/locales';

	import TabItem from './tab-item.svelte';
	import { chromeApi, tabKeys } from './utils.tabs';

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	export let isSyncing: boolean;
</script>

<Command.List class="px-2 pb-10">
	{#if $tabs.status === 'pending'}
		<Command.Loading>{getLocalMessage('loading')}</Command.Loading>
	{:else if $tabs.status === 'error'}
		<Command.Item>{getLocalMessage('error')}: {$tabs.error.message}</Command.Item>
	{:else if $tabs.isFetching}
		<Command.Loading>{getLocalMessage('backgroundUpdate')}</Command.Loading>
	{:else}
		<Command.Empty>{getLocalMessage('noSearchFound')}</Command.Empty>
		<Command.Group heading={getLocalMessage('tabs')}>
			{#each $tabs.data as tab (tab.id)}
				<TabItem {tab} {isSyncing} />
			{/each}
		</Command.Group>
	{/if}
</Command.List>
