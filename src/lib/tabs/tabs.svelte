<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { chromeApi, tabKeys } from './tabs';

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});
</script>

<div class="flex h-full flex-col">
	{#if $tabs.status === 'pending'}
		<span>Loading...</span>
	{:else if $tabs.status === 'error'}
		<span>Error: {$tabs.error.message}</span>
	{:else}
		<ul>
			{#each $tabs.data as tabs}
				<article>
					<h2>{tabs.title}</h2>
					<img src={tabs.favIconUrl} alt={tabs.title} />
				</article>
			{/each}
		</ul>
		{#if $tabs.isFetching}
			<div style="color:darkgreen; font-weight:700">Background Updating...</div>
		{/if}
	{/if}
</div>
