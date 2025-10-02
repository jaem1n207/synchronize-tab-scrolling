import type { Translations } from '../types';

export const hi: Translations = {
  appName: 'टैब स्क्रॉल सिंक्रनाइज़ेशन',
  appDescription: 'कई ब्राउज़र टैब में स्क्रॉल पोजीशन को सिंक्रनाइज़ करें',

  tabSelection: {
    heading: 'सिंक करने के लिए टैब चुनें',
    selectedCount: '{count} चयनित',
    noTabs: 'कोई टैब उपलब्ध नहीं',
    ineligibleTab: 'यह टैब सिंक्रनाइज़ नहीं किया जा सकता',
  },

  syncControls: {
    startSync: 'सिंक शुरू करें',
    stopSync: 'सिंक बंद करें',
    resync: 'फिर से सिंक करें',
    syncActive: 'सिंक सक्रिय',
    syncInactive: 'सिंक निष्क्रिय',
  },

  panel: {
    minimize: 'छोटा करें',
    maximize: 'बड़ा करें',
    dragToMove: 'स्थानांतरित करने के लिए खींचें',
  },

  linkedSites: {
    heading: 'लिंक किए गए टैब',
    currentTab: 'वर्तमान',
    switchToTab: 'इस टैब पर स्विच करें',
    noLinkedTabs: 'वर्तमान में कोई टैब लिंक नहीं है',
  },

  connectionStatus: {
    connected: 'कनेक्टेड',
    disconnected: 'डिस्कनेक्टेड',
    error: 'त्रुटि',
  },

  errors: {
    loadTabsFailed: 'टैब लोड करने में विफल। कृपया एक्सटेंशन को रीफ्रेश करें।',
    startSyncFailed: 'सिंक्रनाइज़ेशन शुरू करने में विफल। कृपया पुनः प्रयास करें।',
    stopSyncFailed: 'चेतावनी: सिंक को ठीक से बंद करने में विफल। स्थानीय स्थिति साफ़ कर दी गई है।',
    switchTabFailed: 'टैब स्विच करने में विफल। टैब बंद हो गया हो सकता है।',
    minTabsRequired: 'कृपया सिंक्रनाइज़ करने के लिए कम से कम 2 टैब चुनें।',
    tabClosedOrUnavailable: 'टैब बंद है या उपलब्ध नहीं है',
  },

  success: {
    syncStarted: '{count} टैब के लिए सिंक्रनाइज़ेशन सफलतापूर्वक शुरू हुआ।',
    syncStopped: 'सिंक्रनाइज़ेशन सफलतापूर्वक बंद हुआ।',
    tabSwitched: 'टैब सफलतापूर्वक स्विच हुआ।',
  },

  warnings: {
    stopSyncWarning: 'क्या आप वाकई सिंक्रनाइज़ेशन बंद करना चाहते हैं?',
  },

  ineligibilityReasons: {
    webStore: 'सुरक्षा प्रतिबंधों के कारण वेब स्टोर पेज सिंक्रनाइज़ नहीं किए जा सकते',
    googleServices: 'Google सेवाओं के पेजों में प्रतिबंध हैं जो सिंक्रनाइज़ेशन को रोकते हैं',
    browserInternal: 'सुरक्षा प्रतिबंधों के कारण ब्राउज़र आंतरिक पेज सिंक्रनाइज़ नहीं किए जा सकते',
    specialProtocol: 'विशेष प्रोटोकॉल पेज सिंक्रनाइज़ नहीं किए जा सकते',
    securityRestriction: 'सुरक्षा प्रतिबंधों के कारण यह पेज सिंक्रनाइज़ नहीं किया जा सकता',
  },

  features: {
    manualScrollMode: 'व्यक्तिगत टैब स्क्रॉल करने के लिए Option/Alt दबाएं',
    elementBasedSync: 'DOM संरचना का उपयोग करके बुद्धिमान सामग्री मिलान',
    urlNavigationSync: 'लिंक किए गए टैब एक साथ नेविगेट करते हैं',
    statePersistence: 'आपकी प्राथमिकताएँ स्वचालित रूप से सहेजी जाती हैं',
  },
};
