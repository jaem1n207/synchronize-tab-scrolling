<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { createQuery } from '@tanstack/svelte-query';

	import FallbackFaviconIcon from '../images/fallback-favicon.svg';
	import { chromeApi, tabKeys } from './tabs';

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	const handleFaviconError = (event: Event) => {
		const target = event.target as HTMLImageElement;
		target.src = FallbackFaviconIcon;
	};
</script>

<div class="flex h-full flex-col">
	{#if $tabs.status === 'pending'}
		<span>Loading...</span>
	{:else if $tabs.status === 'error'}
		<span>Error: {$tabs.error.message}</span>
	{:else}
		<Command.Root>
			<Command.Input placeholder="Type a command or search..." autofocus />
			<Command.List>
				<Command.Empty>No results found.</Command.Empty>
				<Command.Group heading="Checked">
					<Command.Item class="cursor-pointer">
						<img class="mr-2 size-4" src={''} alt="" on:error={handleFaviconError} />
						<span class="line-clamp-2">테스트</span>
					</Command.Item>
				</Command.Group>
				<Command.Separator />
				<Command.Group heading="Tabs">
					{#each $tabs.data as tab}
						<Command.Item class="cursor-pointer">
							<img class="mr-2 size-4" src={tab.favIconUrl} alt="" />
							<span class="line-clamp-2">{tab.title}</span>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
		{#if $tabs.isFetching}
			<div style="color:darkgreen; font-weight:700">Background Updating...</div>
		{/if}
	{/if}
</div>
