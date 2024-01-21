<script lang="ts">
	import { page } from '$app/stores';

	const reload = () => {
		location.reload();
	};
</script>

<div>
	{$page.status}: {$page.error?.message}
	<button on:click={reload}>Retry</button>
</div>
