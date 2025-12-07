export interface ReferenceImage {
  id: number;
  dataUrl: string;
}

export interface FaceFingerprint {
  descriptor: number[];  // 128-dimensional face encoding vector
  box: {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
  };
  landmarks?: Array<{
    x: number;
    y: number;
  }>;
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
  descriptor: number[];  // 128-d vector from face-api.js
  landmarks: Array<{
    x: number;
    y: number;
  }>;
}