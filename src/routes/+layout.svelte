<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import '@/app.pcss';
</script>

<ModeWatcher />
<div>
	<ThemeSwitcher />
	<slot />
</div>
