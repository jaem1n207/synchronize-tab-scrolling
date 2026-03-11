import type { TranslationStrings } from './types';

const zh_TW: TranslationStrings = {
  header: {
    features: '功能',
    useCases: '使用情境',
    install: '安裝',
  },
  hero: {
    headline: '不再迷失閱讀位置。',
    subheadline:
      '捲動一次，全部同步。免費的瀏覽器擴充功能，讓您的標籤頁同步捲動 — 非常適合並排比較翻譯、程式碼或文件。',
    enableSync: '啟用同步',
    syncing: '同步中',
    scrollHint: '捲動左側面板',
    scrollHintSynced: '捲動任一面板',
    scrollHintAdjusting: '按住 {modifier} + 捲動以個別調整',
    manualOffset: '手動偏移',
    synced: '已同步',
    notSynced: '未同步',
    adjusting: '調整中',
    trustSignal: '免費 · 無需帳號 · 開放原始碼',
  },
  problem: {
    text: '您不只是在手動捲動兩個標籤頁。您正在做瀏覽器本應自動處理的工作。',
  },
  howItWorks: {
    title: '運作方式',
    steps: [
      {
        title: '安裝擴充功能',
        description: '一鍵加入瀏覽器。支援 Chrome、Firefox、Edge 及所有基於 Chromium 的瀏覽器。',
      },
      {
        title: '選擇要同步的標籤頁',
        description: '開啟擴充功能彈出視窗，選取您想要連結的標籤頁。',
      },
      {
        title: '在任何地方捲動',
        description: '在一個標籤頁中捲動 — 所有已連結的標籤頁會自動跟隨到相同位置。',
      },
    ],
  },
  features: {
    title: '功能',
    items: [
      {
        title: '即時捲動同步',
        description: '在一個標籤頁中捲動，所有已連結的標籤頁會立即移動到相同的相對位置。',
      },
      {
        title: '手動位置調整',
        description: '捲動時按住 {modifier}，可單獨調整特定標籤頁，而不會中斷同步。',
      },
      {
        title: '自動同步建議',
        description: '在多個標籤頁開啟相同的 URL？系統會以提示通知建議您一鍵開始同步。',
      },
      {
        title: 'URL 導覽同步',
        description: '在一個標籤頁中點擊連結，所有已連結的標籤頁會一起導覽至相同的 URL。',
      },
      {
        title: '網域排除',
        description: '將特定網域永久排除在自動同步建議之外。',
      },
      {
        title: '自動重新連接',
        description: '休眠後連線中斷？擴充功能會自動重新連接並繼續同步。',
      },
    ],
  },
  useCases: {
    title: '適合哪些人？',
    items: [
      {
        role: '翻譯人員',
        description: '並排比較原文與譯文，不再迷失閱讀位置。',
      },
      {
        role: '開發人員',
        description: '比較程式碼版本、審查 pull request，或在原始碼旁閱讀文件。',
      },
      {
        role: '研究人員',
        description: '同時交叉參照多篇論文或資料來源。',
      },
      {
        role: '學生',
        description: '同時研讀教科書和筆記，閱讀時保持兩者同步。',
      },
    ],
  },
  trust: {
    title: '隱私優先。始終如此。',
    badges: {
      noData: '不收集資料',
      noAnalytics: '無追蹤 Cookie',
      offline: '可離線使用',
      openSource: '開放原始碼',
      languages: '9 種語言',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: '支援所有主流瀏覽器',
  },
  cta: {
    title: '準備好同步了嗎？',
    subtitle: '永久免費。3 秒完成安裝。',
  },
  footer: {
    tagline: '捲動一次，全部同步。',
    links: '連結',
    support: '支援',
    github: 'GitHub',
    reportBug: '回報問題',
    email: '電子郵件',
    license: 'Source Available 授權',
    madeBy: '製作者',
  },
  common: {
    addTo: '加入 {browser}',
    alsoAvailableOn: '也可在以下平台取得',
  },
};

export default zh_TW;
