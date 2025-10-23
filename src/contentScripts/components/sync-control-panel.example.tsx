import { useState } from 'react';

import { SyncControlPanel } from './sync-control-panel';

/**
 * Example usage of SyncControlPanel component
 * This demonstrates how to integrate the control panel into your content script
 */
export const SyncControlPanelExample = () => {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);

  const handleToggle = () => {
    setUrlSyncEnabled((prev) => !prev);
    // Add your sync logic here
    console.log('URL sync toggled:', !urlSyncEnabled);
  };

  return (
    <div>
      <SyncControlPanel urlSyncEnabled={urlSyncEnabled} onToggle={handleToggle} />
    </div>
  );
};
