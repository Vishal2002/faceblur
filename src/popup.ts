import { extractFaceFromImage } from './faceRecognition';
import type { ReferenceImage } from './types';

let referenceImages: ReferenceImage[] = [];

// Load saved state
chrome.storage.local.get(['enabled', 'referenceImages'], (result:any) => {
  const toggle = document.getElementById('enableToggle') as HTMLInputElement;
  // const status = document.getElementById('status') as HTMLElement;
  
  toggle.checked = result.enabled || false;
  updateStatus(result.enabled || false);
  
  if (result.referenceImages) {
    referenceImages = result.referenceImages;
    displayReferenceImages();
  }
});

// Update status display
function updateStatus(enabled: boolean) {
  const status = document.getElementById('status') as HTMLElement;
  status.textContent = enabled ? 'Active' : 'Off';
  status.className = enabled ? 'status' : 'status off';
}

// Toggle enable/disable
document.getElementById('enableToggle')?.addEventListener('change', (e) => {
  const enabled = (e.target as HTMLInputElement).checked;
  
  updateStatus(enabled);
  
  chrome.storage.local.set({ enabled }, () => {
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'toggleBlur',
            enabled: enabled
          }).catch(() => {
            // Tab may not have content script
          });
        }
      });
    });
  });
});

// Handle upload button click
document.getElementById('uploadBtn')?.addEventListener('click', () => {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  fileInput.click();
});

// Handle clear all button
document.getElementById('clearAllBtn')?.addEventListener('click', () => {
  if (referenceImages.length === 0) return;
  
  if (confirm('Clear all reference photos? This will stop blurring faces.')) {
    referenceImages = [];
    saveAndDisplay();
  }
});

// Handle file upload
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

fileInput.addEventListener('change', async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) {
    await handleFiles(files);
    // Reset input so same file can be selected again
    fileInput.value = '';
  }
});

async function handleFiles(files: FileList) {
  const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
  const originalText = uploadBtn.textContent;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (!file.type.startsWith('image/')) continue;
    
    uploadBtn.textContent = `Processing ${i + 1}/${files.length}...`;
    uploadBtn.disabled = true;
    
    try {
      const dataUrl = await readFileAsDataURL(file);
      const fingerprint = await extractFaceFromImage(dataUrl);
      
      if (fingerprint) {
        referenceImages.push({
          id: Date.now() + Math.random(),
          dataUrl
        });
      } else {
        showToast(`No face detected in ${file.name}`);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      showToast(`Failed to process ${file.name}`);
    }
  }
  
  uploadBtn.textContent = originalText;
  uploadBtn.disabled = false;
  
  if (referenceImages.length > 0) {
    await saveAndDisplay();
  }
}

// Read file as data URL
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Save and create fingerprints
async function saveAndDisplay() {
  const fingerprints:any[] = [];
  
  for (const img of referenceImages) {
    const fingerprint = await extractFaceFromImage(img.dataUrl);
    if (fingerprint) fingerprints.push(fingerprint);
  }
  
  chrome.storage.local.set({ 
    referenceImages,
    faceFingerprints: fingerprints 
  }, () => {
    displayReferenceImages();
    
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateReferences',
            fingerprints
          }).catch(() => {
            // Tab may not have content script
          });
        }
      });
    });
    
    showToast(`Updated! ${referenceImages.length} photo(s) loaded`);
  });
}

// Display reference images
function displayReferenceImages() {
  const container = document.getElementById('referenceImages') as HTMLElement;
  container.innerHTML = '';
  
  if (referenceImages.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">No photos added yet</p>';
    return;
  }
  
  referenceImages.forEach(img => {
    const div = document.createElement('div');
    div.className = 'face';
    div.innerHTML = `
      <img src="${img.dataUrl}" alt="Reference">
      <button class="remove" data-id="${img.id}" title="Remove">×</button>
    `;
    container.appendChild(div);
  });
  
  // Add remove listeners
  container.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseFloat((e.target as HTMLElement).dataset.id!);
      referenceImages = referenceImages.filter(img => img.id !== id);
      await saveAndDisplay();
    });
  });
}

// Show toast notification
function showToast(message: string) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    animation: slideUp 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideDown 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from { transform: translateX(-50%) translateY(100px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @keyframes slideDown {
    from { transform: translateX(-50%) translateY(0); opacity: 1; }
    to { transform: translateX(-50%) translateY(100px); opacity: 0; }
  }
`;
document.head.appendChild(style);