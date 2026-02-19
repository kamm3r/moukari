export interface TrackingWorkerInput {
  type: 'init' | 'processFrame' | 'detectReleaseLanding'
  payload: unknown
}

export interface InitPayload {
  videoWidth: number
  videoHeight: number
  fps: number
  frameStep: number
  circleCenter: { x: number; y: number }
}

export interface FramePayload {
  frameNumber: number
  imageData: ImageBitmap
}

export interface TrackingWorkerOutput {
  type: 'initialized' | 'frameProcessed' | 'result' | 'error'
  payload: unknown
}

export interface FrameProcessedPayload {
  frameNumber: number
  point: { x: number; y: number } | null
}

export interface TrackingResultPayload {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number // index in trajectory array (not raw video frame)
}

export interface PhysicsWorkerInput {
  type: 'calculate'
  payload: PhysicsCalculationPayload
}

export interface PhysicsCalculationPayload {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number }
  landingPoint: { x: number; y: number }
  releaseFrame: number // index in trajectory array
  fps: number
  frameStep: number
  scaleFactor: number
  circleCenter: { x: number; y: number }
}

export interface PhysicsWorkerOutput {
  type: 'result' | 'error'
  payload: PhysicsResultPayload | string
}

export interface PhysicsResultPayload {
  trackedDistance: number
  predictedDistance: number
  distanceConfidence: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number
}

export async function createImageBitmapFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<ImageBitmap> {
  // Faster than toBlob in modern browsers
  return createImageBitmap(canvas)
}