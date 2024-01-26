<!-- 탭 리스트를 렌더링하고, 사용자 상호작용을 처리합니다. -->
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';

	import * as Command from '$lib/components/ui/command';
	import { getLocalMessage } from '$lib/locales';

	import TabItem from './tab-item.svelte';
	import { chromeApi, tabKeys } from './utils.tabs';

	export let isSyncing: boolean;

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	const excludedPatterns = [
		'https://chromewebstore.google.com/*',
		'https://chrome.google.com/webstore/*',
		'https://accounts.google.com/*',
		'https://search.google.com/search-console*',
		'https://analytics.google.com/analytics/*'
	];

	const isExcludedUrl = (url: string) => {
		return excludedPatterns.some((pattern) => {
			// Convert the '*' in the pattern to '.*' in the regex.
			const regexPattern = pattern.replace(/\*/g, '.*');
			const regex = new RegExp(regexPattern);
			return regex.test(url);
		});
	};
</script>

<Command.List class="h-80 scroll-pb-10 overflow-auto overscroll-contain px-1 pb-10">
	{#if $tabs.status === 'pending'}
		<Command.Loading>{getLocalMessage('loading')}</Command.Loading>
	{:else if $tabs.status === 'error'}
		<Command.Item>{getLocalMessage('error')}: {$tabs.error.message}</Command.Item>
	{:else if $tabs.isFetching}
		<Command.Loading>{getLocalMessage('backgroundUpdate')}</Command.Loading>
	{:else if $tabs.data.length > 0}
		<Command.Empty>
			{getLocalMessage('noSearchFound')}
		</Command.Empty>
		<Command.Group heading={getLocalMessage('tabs')}>
			{#each $tabs.data as tab (tab.id)}
				<TabItem {tab} isDisabled={isSyncing || isExcludedUrl(tab.url ?? '')} />
			{/each}
		</Command.Group>
	{:else}
		<Command.Empty>
			{getLocalMessage('noTabsFound')}
		</Command.Empty>
	{/if}
</Command.List>
