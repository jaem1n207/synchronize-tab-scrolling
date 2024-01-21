<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';

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
