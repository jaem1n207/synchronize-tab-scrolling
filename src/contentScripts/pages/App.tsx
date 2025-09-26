import { useState, useEffect } from 'react';

import { onMessage } from 'webext-bridge/content-script';

import { ControlPanel } from '../components/ControlPanel';

export const App = () => {
  const [showPanel, setShowPanel] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);

  useEffect(() => {
    // Show panel when sync starts
    const handleSyncStarted = () => {
      // Show the panel for all tabs in the sync group
      setShowPanel(true);
      setSyncStarted(true);
    };

    // Keep panel visible even when sync stops
    const handleSyncStopped = () => {
      // Keep panel visible but show "not syncing" state
      setSyncStarted(false);
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

  return <ControlPanel key={syncStarted ? 'syncing' : 'not-syncing'} />;
};
