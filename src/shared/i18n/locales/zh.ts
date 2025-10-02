import type { Translations } from '../types';

export const zh: Translations = {
  appName: '标签页滚动同步',
  appDescription: '在多个浏览器标签页之间同步滚动位置',

  tabSelection: {
    heading: '选择要同步的标签页',
    selectedCount: '已选择 {count} 个',
    noTabs: '没有可用的标签页',
    ineligibleTab: '此标签页无法同步',
  },

  syncControls: {
    startSync: '开始同步',
    stopSync: '停止同步',
    resync: '重新同步',
    syncActive: '同步活动',
    syncInactive: '同步未激活',
  },

  panel: {
    minimize: '最小化',
    maximize: '最大化',
    dragToMove: '拖动以移动',
  },

  linkedSites: {
    heading: '已链接的标签页',
    currentTab: '当前',
    switchToTab: '切换到此标签页',
    noLinkedTabs: '当前没有链接的标签页',
  },

  connectionStatus: {
    connected: '已连接',
    disconnected: '已断开',
    error: '错误',
  },

  errors: {
    loadTabsFailed: '加载标签页失败。请刷新扩展程序。',
    startSyncFailed: '启动同步失败。请重试。',
    stopSyncFailed: '警告：未能正确停止同步。本地状态已清除。',
    switchTabFailed: '切换标签页失败。该标签页可能已关闭。',
    minTabsRequired: '请至少选择 2 个标签页进行同步。',
    tabClosedOrUnavailable: '标签页已关闭或不可用',
  },

  success: {
    syncStarted: '成功启动了 {count} 个标签页的同步。',
    syncStopped: '同步已成功停止。',
    tabSwitched: '成功切换到标签页。',
  },

  warnings: {
    stopSyncWarning: '确定要停止同步吗？',
  },

  ineligibilityReasons: {
    webStore: '由于安全限制，网上应用店页面无法同步',
    googleServices: 'Google 服务页面有阻止同步的限制',
    browserInternal: '由于安全限制，浏览器内部页面无法同步',
    specialProtocol: '特殊协议页面无法同步',
    securityRestriction: '由于安全限制，此页面无法同步',
  },

  features: {
    manualScrollMode: '按住 Option/Alt 键滚动单个标签页',
    elementBasedSync: '使用 DOM 结构的智能内容匹配',
    urlNavigationSync: '链接的标签页一起导航',
    statePersistence: '您的首选项会自动保存',
  },
};
