<!-- 탭 리스트를 렌더링하고, 사용자 상호작용을 처리합니다. -->
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';

  import * as Command from '$lib/components/ui/command';
  import { getLocalMessage } from '$lib/locales';
  import { isEdge, isFirefox } from '$lib/platform';

  import TabItem from './tab-item.svelte';
  import { chromeApi, tabKeys } from './utils.tabs';

  export let isSyncing: boolean;
  export let inputValue: string;

  const canInjectScript = (url: string | null | undefined): boolean => {
    const googleServices = [
      'https://accounts.google.com',
      'https://analytics.google.com/analytics',
      'https://search.google.com/search-console',
      'https://chromewebstore.google.com'
    ];

    if (isFirefox) {
      return Boolean(
        url &&
          !url.startsWith('about:') &&
          !url.startsWith('moz') &&
          !url.startsWith('view-source:') &&
          !url.startsWith('resource:') &&
          !url.startsWith('chrome:') &&
          !url.startsWith('jar:') &&
          !url.startsWith('https://addons.mozilla.org/') &&
          !googleServices.some((serviceUrl) => url.startsWith(serviceUrl))
      );
    }
    if (isEdge) {
      return Boolean(
        url &&
          !url.startsWith('chrome') &&
          !url.startsWith('data') &&
          !url.startsWith('devtools') &&
          !url.startsWith('edge') &&
          !url.startsWith('https://chrome.google.com/webstore') &&
          !url.startsWith('https://microsoftedge.microsoft.com/addons') &&
          !url.startsWith('view-source') &&
          !googleServices.some((serviceUrl) => url.startsWith(serviceUrl))
      );
    }
    return Boolean(
      url &&
        !url.startsWith('chrome') &&
        !url.startsWith('https://chrome.google.com/webstore') &&
        !url.startsWith('data') &&
        !url.startsWith('devtools') &&
        !url.startsWith('view-source') &&
        !googleServices.some((serviceUrl) => url.startsWith(serviceUrl))
    );
  };

  const tabs = createQuery({
    queryKey: tabKeys.lists(),
    queryFn: () => chromeApi.getTabs()
  });
</script>

<Command.List class="h-80 scroll-pb-10 overflow-auto overscroll-contain px-1 pb-10">
  {#if $tabs.status === 'pending'}
    <Command.Loading>{getLocalMessage('loading')}</Command.Loading>
  {:else if $tabs.status === 'error'}
    <Command.Item>{getLocalMessage('error')}: {$tabs.error.message}</Command.Item>
  {:else if $tabs.isFetching}
    <Command.Loading>{getLocalMessage('backgroundUpdate')}</Command.Loading>
  {:else if $tabs.data.length > 0}
    <Command.Empty>
      {getLocalMessage('noSearchFound')}
    </Command.Empty>
    <Command.Group heading={getLocalMessage('tabs')}>
      {#each $tabs.data as tab (tab.id)}
        <TabItem {inputValue} {tab} isDisabled={isSyncing || !canInjectScript(tab.url)} />
      {/each}
    </Command.Group>
  {:else}
    <Command.Empty>
      {getLocalMessage('noTabsFound')}
    </Command.Empty>
  {/if}
</Command.List>
