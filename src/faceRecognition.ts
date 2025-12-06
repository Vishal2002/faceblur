import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

let detector: faceDetection.FaceDetector | null = null;

// Initialize TensorFlow detector
export async function initializeDetector(): Promise<void> {
  if (detector) return;
  
  await tf.ready();
  
  const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
  const detectorConfig = {
    runtime: 'tfjs',
    maxFaces: 10
  };
  
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
export function createFingerprint(detection) {
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