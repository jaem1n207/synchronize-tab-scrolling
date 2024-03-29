<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { RefreshCwOff, Wand2 } from 'lucide-svelte';

  import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Command from '$lib/components/ui/command';
  import { kbd } from '$lib/kbd';
  import { getLocalMessage } from '$lib/locales';

  import { isMacOS } from '../platform';
  import SyncIcon from './icons/sync-icon.svelte';
  import { selectedTabStore } from './selectedTabStore';
  import { tabKeys } from './utils.tabs';

  export let isSyncing: boolean;
  export let resetInputValue: () => void;

  const queryClient = useQueryClient();

  const mutateSyncTabIds = createMutation({
    mutationFn: async (syncTabIds: number[]) => {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { command: 'setSyncTabIds', data: { syncTabIds } },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tabKeys.sync()
      });
    }
  });

  $: isPending = $mutateSyncTabIds.isPending;

  $: selectedTabs = $selectedTabStore.selectedTabs;
  $: hasMultipleSelectedTabs = selectedTabs.size >= 2;

  const handleStartSync = () => {
    if (isSyncing || !hasMultipleSelectedTabs) return;

    const syncTabIds = Array.from(selectedTabs.keys());
    chrome.runtime.sendMessage<{
      command: 'startSync';
      data: number[];
    }>({ command: 'startSync', data: syncTabIds });
    $mutateSyncTabIds.mutate(syncTabIds);
  };

  const handleStopSync = () => {
    if (!isSyncing) return;

    chrome.runtime.sendMessage({ command: 'stopSync' });
    $mutateSyncTabIds.mutate([]);

    selectedTabStore.reset();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (isSyncing) {
      if (e.key === kbd.E && (e.altKey || e.metaKey)) {
        handleStopSync();
      }
    } else {
      if (e.key === kbd.S && (e.altKey || e.metaKey)) {
        resetInputValue();
        handleStartSync();
      }
    }
  };
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="absolute bottom-0.5 left-0.5 flex h-10 w-[calc(100%-0.25rem)] items-center rounded-b-xl border-t border-border bg-background px-2 py-1"
>
  <Wand2 class="mr-auto size-3 stroke-gray-500 dark:stroke-gray-400" />
  <ThemeSwitcher />
  <hr class="ml-3 mr-1 h-3 w-[1px] border-none bg-border" />
  {#if isSyncing}
    <Button
      class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
      variant="ghost"
      disabled={isPending}
      on:click={handleStopSync}
    >
      <RefreshCwOff class="mr-0.5 size-3 stroke-black dark:stroke-white" />
      {getLocalMessage('stopSync')}
      <Command.Shortcut class="ml-1 size-5">{isMacOS ? '⌘' : 'Alt'}</Command.Shortcut>
      <Command.Shortcut class="size-5">E</Command.Shortcut>
    </Button>
  {:else}
    <Button
      class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
      variant="ghost"
      disabled={!hasMultipleSelectedTabs || isPending}
      on:click={handleStartSync}
    >
      <SyncIcon class="mr-0.5 size-3 stroke-black dark:stroke-white" />
      {getLocalMessage('startSync')}
      <Command.Shortcut class="ml-1 size-5">{isMacOS ? '⌘' : 'Alt'}</Command.Shortcut>
      <Command.Shortcut class="size-5">S</Command.Shortcut>
    </Button>
  {/if}
</div>
