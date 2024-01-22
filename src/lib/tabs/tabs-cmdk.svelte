<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { createQuery } from '@tanstack/svelte-query';

	import FallbackFaviconIcon from '../images/fallback-favicon.svg';
	import { isEmptyString, isHTMLElement } from '../is';
	import { kbd } from '../kbd';
	import { chromeApi, tabKeys } from './tabs';

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	const bounce = (node: HTMLElement) => {
		node.style.transform = 'scale(0.96)';
		setTimeout(() => {
			node.style.transform = '';
		}, 100);
	};

	const handleKeydown = (e: KeyboardEvent) => {
		const currTarget = e.currentTarget;
		if (!isHTMLElement(currTarget)) return;

		if (e.key === kbd.ENTER) {
			bounce(currTarget);
			inputValue = '';
		}

		if (isEmptyString(inputValue) && e.key === kbd.BACKSPACE) {
			e.preventDefault();
			bounce(currTarget);
			inputValue = '';
		}
	};

	let inputValue: string = '';

	const selectedTabIds = new Set<number>();

	const handleTabSelect = (tabId: number) => {
		if (selectedTabIds.has(tabId)) {
			selectedTabIds.delete(tabId);
		} else {
			selectedTabIds.add(tabId);
		}
	};

	const handleFaviconError = (event: Event) => {
		const target = event.target as HTMLImageElement;
		target.src = FallbackFaviconIcon;
	};
</script>

<Command.Root onKeydown={handleKeydown}>
	<Command.Input placeholder="Type a command or search..." autofocus bind:value={inputValue}>
		{#if $tabs.status === 'success'}
			{#if $tabs.data.length > 0}
				<span class="text-xs text-gray-500">
					{$tabs.data.length} tab{$tabs.data.length > 1 ? 's' : ''} found
				</span>
			{/if}
		{/if}
	</Command.Input>
	<Command.List>
		{#if $tabs.status === 'pending'}
			<Command.Loading>Loading...</Command.Loading>
		{:else if $tabs.status === 'error'}
			<Command.Item>Error: {$tabs.error.message}</Command.Item>
		{:else if $tabs.isFetching}
			<Command.Loading>Background Updating...</Command.Loading>
		{:else}
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Tabs">
				{#each $tabs.data as tab}
					<Command.Item onSelect={() => handleTabSelect(tab.id ?? tab.index)}>
						{#if selectedTabIds.has(tab.id ?? tab.index)}
							<span class="mr-2 text-xs text-gray-500">✓</span>
						{/if}
						<img
							class="mr-2 size-4 min-h-4 min-w-4"
							src={tab.favIconUrl}
							alt=""
							on:error={handleFaviconError}
						/>
						<span class="line-clamp-2">{tab.title}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Root>
