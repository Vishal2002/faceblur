import { extractFaceFromImage } from './faceRecognition';

let referenceImages = [];

// Load saved state
chrome.storage.local.get(['enabled', 'referenceImages'], (result) => {
  const toggle = document.getElementById('enableToggle') as HTMLInputElement;
  const status = document.getElementById('status');
  
  toggle.checked = result.enabled || false;
  status.textContent = result.enabled ? 'Active' : 'Disabled';
  status.className = result.enabled ? 'status active' : 'status';
  
  if (result.referenceImages) {
    referenceImages = result.referenceImages;
    displayReferenceImages();
  }
});

// Toggle enable/disable
document.getElementById('enableToggle')?.addEventListener('change', (e) => {
  const enabled = (e.target as HTMLInputElement).checked;
  
  chrome.storage.local.set({ enabled }, () => {
    // Notify content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleBlur',
          enabled: enabled
        });
      }
    });
  });
});

// Handle file upload
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

fileInput.addEventListener('change', (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) handleFiles(files);
});

async function handleFiles(files: FileList) {
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        // Check if face is detectable
        const fingerprint = await extractFaceFromImage(dataUrl);
        
        if (fingerprint) {
          referenceImages.push({
            id: Date.now() + Math.random(),
            dataUrl
          });
          await saveAndDisplay();
        } else {
          alert('No face detected. Please upload a clear photo.');
        }
      };
      
      reader.readAsDataURL(file);
    }
  }
}

// Save and create fingerprints
async function saveAndDisplay() {
  const fingerprints = [];
  
  for (const img of referenceImages) {
    const fingerprint = await extractFaceFromImage(img.dataUrl);
    if (fingerprint) fingerprints.push(fingerprint);
  }
  
  chrome.storage.local.set({ 
    referenceImages,
    faceFingerprints: fingerprints 
  }, () => {
    displayReferenceImages();
    
    // Notify content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateReferences',
          fingerprints
        });
      }
    });
  });
}

// Display reference images
function displayReferenceImages() {
  const container = document.getElementById('referenceImages');
  container.innerHTML = '';
  
  referenceImages.forEach(img => {
    const div = document.createElement('div');
    div.className = 'ref-image';
    div.innerHTML = `
      <img src="${img.dataUrl}" alt="Reference">
      <button class="remove" data-id="${img.id}">×</button>
    `;
    container.appendChild(div);
  });
  
  // Add remove listeners
  container.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseFloat((e.target as HTMLElement).dataset.id);
      referenceImages = referenceImages.filter(img => img.id !== id);
      saveAndDisplay();
    });
  });
}