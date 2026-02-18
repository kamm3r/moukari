export interface TrackingWorkerInput {
  type: 'init' | 'processFrame' | 'detectReleaseLanding'
  payload: unknown
}

export interface InitPayload {
  videoWidth: number
  videoHeight: number
  fps: number
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
  releaseFrame: number
}

export interface PhysicsWorkerInput {
  type: 'calculate'
  payload: PhysicsCalculationPayload
}

export interface PhysicsCalculationPayload {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number }
  landingPoint: { x: number; y: number }
  releaseFrame: number
  fps: number
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

export function createWorker<TInput, TOutput>(
  workerUrl: string,
): Promise<{
  send: (data: TInput) => void
  receive: () => Promise<TOutput>
  terminate: () => void
}> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(workerUrl, import.meta.url), {
      type: 'module',
    })

    let pendingResolve: ((value: TOutput) => void) | null = null

    worker.onmessage = (e: MessageEvent<TOutput>) => {
      if (pendingResolve) {
        pendingResolve(e.data)
        pendingResolve = null
      }
    }

    worker.onerror = (e) => {
      reject(new Error(`Worker error: ${e.message}`))
    }

    resolve({
      send: (data: TInput) => worker.postMessage(data),
      receive: () =>
        new Promise((resolveReceive) => {
          pendingResolve = resolveReceive
        }),
      terminate: () => worker.terminate(),
    })
  })
}

export async function createImageBitmapFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        createImageBitmap(blob).then(resolve).catch(reject)
      } else {
        reject(new Error('Failed to create blob from canvas'))
      }
    })
  })
}
