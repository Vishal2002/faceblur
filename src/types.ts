export interface ReferenceImage {
    id: number;
    dataUrl: string;
  }
  
  export interface FaceFingerprint {
    landmarks: number[][];  // Normalized facial landmarks
    hash: string;           // Perceptual hash
    boundingBox: {
      xMin: number;
      yMin: number;
      width: number;
      height: number;
    };
  }
  
  export interface StorageData {
    enabled?: boolean;
    referenceImages?: ReferenceImage[];
    faceFingerprints?: FaceFingerprint[];
  }
  
  export interface Message {
    action: 'toggleBlur' | 'scanPage' | 'updateReferences';
    enabled?: boolean;
    fingerprints?: FaceFingerprint[];
  }
  
  export interface Detection {
    box: {
      xMin: number;
      yMin: number;
      width: number;
      height: number;
    };
    keypoints: Array<{
      x: number;
      y: number;
      name?: string;
    }>;
  }