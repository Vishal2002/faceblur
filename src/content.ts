import { initializeDetector, detectFaces, createFingerprint, compareFaces } from './faceRecognition';

let isEnabled = false;
let referenceFingerprints: any[] = [];
const processedImages = new WeakSet<HTMLImageElement>();
const failedImages = new WeakSet<HTMLImageElement>();

// Initialize on page load
(async () => {
  console.log('FaceBlur: Initializing...');
  
  try {
    await initializeDetector();
    console.log('FaceBlur: Detector initialized');
  } catch (error) {
    console.error('FaceBlur: Failed to initialize detector:', error);
    return;
  }
  
  // Load settings from storage
  chrome.storage.local.get(['enabled', 'faceFingerprints'], (result: any) => {
    isEnabled = result.enabled || false;
    referenceFingerprints = result.faceFingerprints || [];
    
    console.log(`FaceBlur: Enabled=${isEnabled}, References=${referenceFingerprints.length}`);
    
    if (isEnabled && referenceFingerprints.length > 0) {
      // Delay initial scan to let page load
      setTimeout(() => scanPage(), 1000);
    }
  });
  
  observeNewImages();
})();

// Scan all images on page
async function scanPage() {
  if (!isEnabled || referenceFingerprints.length === 0) {
    console.log('FaceBlur: Scan skipped - not enabled or no references');
    return;
  }
  
  const images = document.querySelectorAll('img');
  console.log(`FaceBlur: Scanning ${images.length} images`);
  
  let processed = 0;
  let blurred = 0;
  
  for (const img of Array.from(images)) {
    if (!processedImages.has(img) && !failedImages.has(img)) {
      const result = await processImage(img);
      if (result) {
        processed++;
        if (result.blurred) blurred++;
      }
    }
  }
  
  console.log(`FaceBlur: Processed ${processed} images, blurred ${blurred}`);
}

// Create a canvas from image (handles CORS)
function createCanvasFromImage(img: HTMLImageElement): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // Try to draw the image
    ctx.drawImage(img, 0, 0);
    
    // Test if we can read pixels (will throw on CORS)
    ctx.getImageData(0, 0, 1, 1);
    
    return canvas;
  } catch (error) {
    // CORS error - can't process this image
    return null;
  }
}

// Process a single image
async function processImage(img: HTMLImageElement): Promise<{ blurred: boolean } | null> {
  if (processedImages.has(img) || failedImages.has(img)) return null;
  
  // Wait for image to load with timeout
  if (!img.complete || img.naturalWidth === 0) {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkLoad = () => {
        attempts++;
        
        if (img.complete && img.naturalWidth > 0) {
          processImage(img).then(resolve);
        } else if (attempts < maxAttempts) {
          setTimeout(checkLoad, 500);
        } else {
          failedImages.add(img);
          resolve(null);
        }
      };
      
      img.addEventListener('load', () => processImage(img).then(resolve), { once: true });
      img.addEventListener('error', () => {
        failedImages.add(img);
        resolve(null);
      }, { once: true });
      
      setTimeout(checkLoad, 100);
    });
  }
  
  // Skip tiny images
  if (img.naturalWidth < 80 || img.naturalHeight < 80) {
    processedImages.add(img);
    return { blurred: false };
  }
  
  // Skip if already blurred
  if (img.dataset.faceblurBlurred === 'true') {
    processedImages.add(img);
    return { blurred: true };
  }
  
  try {
    // Try to create canvas (handles CORS check)
    const canvas = createCanvasFromImage(img);
    
    if (!canvas) {
      // CORS blocked - skip this image
      failedImages.add(img);
      return null;
    }
    
    // Detect faces
    const detections = await detectFaces(img);
    
    if (detections.length === 0) {
      processedImages.add(img);
      return { blurred: false };
    }
    
    // Check if any face matches reference
    let shouldBlur = false;
    
    for (const detection of detections) {
      const detectedFingerprint = createFingerprint(detection);
      
      for (const refFingerprint of referenceFingerprints) {
        if (compareFaces(detectedFingerprint, refFingerprint)) {
          shouldBlur = true;
          console.log('FaceBlur: Match found!');
          break;
        }
      }
      
      if (shouldBlur) break;
    }
    
    if (shouldBlur) {
      blurImage(img);
      processedImages.add(img);
      return { blurred: true };
    }
    
    processedImages.add(img);
    return { blurred: false };
  } catch (error) {
    console.error('FaceBlur: Error processing image:', error);
    failedImages.add(img);
    return null;
  }
}

// Blur an image with click-to-unblur
function blurImage(img: HTMLImageElement) {
  // Skip if already blurred
  if (img.dataset.faceblurBlurred === 'true') return;
  
  img.style.filter = 'blur(20px)';
  img.style.transition = 'filter 0.3s ease';
  img.style.cursor = 'pointer';
  img.title = 'Click to temporarily unblur';
  img.dataset.faceblurBlurred = 'true';
  
  // Store original filter in case there was one
  if (!img.dataset.faceblurOriginalFilter) {
    img.dataset.faceblurOriginalFilter = img.style.filter || 'none';
  }
  
  const toggleBlur = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (img.style.filter.includes('blur')) {
      img.style.filter = 'none';
      img.title = 'Click to blur again';
    } else {
      img.style.filter = 'blur(20px)';
      img.title = 'Click to temporarily unblur';
    }
  };
  
  // Remove old listeners
  img.removeEventListener('click', toggleBlur);
  img.addEventListener('click', toggleBlur);
}

// Unblur an image
function unblurImage(img: HTMLImageElement) {
  const originalFilter = img.dataset.faceblurOriginalFilter || 'none';
  img.style.filter = originalFilter;
  img.style.cursor = 'default';
  img.title = '';
  delete img.dataset.faceblurBlurred;
  delete img.dataset.faceblurOriginalFilter;
}

// Watch for new images (dynamic content)
function observeNewImages() {
  const observer = new MutationObserver((mutations) => {
    if (!isEnabled || referenceFingerprints.length === 0) return;
    
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLImageElement) {
          setTimeout(() => processImage(node), 100);
        } else if (node instanceof HTMLElement) {
          const images = node.querySelectorAll('img');
          images.forEach(img => {
            setTimeout(() => processImage(img), 100);
          });
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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('FaceBlur: Received message:', message.action);
  
  if (message.action === 'toggleBlur') {
    isEnabled = message.enabled;
    
    if (!isEnabled) {
      // Unblur all images
      document.querySelectorAll('img[data-faceblur-blurred="true"]')
        .forEach(img => unblurImage(img as HTMLImageElement));
      console.log('FaceBlur: Disabled and unblurred all');
    } else {
      console.log('FaceBlur: Enabled, scanning page...');
      setTimeout(() => scanPage(), 500);
    }
  } else if (message.action === 'scanPage') {
    console.log('FaceBlur: Manual scan requested');
    setTimeout(() => scanPage(), 500);
  } else if (message.action === 'updateReferences') {
    referenceFingerprints = message.fingerprints || [];
    console.log(`FaceBlur: Updated references (${referenceFingerprints.length})`);
    
    // Unblur all and rescan
    document.querySelectorAll('img[data-faceblur-blurred="true"]')
      .forEach(img => {
        unblurImage(img as HTMLImageElement);
        processedImages.delete(img as HTMLImageElement);
      });
    
    if (isEnabled && referenceFingerprints.length > 0) {
      setTimeout(() => scanPage(), 500);
    }
  }
  
  sendResponse({ success: true });
  return true;
});