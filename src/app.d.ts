/* eslint-disable @typescript-eslint/no-explicit-any */
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  type FunctionShape<T = any> = (...args: any[]) => T;

  interface Window {
    webextension: typeof webExtension;
  }

  declare namespace webExtension {
    namespace tabs {
      type Tab = chrome.tabs.Tab | browser.tabs.Tab;
      type QueryInfo = chrome.tabs.Tab | browser.tabs._QueryQueryInfo;
      function query(queryInfo: QueryInfo): Promise<Tab[]>;
      function get(tabId: number): Promise<Tab>;
    }

    namespace runtime {
      function sendMessage(
        message: any,
        options?: browser.runtime._SendMessageOptions
      ): Promise<any>;
    }
  }
}

export {};
