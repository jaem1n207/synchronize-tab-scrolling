<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { chromeApi, tabKeys } from './tabs';

	const activeTabs = createQuery({
		queryKey: tabKeys.activeList(),
		queryFn: () => chromeApi.getActiveTabs()
	});
</script>

<div class="flex h-full flex-col">
	<div class="flex flex-grow flex-col">
		<div
			class="flex flex-row items-center justify-between border-b border-gray-200
			px-4 py-2 dark:border-gray-700"
		>
			<div class="flex flex-row items-center">
				<div class="flex flex-row items-center">
					<div
						class="mr-2 flex h-8 w-8 flex-row items-center justify-center
						rounded-full bg-gray-200 dark:bg-gray-700"
					>
						<svg
							class="h-4 w-4 text-gray-500 dark:text-gray-400"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zm0 2a10 10 0
									100-20 10 10 0 000 20z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="flex flex-col">
						<div class="text-sm font-medium text-gray-700 dark:text-gray-200">Active Tabs</div>
						<div class="text-xs font-normal text-gray-500 dark:text-gray-400">
							{#if $activeTabs.isFetching}
								Loading...
							{:else if $activeTabs.isError}
								Error: {$activeTabs.error.message}
							{:else}
								{$activeTabs.data?.length} tabs
							{/if}
						</div>
					</div>
				</div>
			</div>
			<div class="flex flex-row items-center">
				<button
					class="flex h-8 w-8 flex-row items-center justify-center
					rounded-full text-gray-500 hover:text-gray-600 focus:outline-none
					focus:ring-2 focus:ring-gray-500 dark:text-gray-400 dark:hover:text-gray-300 dark:focus:ring-gray-400"
				>
					<svg
						class="h-4 w-4"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm0 2a10 10 0
								100-20 10 10 0 000 20z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>
