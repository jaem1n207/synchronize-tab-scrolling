<script lang="ts">
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
	import { ModeWatcher } from 'mode-watcher';

	import '@/app.pcss';
	import type { LayoutData } from './$types';
	import Header from './header.svelte';

	export let data: LayoutData;
</script>

<ModeWatcher />
<Header />
<QueryClientProvider client={data.queryClient}>
	<main>
		<slot />
	</main>
	<SvelteQueryDevtools />
</QueryClientProvider>
