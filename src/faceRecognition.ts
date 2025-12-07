import * as faceapi from 'face-api.js';
import type { FaceFingerprint } from './types';

let modelsLoaded = false;

// Model URL - use CDN for easy setup
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Initialize face-api.js models
export async function initializeDetector(): Promise<void> {
  if (modelsLoaded) return;
  
  console.log('Loading face-api.js models...');
  
  try {
    // Load all required models in parallel
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    
    modelsLoaded = true;
    console.log('face-api.js models loaded successfully');
  } catch (error) {
    console.error('Failed to load face-api.js models:', error);
    throw error;
  }
}

// Detect faces in an image and return descriptors
export async function detectFaces(image: HTMLImageElement) {
  if (!modelsLoaded) await initializeDetector();
  
  try {
    // Detect all faces with landmarks and descriptors
    const detections = await faceapi
      .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    
    if (!detections || detections.length === 0) {
      return [];
    }
    
    // Convert to our format
    return detections.map(detection => ({
      box: {
        xMin: detection.detection.box.x,
        yMin: detection.detection.box.y,
        width: detection.detection.box.width,
        height: detection.detection.box.height
      },
      descriptor: Array.from(detection.descriptor), // 128-d vector
      landmarks: detection.landmarks.positions.map(p => ({ x: p.x, y: p.y }))
    }));
  } catch (error) {
    console.error('Face detection failed:', error);
    return [];
  }
}

// Create fingerprint from detection (now using 128-d descriptor)
export function createFingerprint(detection: any): FaceFingerprint {
  return {
    descriptor: detection.descriptor, // 128-dimensional face encoding
    box: detection.box,
    landmarks: detection.landmarks || []
  };
}

// Compare two face descriptors using Euclidean distance
export function compareFaces(fp1: FaceFingerprint, fp2: FaceFingerprint, threshold = 0.6): boolean {
  if (!fp1.descriptor || !fp2.descriptor) {
    console.warn('Missing descriptor for comparison');
    return false;
  }
  
  // Use face-api.js built-in Euclidean distance calculation
  const distance = faceapi.euclideanDistance(fp1.descriptor, fp2.descriptor);
  
  // Industry standard: distance < 0.6 means same person
  return distance < threshold;
}

// Extract fingerprint from a dataURL (used by popup)
export async function extractFaceFromImage(dataUrl: string): Promise<FaceFingerprint | null> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        if (!modelsLoaded) await initializeDetector();
        
        // Detect single face with all features
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (!detection) {
          console.log('No face detected in reference image');
          resolve(null);
          return;
        }
        
        // Create fingerprint from detection
        const fingerprint: FaceFingerprint = {
          descriptor: Array.from(detection.descriptor),
          box: {
            xMin: detection.detection.box.x,
            yMin: detection.detection.box.y,
            width: detection.detection.box.width,
            height: detection.detection.box.height
          },
          landmarks: detection.landmarks.positions.map(p => ({ x: p.x, y: p.y }))
        };
        
        console.log('Face extracted successfully, descriptor length:', fingerprint.descriptor.length);
        resolve(fingerprint);
      } catch (err) {
        console.error('Failed to extract face:', err);
        resolve(null);
      }
    };
    
    img.onerror = () => {
      console.error('Failed to load image');
      resolve(null);
    };
    
    img.src = dataUrl;
  });
}