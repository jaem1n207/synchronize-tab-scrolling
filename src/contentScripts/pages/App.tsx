import { useState, useEffect } from 'react';

import { onMessage } from 'webext-bridge/content-script';

import { ControlPanel } from '../components/ControlPanel';

export const App = () => {
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    // Show panel when sync starts
    const handleSyncStarted = () => {
      setShowPanel(true);
    };

    // Update when sync stops
    const handleSyncStopped = () => {
      // Keep panel visible but show "not syncing" state
    };

    // Register message listeners
    onMessage('sync-started', handleSyncStarted);
    onMessage('sync-stopped', handleSyncStopped);

    // Note: webext-bridge doesn't provide unsubscribe
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Always show the control panel once sync has been started at least once
  if (!showPanel) {
    return null;
  }

  return (
    <div className="theme-slate">
      <ControlPanel />
    </div>
  );
};
