export type AnalysisStage = 
  | 'idle'
  | 'extracting-frames'
  | 'detecting-circle'
  | 'tracking-hammer'
  | 'detecting-release'
  | 'calculating-physics'
  | 'complete'
  | 'error';

export type ImplementType = 'men' | 'women' | 'youth-boys' | 'youth-girls';

export interface ImplementSpec {
  type: ImplementType;
  massKg: number;
  diameterMm: number;
  name: string;
}

export const IMPLEMENTS: { [key in ImplementType]: ImplementSpec } = {
  men: { type: 'men', massKg: 7.26, diameterMm: 110, name: "Men's" },
  women: { type: 'women', massKg: 4.0, diameterMm: 95, name: "Women's" },
  'youth-boys': { type: 'youth-boys', massKg: 5.0, diameterMm: 100, name: "Youth Boys'" },
  'youth-girls': { type: 'youth-girls', massKg: 3.0, diameterMm: 85, name: "Youth Girls'" },
};

export interface Point {
  x: number;
  y: number;
}

export interface CircleCalibration {
  center: Point;
  radius: number;
  confidence: number;
}

export interface TrackedPosition {
  frameIndex: number;
  timestamp: number;
  x: number;
  y: number;
  confidence: number;
}

export interface VelocityProfile {
  vx: number;
  vy: number;
  magnitude: number;
  angle: number;
  confidence: number;
}

export interface CameraAngle {
  type: 'side' | 'angled';
  correctionMatrix?: number[];
  confidence: number;
}

export interface AnalysisResult {
  distance: number;
  flightTime: number;
  releaseVelocity: number;
  releaseAngle: number;
  releaseHeight: number;
  landingVelocity: number;
  implement: ImplementSpec;
  cameraAngle: CameraAngle;
  trajectory: Point[];
  confidence: number;
}

export interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number;
  message: string;
}

export interface FrameData {
  index: number;
  timestamp: number;
  imageData: ImageData;
}