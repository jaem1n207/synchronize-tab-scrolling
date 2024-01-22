<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { createQuery } from '@tanstack/svelte-query';

	import { isEmptyString, isHTMLElement } from '../is';
	import { kbd } from '../kbd';
	import { chromeApi, tabKeys } from './tabs';
	import { cn } from '../utils';
	import { getUserPreferredTheme } from '../media-query';

	// const tabs = createQuery({
	// 	queryKey: tabKeys.lists(),
	// 	queryFn: () => chromeApi.getTabs()
	// });

	let tabs = [
		{
			id: 1,
			title: 'Google',
			favIconUrl: 'https://www.google.com/favicon.ico'
		},
		{
			id: 2,
			title:
				'FacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebook',
			favIconUrl: 'https://www.facebook.com/favicon.ico'
		},
		{
			id: 3,
			title: 'Twitter',
			favIconUrl: 'https://www.twitter.com/favicon.ico'
		},
		{
			id: 4,
			title: 'Instagram',
			favIconUrl: 'https://www.instagram.com/favicon.ico'
		},
		{
			id: 5,
			title: 'Youtube',
			favIconUrl: 'https://www.youtube.com/favicon.ico'
		},
		{
			id: 6,
			title: 'Linkedin',
			favIconUrl: 'https://www.linkedin.com/favicon.ico'
		},
		{
			id: 7,
			title: 'Github',
			favIconUrl: 'https://www.github.com/favicon.ico'
		},
		{
			id: 8,
			title: 'Stackoverflow',
			favIconUrl: 'https://www.stackoverflow.com/favicon.ico'
		},
		{
			id: 9,
			title: 'Medium',
			favIconUrl: 'https://www.medium.com/favicon.ico'
		},
		{
			id: 10,
			title: 'Reddit',
			favIconUrl: 'https://www.reddit.com/favicon.ico'
		},
		{
			id: 11,
			title: 'Netflix',
			favIconUrl: 'https://www.netflix.com/favicon.ico'
		},
		{
			id: 12,
			title: 'Amazon',
			favIconUrl: 'https://www.amazon.com/favicon.ico'
		},
		{
			id: 13,
			title: 'Flipkart',
			favIconUrl: 'https://www.flipkart.com/favicon.ico'
		},
		{
			id: 14,
			title: 'Snapdeal',
			favIconUrl: 'https://www.snapdeal.com/favicon.ico'
		},
		{
			id: 15,
			title: 'Paytm',
			favIconUrl: 'https://www.paytm.com/favicon.ico'
		},
		{
			id: 16,
			title: 'Myntra',
			favIconUrl: 'https://www.myntra.com/favicon.ico'
		},
		{
			id: 17,
			title: 'Swiggy',
			favIconUrl: 'https://www.swiggy.com/favicon.ico'
		}
	];

	let inputValue: string = '';

	let selectedTabIds: number[] = [];
	$: isEmptySelectedTabIds = selectedTabIds.length === 0;

	const bounce = (node: HTMLElement) => {
		node.style.transform = 'scale(0.98)';
		setTimeout(() => {
			node.style.transform = '';
		}, 100);
	};

	const popSelectedTab = () => {
		if (isEmptySelectedTabIds) return;

		const next = selectedTabIds[selectedTabIds.length - 1];
		selectedTabIds = selectedTabIds.filter((id) => id !== next);
	};

	const handleKeydown = (e: KeyboardEvent) => {
		const currentTarget = e.currentTarget;
		if (!isHTMLElement(currentTarget)) return;

		if (isEmptySelectedTabIds || !isEmptyString(inputValue)) return;

		if (e.key === kbd.BACKSPACE) {
			e.preventDefault();
			popSelectedTab();
			bounce(currentTarget);
		}
	};

	const handleTabSelect = (tabId: number) => {
		{
			if (selectedTabIds.includes(tabId)) {
				selectedTabIds = selectedTabIds.filter((id) => id !== tabId);
			} else {
				selectedTabIds = [...selectedTabIds, tabId];
			}
		}
	};

	const handleFaviconError = (event: Event) => {
		const theme = getUserPreferredTheme();
		const target = event.target as HTMLImageElement;
		target.src = `/images/${theme}-fallback-favicon.svg`;
	};
</script>

<Command.Root onKeydown={handleKeydown} class="vercel">
	<div class="select-none p-1">
		{#each selectedTabIds as tabId}
			{#if tabs.find((tab) => tab.id === tabId)}
				<div
					class="mx-0.5 mb-1 inline-flex h-6 items-center rounded-sm bg-muted px-2 text-xs font-medium capitalize"
				>
					<div class="relative mr-1 flex size-4 shrink-0 overflow-hidden rounded-full">
						<img
							class="aspect-square size-full object-cover"
							src={tabs.find((tab) => tab.id === tabId).favIconUrl}
							alt=""
							on:error={handleFaviconError}
						/>
					</div>
					{tabs.find((tab) => tab.id === tabId).title.slice(0, 10)}
				</div>
			{/if}
		{/each}
	</div>
	<Command.Input placeholder="Type a command or search..." autofocus bind:value={inputValue} />
	<Command.List>
		<Command.Empty>No results found.</Command.Empty>
		<Command.Group heading="Tabs">
			{#each tabs as tab}
				<Command.Item
					onSelect={() => handleTabSelect(tab.id)}
					class={cn('my-0.5 cursor-pointer py-2 transition-colors aria-selected:bg-muted/50', {
						'bg-muted': selectedTabIds.includes(tab.id)
					})}
				>
					<div class="relative mr-2 flex size-6 shrink-0 overflow-hidden rounded-full">
						<img
							class="aspect-square size-full object-cover"
							src={tab.favIconUrl}
							alt=""
							on:error={handleFaviconError}
						/>
					</div>
					<span class="line-clamp-2 text-sm">{tab.title}</span>
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Root>

<!-- <Command.Root onKeydown={handleKeydown} class="vercel">
	<Command.Input placeholder="Type a command or search..." autofocus bind:value={inputValue} />
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
					<Command.Item
						onSelect={() => handleTabSelect(tab.id ?? tab.index)}
						class={cn('cursor-pointer space-y-1', {
							'bg-primary-foreground/90': selectedTabIds.has(tab.id ?? tab.index)
						})}
					>
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
</Command.Root> -->
