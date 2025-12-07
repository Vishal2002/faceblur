import { initializeDetector, detectFaces, createFingerprint, compareFaces } from './faceRecognition';

let isEnabled = false;
let referenceFingerprints: any[] = [];
const processedImages = new WeakSet<HTMLImageElement>();
const failedImages = new WeakSet<HTMLImageElement>();

// Performance settings
const MIN_IMAGE_SIZE = 100;
const MAX_CONCURRENT = 5; // Increased for speed
const PROCESS_DELAY = 20; // Reduced delay

let processingQueue: HTMLImageElement[] = [];
let isProcessing = false;

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
      setTimeout(() => scanPage(), 1500);
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
  console.log(`FaceBlur: Found ${images.length} images`);
  
  // Filter images
  const imagesToProcess = Array.from(images).filter(img => {
    return !processedImages.has(img) && 
           !failedImages.has(img) &&
           img.complete &&
           img.naturalWidth >= MIN_IMAGE_SIZE &&
           img.naturalHeight >= MIN_IMAGE_SIZE;
  });
  
  console.log(`FaceBlur: ${imagesToProcess.length} images to process`);
  
  processingQueue.push(...imagesToProcess);
  processQueue();
}

// Process queue with concurrency
async function processQueue() {
  if (isProcessing) return;
  if (processingQueue.length === 0) return;
  
  isProcessing = true;
  let processed = 0;
  let blurred = 0;
  
  while (processingQueue.length > 0) {
    const batch = processingQueue.splice(0, MAX_CONCURRENT);
    
    const results = await Promise.all(
      batch.map(img => processImage(img))
    );
    
    results.forEach(result => {
      if (result) {
        processed++;
        if (result.blurred) blurred++;
      }
    });
    
    if (processingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, PROCESS_DELAY));
    }
  }
  
  isProcessing = false;
  console.log(`FaceBlur: Complete - Processed ${processed}, Blurred ${blurred}`);
}

// Create canvas from image (CORS check)
function createCanvasFromImage(img: HTMLImageElement): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    
    if (!ctx) return null;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    ctx.getImageData(0, 0, 1, 1);
    
    return canvas;
  } catch (error) {
    return null;
  }
}

// Process a single image
async function processImage(img: HTMLImageElement): Promise<{ blurred: boolean } | null> {
  if (processedImages.has(img) || failedImages.has(img)) return null;
  
  // Skip if already blurred
  if (img.dataset.faceblurBlurred === 'true') {
    processedImages.add(img);
    return { blurred: true };
  }
  
  try {
    // CORS check
    const canvas = createCanvasFromImage(img);
    if (!canvas) {
      failedImages.add(img);
      return null;
    }
    
    // Detect faces
    const detections = await detectFaces(img);
    
    if (detections.length === 0) {
      processedImages.add(img);
      return { blurred: false };
    }
    
    // Check for matches
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
      console.log('FaceBlur: Match found!');
    }
    
    processedImages.add(img);
    return { blurred: shouldBlur };
  } catch (error) {
    console.error('FaceBlur: Error processing image:', error);
    failedImages.add(img);
    return null;
  }
}

// Blur an image
function blurImage(img: HTMLImageElement) {
  if (img.dataset.faceblurBlurred === 'true') return;
  
  img.dataset.faceblurBlurred = 'true';
  img.dataset.faceblurOriginalFilter = img.style.filter || 'none';
  
  img.style.filter = 'blur(20px)';
  img.style.transition = 'filter 0.3s ease';
  img.style.cursor = 'pointer';
  img.title = 'Click to temporarily unblur';
  
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

// Watch for new images (throttled)
let observerTimeout: number | null = null;
function observeNewImages() {
  const observer = new MutationObserver(() => {
    if (!isEnabled || referenceFingerprints.length === 0) return;
    
    if (observerTimeout) return;
    
    observerTimeout = window.setTimeout(() => {
      observerTimeout = null;
      
      const images = document.querySelectorAll('img');
      const newImages: HTMLImageElement[] = [];
      
      images.forEach(img => {
        if (!processedImages.has(img) && 
            !failedImages.has(img) &&
            img.complete &&
            img.naturalWidth >= MIN_IMAGE_SIZE &&
            img.naturalHeight >= MIN_IMAGE_SIZE) {
          newImages.push(img);
        }
      });
      
      if (newImages.length > 0) {
        console.log(`FaceBlur: ${newImages.length} new images detected`);
        processingQueue.push(...newImages);
        processQueue();
      }
    }, 300);
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
      document.querySelectorAll('img[data-faceblur-blurred="true"]')
        .forEach(img => unblurImage(img as HTMLImageElement));
      processingQueue = [];
      console.log('FaceBlur: Disabled and unblurred all');
    } else {
      console.log('FaceBlur: Enabled, scanning page...');
      setTimeout(() => scanPage(), 500);
    }
  } else if (message.action === 'scanPage') {
    console.log('FaceBlur: Manual scan requested');
    processingQueue = [];
    setTimeout(() => scanPage(), 500);
  } else if (message.action === 'updateReferences') {
    referenceFingerprints = message.fingerprints || [];
    console.log(`FaceBlur: Updated references (${referenceFingerprints.length})`);
    
    // Unblur all and rescan
    document.querySelectorAll('img[data-faceblur-blurred="true"]')
      .forEach(img => {
        unblurImage(img as HTMLImageElement);
        processedImages.delete(img as HTMLImageElement);
        failedImages.delete(img as HTMLImageElement);
      });
    
    processingQueue = [];
    
    if (isEnabled && referenceFingerprints.length > 0) {
      setTimeout(() => scanPage(), 500);
    }
  }
  
  sendResponse({ success: true });
  return true;
});