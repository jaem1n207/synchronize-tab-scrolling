<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';

  import * as Command from '$lib/components/ui/command';
  import { isEmptyString, isHTMLElement } from '$lib/is';
  import { kbd } from '$lib/kbd';
  import { getLocalMessage } from '$lib/locales';
  import { cn } from '$lib/utils';

  import { isMacOS } from '../platform';
  import SelectedTabs from './selected-tabs.svelte';
  import { selectedTabStore } from './selectedTabStore';
  import SubCommand from './sub-command.svelte';
  import TabList from './tab-list.svelte';
  import { chromeApi, tabKeys } from './utils.tabs';

  const syncTabIds = createQuery({
    queryKey: tabKeys.sync(),
    queryFn: () => chromeApi.getSyncTabIds()
  });

  let isSyncing: boolean = false;
  $: syncTabIds.subscribe(({ data }) => {
    if (!data?.length) {
      isSyncing = false;
      return;
    }

    updateSelectedTabs(data);
    isSyncing = true;
  });

  const updateSelectedTabs = async (syncTabIds: number[]) => {
    selectedTabStore.reset();

    for (const id of syncTabIds) {
      const tab = await chromeApi.getTabById(id);
      if (tab) {
        selectedTabStore.add(tab);
      }
    }
  };

  let inputValue: string = '';
  $: isEmptyInputValue = isEmptyString(inputValue.trim());
  const resetInputValue = () => (inputValue = '');

  const bounce = (node: HTMLElement) => {
    node.style.transform = 'scale(0.98)';
    setTimeout(() => {
      node.style.transform = '';
    }, 100);
  };

  let cmdkInputEl: HTMLInputElement | null = null;
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === kbd.SLASH && (e.metaKey || e.altKey)) {
      cmdkInputEl?.focus();
    }
    const currentTarget = e.currentTarget;
    if (!isHTMLElement(currentTarget)) return;

    if ($selectedTabStore.selectedTabs.size === 0 || !isEmptyInputValue || isSyncing) return;

    if (e.key === kbd.BACKSPACE) {
      e.preventDefault();

      selectedTabStore.pop();
      bounce(currentTarget);
    }
  };

  onMount(() => {
    cmdkInputEl = document.querySelector('[data-cmdk-input]') as HTMLInputElement;
  });
</script>

<Command.Root
  onKeydown={handleKeydown}
  tabindex={-1}
  class={cn(
    'relative w-96 p-0.5 outline-none',
    isSyncing &&
      'border-2 border-solid border-transparent before:absolute before:inset-0 before:animate-clippath before:content-normal before:rounded-md before:border-2 before:border-solid before:border-neutral-700 dark:before:border-[#a8efff99]'
  )}
>
  <SelectedTabs />
  <Command.Input
    data-cmdk-input
    autofocus
    class="py-1"
    placeholder={getLocalMessage('searchPlaceholder')}
    bind:value={inputValue}
  >
    <div slot="suffix" class="ml-2 flex cursor-default items-center gap-1">
      <Command.Shortcut class="size-5">{isMacOS ? '⌘' : 'Alt'}</Command.Shortcut>
      <Command.Shortcut class="size-5">/</Command.Shortcut>
    </div>
  </Command.Input>
  <TabList {inputValue} {isSyncing} />
  <SubCommand {isSyncing} {resetInputValue} />
</Command.Root>
