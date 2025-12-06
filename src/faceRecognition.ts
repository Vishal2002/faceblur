import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import type {  Detection, FaceFingerprint } from './types';
let detector: faceDetection.FaceDetector | null = null;

// Initialize TensorFlow detector
export async function initializeDetector(): Promise<void> {
  if (detector) return;
  
  await tf.ready();
  
  const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
  const detectorConfig = {
    runtime: 'tfjs',
    maxFaces: 10
  }as any;
  
  detector = await faceDetection.createDetector(model, detectorConfig);
}

// Detect faces in an image
export async function detectFaces(image: HTMLImageElement) {
  if (!detector) await initializeDetector();
  
  const faces = await detector!.estimateFaces(image, {
    flipHorizontal: false
  });
  
  return faces.map(face => ({
    box: face.box,
    keypoints: face.keypoints || []
  }));
}

// Create unique fingerprint from face
export function createFingerprint(detection:Detection) {
  // Normalize keypoints relative to bounding box
  const normalizedLandmarks = detection.keypoints.map(kp => [
    (kp.x - detection.box.xMin) / detection.box.width,
    (kp.y - detection.box.yMin) / detection.box.height
  ]);
  
  // Create perceptual hash
  const hash = createLandmarkHash(normalizedLandmarks);
  
  return {
    landmarks: normalizedLandmarks,
    hash,
    boundingBox: detection.box
  };
}

// Compare two faces
//@ts-ignore
export function compareFaces(fp1, fp2, threshold = 0.15): boolean {
  // Quick hash comparison
  if (fp1.hash === fp2.hash) return true;
  
  // Hamming distance for hashes
  const hashSimilarity = hammingDistance(fp1.hash, fp2.hash) / 
    (fp1.hash.length * 4);
  
  if (hashSimilarity < 0.3) {
    // Compare landmarks
    const landmarkDistance = euclideanDistance(
      fp1.landmarks.flat(),
      fp2.landmarks.flat()
    );
    
    return landmarkDistance < threshold;
  }
  
  return false;
}

// Simple perceptual hash from landmarks (64-bit)
function createLandmarkHash(landmarks: number[][]): string {
    let hash = '';
    for (const [x, y] of landmarks) {
      const binX = x > 0.5 ? '1' : '0';
      const binY = y > 0.5 ? '1' : '0';
      hash += binX + binY;
    }
    return hash.padEnd(64, '0').slice(0, 64); // fixed length
  }
  
  // Hamming distance between two binary strings
  function hammingDistance(a: string, b: string): number {
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) distance++;
    }
    return distance;
  }
  
  // Euclidean distance between two flattened arrays
  function euclideanDistance(arr1: number[], arr2: number[]): number {
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
      sum += (arr1[i] - arr2[i]) ** 2;
    }
    return Math.sqrt(sum) / arr1.length; // normalized
  }
  
  // Extract fingerprint from a dataURL (used by popup)
  export async function extractFaceFromImage(dataUrl: string): Promise<FaceFingerprint | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          if (!detector) await initializeDetector();
          const faces = await detector!.estimateFaces(img, { flipHorizontal: false });
          
          if (faces.length === 0) {
            resolve(null);
            return;
          }
  
          // Use the first (largest) face
          const face = faces[0];
          const fp = createFingerprint({
            box: face.box,
            keypoints: face.keypoints || []
          });
          resolve(fp);
        } catch (err) {
          console.error('Failed to extract face:', err);
          resolve(null);
        }
      };
      img.src = dataUrl;
    });
  }