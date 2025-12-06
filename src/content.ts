import { initializeDetector, detectFaces, createFingerprint, compareFaces } from './faceRecognition';

let isEnabled = false;
let referenceFingerprints = [];
const processedImages = new WeakSet<HTMLImageElement>();

// Initialize on page load
(async () => {
  await initializeDetector();
  
  // Load settings from storage
  chrome.storage.local.get(['enabled', 'faceFingerprints'], (result) => {
    isEnabled = result.enabled || false;
    referenceFingerprints = result.faceFingerprints || [];
    
    if (isEnabled && referenceFingerprints.length > 0) {
      scanPage();
    }
  });
  
  observeNewImages();
})();

// Scan all images on page
async function scanPage() {
  const images = document.querySelectorAll('img');
  console.log(`FaceBlur: Scanning ${images.length} images`);
  
  for (const img of Array.from(images)) {
    if (!processedImages.has(img)) {
      await processImage(img);
    }
  }
}

// Process a single image
async function processImage(img: HTMLImageElement) {
  if (processedImages.has(img)) return;
  
  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) {
    img.addEventListener('load', () => processImage(img), { once: true });
    return;
  }
  
  // Skip tiny images
  if (img.naturalWidth < 50 || img.naturalHeight < 50) {
    processedImages.add(img);
    return;
  }
  
  try {
    // Detect faces
    const detections = await detectFaces(img);
    
    if (detections.length === 0) {
      processedImages.add(img);
      return;
    }
    
    // Check if any face matches reference
    let shouldBlur = false;
    
    for (const detection of detections) {
      const detectedFingerprint = createFingerprint(detection);
      
      for (const refFingerprint of referenceFingerprints) {
        if (compareFaces(detectedFingerprint, refFingerprint)) {
          shouldBlur = true;
          break;
        }
      }
      
      if (shouldBlur) break;
    }
    
    if (shouldBlur) {
      blurImage(img);
    }
    
    processedImages.add(img);
  } catch (error) {
    console.error('Error processing image:', error);
    processedImages.add(img);
  }
}

// Blur an image with click-to-unblur
function blurImage(img: HTMLImageElement) {
  img.style.filter = 'blur(20px)';
  img.style.transition = 'filter 0.3s ease';
  img.style.cursor = 'pointer';
  img.title = 'Click to temporarily unblur';
  
  const toggleBlur = () => {
    if (img.style.filter === 'blur(20px)') {
      img.style.filter = 'none';
      img.title = 'Click to blur again';
    } else {
      img.style.filter = 'blur(20px)';
      img.title = 'Click to temporarily unblur';
    }
  };
  
  img.addEventListener('click', toggleBlur);
}

// Watch for new images (dynamic content)
function observeNewImages() {
  const observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;
    
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLImageElement) {
          processImage(node);
        } else if (node instanceof HTMLElement) {
          const images = node.querySelectorAll('img');
          images.forEach(img => processImage(img));
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleBlur') {
    isEnabled = message.enabled;
    
    if (!isEnabled) {
      // Unblur all images
      document.querySelectorAll('img[data-faceblur-blurred="true"]')
        .forEach(img => unblurImage(img as HTMLImageElement));
    } else {
      scanPage();
    }
  } else if (message.action === 'scanPage') {
    scanPage();
  } else if (message.action === 'updateReferences') {
    referenceFingerprints = message.fingerprints || [];
    scanPage();
  }
  
  sendResponse({ success: true });
  return true;
});