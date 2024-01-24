<script lang="ts">
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
	import { ModeWatcher } from 'mode-watcher';

	import '@/app.pcss';
	import type { LayoutData } from './$types';

	export let data: LayoutData;
</script>

<ModeWatcher />
<QueryClientProvider client={data.queryClient}>
	<main class="px-2 py-3">
		<slot />
	</main>
	<SvelteQueryDevtools />
</QueryClientProvider>
