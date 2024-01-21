<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { QueryClientProvider } from '@tanstack/svelte-query';

	import '@/app.pcss';
	import type { LayoutData } from './$types';
	import Header from './header.svelte';

	export let data: LayoutData;
</script>

<ModeWatcher />
<Header />
<main>
<QueryClientProvider client={data.queryClient}><slot /></QueryClientProvider>
</main>
