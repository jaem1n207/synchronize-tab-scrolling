<p align="center">
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc" target="_blank" rel="noreferrer noopener">
    <img width="250" src="https://github.com/jaem1n207/synchronize-tab-scrolling/assets/50766847/ec9b53f7-b8b7-46fe-9b0f-bf08b38cb940" alt="Chrome Web Store" />
  <a />
</p>
<p align="center">A browser extension that lets you <strong>synchronize</strong> the scrolling position of multiple tabs</p>
<p align="center">
  <a rel="noreferrer noopener" target="_blank" href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Chrome Web Store" src="https://img.shields.io/badge/CHROME-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white">
  </a>
  <a rel="noreferrer noopener" target="_blank" href="https://microsoftedge.microsoft.com/addons/detail/synchronize-tab-scrolling/jonclaakmpjodjggkadldgkapccdofnn">
    <img alt="Microsoft Edge Add-ons" src="https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=Microsoft-edge&logoColor=white">
  </a>
  <a rel="noreferrer noopener" target="_blank" href="https://addons.mozilla.org/firefox/addon/synchronize-tab-scrolling">
    <img alt="Firefox Add-ons" src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=Firefox-Browser&logoColor=white">
  </a>
  <a rel="noreferrer noopener" target="_blank" href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Brave Extensions" src="https://img.shields.io/badge/Brave-FB542B?style=for-the-badge&logo=Brave&logoColor=white">
  </a>
</p>
<p align="center">
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/releases">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/jaem1n207/synchronize-tab-scrolling?include_prereleases&sort=semver&display_name=release&style=for-the-badge&logo=semanticrelease&logoColor=white&color=%236096B4">
  </a>
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/pulls">
    <img alt="GitHub pull requests" src="https://img.shields.io/github/issues-pr/jaem1n207/synchronize-tab-scrolling?style=for-the-badge&logo=github&logoColor=white&color=%236096B4">
  </a>
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/jaem1n207/synchronize-tab-scrolling?style=for-the-badge&logo=github&logoColor=white&color=%236096B4">
  </a>
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/blob/main/LICENSE">
    <img alt="GitHub License" src="https://img.shields.io/github/license/jaem1n207/synchronize-tab-scrolling?style=for-the-badge&logoColor=white&color=%236096B4">
  </a>
</p>
<h1 align="center">Synchronize Tab Scrolling</h2>

ENGLISH | [한국어](./README-ko_kr.md)

Synchronize Tab Scrolling is a powerful cross-browser extension that automatically synchronizes scroll positions across multiple tabs, enabling seamless side-by-side document comparison for translators, researchers, developers, and content reviewers.

## ✨ Features

### Core Synchronization

- **Real-time Scroll Sync**: <100ms synchronization delay between tabs with proportional positioning
- **Intelligent Element Matching**: DOM structure analysis for content-aware synchronization
- **Manual Scroll Control**: Hold Option/Alt key to temporarily scroll individual tabs
- **URL Navigation Sync**: Linked tabs navigate together (back, forward, new URLs)
- **State Persistence**: Maintains your selections across popup reopens
- **Security Compliant**: Automatic handling of restricted URLs

### User Experience

- **Draggable Control Panel**: Smooth edge-snapping with minimize/maximize animations
- **Connection Status**: Visual indicators for sync state and tab eligibility
- **Hardware Accelerated**: Smooth 200ms animations using CSS transforms
- **Cross-Browser**: Works identically on Chrome, Edge, Firefox, and Brave

<br />

## Contents

