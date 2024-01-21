<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';

	import { Button } from '$lib/components/ui/button';

	const query = createQuery({
		queryKey: ['pokemon'],
		queryFn: async () => (await fetch('https://pokeapi.co/api/v2/pokemon?limit=33')).json()
	});
</script>

<svelte:head>
	<title>Popup | Synchronize Tab Scrolling</title>
	<meta
		name="description"
		content="Browser extension that lets you synchronize the scrolling position of multiple tabs"
	/>
</svelte:head>

<main class="max-h-96 min-h-96 w-80 overflow-auto">
	{#if $query.isFetching}
		<p>Loading...</p>
	{:else if $query.isError}
		<p>Error: {$query.error.message}</p>
	{:else}
		{#each $query.data.results as pokemon}
			<p>{pokemon.name}</p>
		{/each}
	{/if}
	<Button>Hello</Button>
</main>
