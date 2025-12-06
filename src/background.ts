// Empty service worker (required for Manifest V3)
chrome.runtime.onInstalled.addListener(() => {
    console.log('FaceBlur installed');
  });