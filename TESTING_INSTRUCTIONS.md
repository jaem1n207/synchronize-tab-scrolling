# Testing Instructions for Scroll Synchronization

## Testing Setup

1. **Build the extension**:

   ```bash
   pnpm dev
   ```

2. **Load the extension in Chrome/Edge/Brave**:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder from this project

3. **Open test pages**:
   - Open the test HTML file in multiple tabs: `file:///path/to/test-scroll.html`
   - Or open any long webpage (e.g., Wikipedia articles, documentation sites)
   - You need at least 2 tabs open for testing

## Testing the Scroll Sync Feature

### Starting Synchronization

1. Click the extension icon in the toolbar
2. Select 2 or more tabs from the list
3. Click "Start Sync" button
4. You should see:
   - Control panels appear in all synced tabs (floating UI)
   - Green "SYNC ACTIVE" indicator in bottom-left corner of each tab
   - Console logs showing sync initialization

### Testing Scroll Synchronization

1. **Basic Scroll Test**:
   - Scroll in any synced tab
   - Other tabs should scroll proportionally
   - Watch for the debug indicators:
     - Orange "SENDING..." when you scroll
     - Blue "RECEIVING..." in other tabs
     - Green checkmarks when successful

2. **Ratio Mode Test**:
   - Default mode is "ratio"
   - When you're 50% down one page, other tabs should be 50% down their pages
   - Test with pages of different lengths
   - The scroll percentage indicator on test page should match across tabs

3. **Visual Indicators**:
   - **Bottom-left corner**: Debug status indicator
     - Green: Sync active
     - Orange: Sending scroll
     - Blue: Receiving scroll
     - Red: Error occurred
   - **Control Panel**: Shows sync status and linked tabs

### Console Debugging

Open Developer Console (F12) to see detailed logs:

#### Key Log Messages to Look For:

**Successful Flow**:

1. `🟢 SYNC STARTED` - Sync initialized
2. `🟣 SCROLL EVENT` - User scrolled
3. `📤 SENDING scroll position` - Sending to background
4. `📥 RECEIVED sync-scroll` - Background received message
5. `📨 SENDING apply-scroll to tab` - Background forwarding to other tabs
6. `🟡 APPLY SCROLL` - Target tab received message
7. `🎯 APPLYING scroll position` - Actually scrolling
8. `✅ ScrollTo executed` - Scroll successful

**Problem Indicators**:

- `⚪ Scroll event but no active group` - Sync not properly initialized
- `⛔ Group not found or inactive` - Sync group issue
- `❌ Failed to sync scroll` - Message sending failed
- `⚠️ Scroll position mismatch` - Scroll calculation error

### Troubleshooting

1. **No scrolling happening**:
   - Check console for error messages
   - Verify tabs are selected in popup
   - Ensure control panels are visible
   - Look for the green "SYNC ACTIVE" indicator

2. **Scrolling is jumpy**:
   - Check if `isReceivingScroll` flag is working
   - Look for "Skipping sync - receiving scroll" messages
   - Verify throttle is working (50ms delay)

3. **Control panel state mismatch**:
   - Close and reopen the extension popup
   - Stop and restart sync
   - Check for duplicate control panels

4. **Messages not being sent/received**:
   - Check background script console (`chrome://extensions` > Service Worker)
   - Look for content script injection errors
   - Verify webext-bridge is working

## Expected Behavior

When working correctly:

1. Scrolling in one tab causes proportional scrolling in all other synced tabs
2. The scroll ratio is maintained (e.g., 25% down = 25% down in all tabs)
3. Visual indicators flash to show sending/receiving
4. No infinite scroll loops occur
5. Control panels show correct sync state
6. Console shows clean message flow without errors

## Test Scenarios

1. **Two identical pages**: Should scroll 1:1
2. **Different length pages**: Should maintain ratio
3. **Fast scrolling**: Should throttle properly
4. **Scroll to top/bottom**: Should reach extremes correctly
5. **Start/stop sync repeatedly**: Should handle state changes
6. **Close a synced tab**: Should continue syncing remaining tabs
7. **Add new tab to sync**: Should integrate smoothly

## Debug Information Collection

If issues occur, collect:

1. Console logs from affected tabs
2. Background script console logs
3. Screenshot of control panels
4. Description of exact steps to reproduce
5. Browser and OS information
