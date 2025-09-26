# Testing Instructions

## Installation

### Chrome/Edge/Brave
1. Open your browser and go to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project
5. The extension icon should appear in your toolbar

### Firefox
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the `extension` folder and select `manifest.json`

## Testing the Extension

1. **Open Test Pages**:
   - Open `test.html` in 2-3 browser tabs
   - Or open any regular websites in multiple tabs

2. **Start Synchronization**:
   - Click the extension icon in your toolbar
   - The popup should show available tabs
   - Select 2 or more tabs by clicking the checkboxes
   - Choose sync mode (Ratio or Element-based)
   - Click "Start Sync"

3. **Test Scrolling**:
   - Scroll in any synced tab
   - Other tabs should follow the scroll position
   - Try different scrolling methods:
     - Mouse wheel
     - Scroll bar dragging
     - Page Up/Down keys
     - Home/End keys

4. **Test Control Panel**:
   - Look for a small control panel on the left edge of synced tabs
   - Click to expand it
   - Shows list of linked tabs
   - Click a tab name to switch to it
   - Drag the panel to reposition it

5. **Test Features**:
   - **URL Sync**: Enable the link icon to sync navigation
   - **Language**: Extension should detect your browser language
   - **Accessibility**: Try Tab key navigation in the popup
   - **Stop Sync**: Click "Stop Sync" to end synchronization

## Troubleshooting

- **"No eligible tabs"**: Make sure you have regular web pages open (not chrome://, edge://, about: pages)
- **Tabs not syncing**: Check browser console for errors (F12)
- **Extension not loading**: Ensure you built the project with `pnpm build`
- **Popup blank**: Reload the extension from the extensions page

## Debug Logs

Open browser DevTools console (F12) and look for logs prefixed with:
- `[popup-tab-list]` - Popup component logs
- `[background]` - Background script logs
- `[content-script]` - Content script logs
- `[control-panel]` - Control panel logs