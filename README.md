<p align="center">
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc" target="_blank" rel="noreferrer noopener">
    <img width="250" src="https://github.com/jaem1n207/synchronize-tab-scrolling/assets/50766847/ec9b53f7-b8b7-46fe-9b0f-bf08b38cb940" alt="Synchronize Tab Scrolling Logo" />
  </a>
</p>

<h1 align="center">Synchronize Tab Scrolling</h1>

<p align="center">
  <strong>Scroll once, sync everywhere.</strong><br/>
  A browser extension that keeps multiple tabs scrolling together.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Chrome" src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white">
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/synchronize-tab-scrolling/jonclaakmpjodjggkadldgkapccdofnn">
    <img alt="Edge" src="https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=Microsoft-edge&logoColor=white">
  </a>
  <a href="https://addons.mozilla.org/firefox/addon/synchronize-tab-scrolling">
    <img alt="Firefox" src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=Firefox-Browser&logoColor=white">
  </a>
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Brave" src="https://img.shields.io/badge/Brave-FB542B?style=for-the-badge&logo=Brave&logoColor=white">
  </a>
</p>

<p align="center">
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/releases">
    <img alt="Release" src="https://img.shields.io/github/v/release/jaem1n207/synchronize-tab-scrolling?style=flat-square&color=6096B4">
  </a>
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/jaem1n207/synchronize-tab-scrolling?style=flat-square&color=6096B4">
  </a>
</p>

<p align="center">
  ENGLISH | <a href="./README-ko_kr.md">한국어</a>
</p>

---

## What is this?

When you read two documents side by side—like an original and its translation—scrolling them together can be tedious. This extension solves that problem.

**Scroll in one tab, and all linked tabs scroll to the same position automatically.**

---

## How to Use

### Step 1: Install

Click one of the browser badges above to install from your browser's extension store.

### Step 2: Open tabs

Open two or more tabs with the content you want to compare.

### Step 3: Start syncing

1. Click the extension icon in your browser toolbar
2. Select the tabs you want to sync (check the boxes)
3. Click **"Start Sync"**

### Step 4: Scroll!

Scroll in any synced tab. All linked tabs follow automatically.

### Tip: Manual Position Adjustment

When comparing documents like originals and translations, content lengths often differ due to language characteristics—some languages express the same idea more concisely or verbosely. As you scroll, the reading positions may gradually drift apart.

**Hold Option (Mac) or Alt (Windows)** while scrolling to adjust a specific tab's position without affecting others. Release the key, and sync continues from the new alignment.

### Step 5: Stop syncing

Click the extension icon again and select **"Stop Sync"**, or simply close the synced tabs.

---

## Demo Video

<a href="https://www.youtube.com/watch?v=DxFYu6XHGJY">
  <img src="https://img.youtube.com/vi/DxFYu6XHGJY/0.jpg" alt="Demo Video" width="480" height="360" />
</a>

---

## Pages That Don't Work

Due to browser security restrictions, the extension cannot sync these pages:

- Browser internal pages (`chrome://`, `edge://`, `about:`)
- Extension stores
- Google services (Docs, Drive, Gmail, Sheets, etc.)
- Some web apps (Figma, JIRA, Microsoft Office Online, Notion, etc.)
- Special URLs (`view-source:`, `data:`, `file://`)

These tabs will appear disabled in the selection list.

---

## Who is this for?

- reviewing multiple papers simultaneously
- comparing code versions side by side
- comparing original and translated documents
- **Anyone** who works with multiple documents at once

---

## Features

### Real-time Scroll Sync

When you scroll in one tab, all linked tabs move to the same relative position instantly.

```mermaid
flowchart LR
    subgraph You["Your Action"]
        A[Scroll in Tab A]
    end

    A --> B[Extension detects position]
    B --> C[Tab B scrolls to same position]
    B --> D[Tab C scrolls to same position]
```

### Manual Position Adjustment

Sometimes documents don't line up perfectly. Hold **Option** (Mac) or **Alt** (Windows) while scrolling to adjust individual tabs without breaking the sync.

```mermaid
flowchart TD
    A["Hold Option/Alt key"] --> B["Scroll freely in one tab"]
    B --> C["Release the key"]
    C --> D["New position is saved"]
    D --> E["Sync continues from new alignment"]
```

### Auto-Reconnection

If a tab loses connection (e.g., after your computer sleeps), the extension automatically reconnects and resumes syncing—no manual intervention needed.

```mermaid
flowchart LR
    A[Connection lost] --> B[Auto-detect]
    B --> C[Reconnect]
    C --> D[Resume sync]
```

### URL Navigation Sync

When you click a link in one tab, all linked tabs navigate to the same URL together.

---

## Supported Languages

The extension interface is available in **9 languages**:

| Language          | Code |
| ----------------- | ---- |
| English           | en   |
| 한국어 (Korean)   | ko   |
| 日本語 (Japanese) | ja   |
| Français (French) | fr   |
| Español (Spanish) | es   |
| Deutsch (German)  | de   |
| 中文 (Chinese)    | zh   |
| हिन्दी (Hindi)    | hi   |

---

## Privacy Policy

**Your privacy matters.**

- **No data collection**: We don't collect, store, or transmit any personal data
- **No analytics**: No tracking, no cookies, no telemetry
- **No network requests**: The extension works entirely offline
- **Open source**: You can [inspect every line of code](https://github.com/jaem1n207/synchronize-tab-scrolling)

This extension only accesses tabs you explicitly select for syncing, and all data stays on your device.

---

## Support

Having issues? We're here to help:

- **Email**: [tech.jmtt@gmail.com](mailto:tech.jmtt@gmail.com)
- **GitHub**: [Report a bug](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/new?title=Bug%20Report&labels=bug&assignees=jaem1n207)

---

## Contributing

Want to contribute? Check out our [Contributing Guide](./CONTRIBUTING.md) for development setup and guidelines.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.