- [Contents](#contents)
- [Intro](#intro)
- [Usage](#usage)
- [Youtube Video Link](#youtube-video-link)
- [Privacy Policy](#privacy-policy)
- [Unsupported Pages](#unsupported-pages)
- [SUPPORT](#support)
- [License](#license)

## Intro

This extension provides convenience for users reading original and translated documents across multiple tabs.
When the user scrolls in one tab, the linked tab automatically scrolls to the same position, allowing for easy comparison and reading of the original and translated texts.
This feature is particularly useful when translating documents or referencing multilingual documents simultaneously.

## Usage

### Basic Usage

1. **Open Multiple Tabs**: Open 2 or more tabs with content you want to compare
2. **Click Extension Icon**: Click the extension icon in your browser toolbar
3. **Select Tabs**: Check the tabs you want to synchronize in the popup
4. **Start Syncing**: Click "Start Sync" button
5. **Scroll**: Scroll in any selected tab - all linked tabs will follow!

To stop synchronizing, click "Stop Sync" button or close the popup. Your tab selections and panel preferences are automatically saved.

### Advanced Features

#### 📍 Manual Scroll Mode

Hold **Option** (Mac) or **Alt** (Windows/Linux) while scrolling to temporarily disable synchronization for the current tab. Release the key to re-enable sync.

#### 🎯 Element-Based Synchronization

The extension automatically detects semantic elements (headings, paragraphs, sections) and matches content across tabs for more accurate synchronization on similar documents. This works especially well when comparing:

- Original and translated documents with similar structure
- Different versions of the same document
- Side-by-side code comparisons

#### 🔗 URL Navigation Sync

When sync is active, navigating to a new URL in any linked tab will automatically navigate all other linked tabs to the same URL. This includes:

- Clicking links in the page
- Browser back/forward buttons
- Single Page Application (SPA) navigation
- Direct URL changes

#### 💾 State Persistence

Your preferences are automatically saved:

- Selected tabs (restored if tabs still exist)
- Panel minimized/maximized state
- Panel position (when dragged)
- Sync mode preferences

### Tab Eligibility

Some pages cannot be synchronized due to browser security restrictions:

- ❌ Browser internal pages (chrome://, about:, etc.)
- ❌ Extension store pages
- ❌ Google services (Drive, Docs, Gmail, etc.)
- ❌ Special protocols (view-source:, data:, file:)
- ✅ Regular web pages (HTTP/HTTPS)

## Youtube Video Link

<a target="_blank" rel="noreferrer noopener" href="https://www.youtube.com/watch?v=DxFYu6XHGJY&ab_channel=%EC%9D%B4%EC%9E%AC%EB%AF%BC">
 <img src="https://img.youtube.com/vi/DxFYu6XHGJY/0.jpg" alt="Watch the video" width="480" height="360" border="10" title="Synchronize Tab Scrolling Promotion - Click to Watch!" />
</a>

## Privacy Policy

The Synchronize Tab Scrolling extension has no ads, no analytics, no trackers, and no use of cookies. It is also an open-source project.

## Unsupported Pages

Due to security and technical limitations, this extension does not function on the following types of pages:

- Browser internal pages (e.g., chrome://, about:, moz-extension://)
- Extension store pages
- Data URLs (data:)
- Developer tools (devtools:)
- Source view pages (view-source:)
- Google services (e.g., Google Accounts, Analytics, Search Console, Docs, Drive, Gmail, Sheets, Calendar, Slides, Meet, Photos)

On these pages, the corresponding items in the tab list will appear disabled.

## 🛠️ Development

### Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **pnpm**: v9+
- **Git**: Latest version

### Setup

```bash
# Clone the repository
git clone https://github.com/jaem1n207/synchronize-tab-scrolling.git
cd synchronize-tab-scrolling

# Install dependencies
pnpm install

# Development mode (Chrome/Edge/Brave)
pnpm dev

# Development mode (Firefox)
pnpm dev-firefox

# Type checking
pnpm typecheck

# Linting with auto-fix
pnpm lint:fix

# Production build
pnpm build

# Package extension (.zip, .crx, .xpi)
pnpm pack
```

### Development Commands

| Command               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `pnpm dev`            | Start development server for Chrome/Edge/Brave |
| `pnpm dev-firefox`    | Start development server for Firefox           |
| `pnpm build`          | Build production version                       |
| `pnpm typecheck`      | Run TypeScript type checking                   |
| `pnpm lint:fix`       | Lint and auto-fix code issues                  |
| `pnpm format:fix`     | Format code with Prettier                      |
| `pnpm test`           | Run test suite                                 |
| `pnpm pack`           | Package extension for distribution             |
| `pnpm start:chromium` | Launch extension in Chrome/Edge/Brave          |
| `pnpm start:firefox`  | Launch extension in Firefox                    |

### Project Structure

```
synchronize-tab-scrolling/
├── src/
│   ├── background/         # Background script (service worker)
│   ├── contentScripts/     # Content scripts injected into pages
│   │   ├── index.ts       # Main content script entry
│   │   ├── scrollSync.ts  # Scroll synchronization logic
│   │   └── keyboardHandler.ts  # Manual scroll adjustment
│   ├── popup/             # Popup UI (React)
│   │   ├── components/    # React components
│   │   └── types.ts       # TypeScript definitions
│   ├── options/           # Options page
│   └── shared/            # Shared utilities and types
│       ├── lib/          # Utility functions
│       ├── types/        # Shared type definitions
│       └── styles/       # Global styles
├── public/               # Static assets
├── dist/                 # Build output
└── extension/           # Packaged extensions
```

### Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite with HMR support
- **Styling**: UnoCSS + Tailwind + Shadcn UI
- **State Management**: React Query (@tanstack/react-query)
- **Extension API**: webextension-polyfill (cross-browser)
- **Messaging**: webext-bridge (type-safe messaging)
- **Error Tracking**: Sentry
- **Icons**: unplugin-icons

### Architecture

#### Message Flow

```
Popup UI (React)
    ↓ webext-bridge
Background Script (Service Worker)
    ↓ webext-bridge
Content Scripts (All Tabs)
```

#### Synchronization Algorithms

**Ratio-Based (Default)**:

```typescript
ratio = scrollTop / (scrollHeight - clientHeight);
targetScrollTop = ratio * (targetScrollHeight - targetClientHeight);
```

**Element-Based (Advanced)**:

1. Detect semantic elements (h1-h6, article, section, p, etc.)
2. Find nearest element to current scroll position
3. Match element index across tabs
4. Scroll to matched element with position offset

### Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and run tests: `pnpm test`
4. Run linting: `pnpm lint:fix`
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/) format
6. Push and open a Pull Request

## SUPPORT

I use it myself to improve usability and catch bugs, but if you encounter any issues, please report it below:

- Email: <a href="mailto:tech.jmtt@gmail.com">tech.jmtt@gmail.com</a>
- GitHub: <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/issues/new?title=%3CSUMMARIZE%20THE%20PROBLEM%3E&labels=bug&assignees=jaem1n207" title="report bug">Report a bug on github issue</a>

## 🗺️ Roadmap

### Completed ✅

- [x] Basic scroll synchronization with <100ms delay
- [x] Element-based synchronization mode
- [x] Manual scroll adjustment with modifier keys
- [x] URL navigation synchronization
- [x] State persistence with browser.storage
- [x] Cross-browser support (Chrome, Edge, Firefox, Brave)
- [x] Draggable control panel with animations
- [x] Security compliance for restricted URLs

### In Progress 🚧

- [ ] Multi-language support (i18n)
- [ ] Error handling and recovery mechanisms
- [ ] Performance monitoring dashboard

### Planned 📋

- [ ] Sync mode preferences (ratio vs element-based)
- [ ] Advanced UI customization options
- [ ] Automatic scroll speed adjustment
- [ ] Tab group synchronization
- [ ] Export/import sync configurations

## License

This project is licensed under the MIT License. For more details, please refer to the [LICENSE](./LICENSE) file.
