import * as cvImport from '@techstark/opencv-js'
import type {
  FramePayload,
  FrameProcessedPayload,
  InitPayload,
  TrackingResultPayload,
  TrackingWorkerInput,
  TrackingWorkerOutput,
} from './worker-utils'

let cv: typeof cvImport | null = null
let cvReady = false

interface TrackingState {
  initialized: boolean
  videoWidth: number
  videoHeight: number
  fps: number
  scale: number
  canvasWidth: number
  canvasHeight: number
  trajectory: Array<{ x: number; y: number }>
  prevFrameData: ImageData | null
}

const state: TrackingState = {
  initialized: false,
  videoWidth: 0,
  videoHeight: 0,
  fps: 30,
  scale: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  trajectory: [],
  prevFrameData: null,
}

async function initOpenCV(): Promise<void> {
  if (cvReady && cv) return

  const cvAny = cvImport as unknown as {
    then?: (fn: (m: typeof cvImport) => void) => void
  }

  const waitForInit = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const checkReady = () => {
        if (
          (cvImport as unknown as { Mat: unknown }).Mat &&
          typeof (cvImport as unknown as { Mat: unknown }).Mat === 'function'
        ) {
          resolve()
        } else {
          setTimeout(checkReady, 50)
        }
      }
      checkReady()
    })
  }

  if (cvAny.then && typeof cvAny.then === 'function') {
    cv = await new Promise((resolve) => {
      cvAny.then!((m: typeof cvImport) => resolve(m))
    })
    cvReady = true
  } else {
    await waitForInit()
    cv = cvImport
    cvReady = true
  }
}

async function handleInit(payload: InitPayload): Promise<void> {
  await initOpenCV()

  state.videoWidth = payload.videoWidth
  state.videoHeight = payload.videoHeight
  state.fps = payload.fps

  const maxDimension = 640
  state.scale = Math.min(
    1,
    maxDimension / Math.max(payload.videoWidth, payload.videoHeight),
  )
  state.canvasWidth = Math.round(payload.videoWidth * state.scale)
  state.canvasHeight = Math.round(payload.videoHeight * state.scale)
  state.initialized = true
  state.trajectory = []
  state.prevFrameData = null
}

function handleProcessFrame(payload: FramePayload): FrameProcessedPayload {
  if (!state.initialized || !cv) {
    return { frameNumber: payload.frameNumber, point: null }
  }

  const offscreen = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    return { frameNumber: payload.frameNumber, point: null }
  }

  ctx.drawImage(payload.imageData, 0, 0, state.canvasWidth, state.canvasHeight)
  const imageData = ctx.getImageData(
    0,
    0,
    state.canvasWidth,
    state.canvasHeight,
  )

  let point: { x: number; y: number } | null = null

  try {
    const frame = cv.matFromImageData(imageData)
    const gray = new cv.Mat()
    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

    if (state.prevFrameData) {
      const prevFrame = cv.matFromImageData(state.prevFrameData)
      const prevGray = new cv.Mat()
      cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY)

      const prevPoints = new cv.Mat()
      cv.goodFeaturesToTrack(
        prevGray,
        prevPoints,
        100,
        0.01,
        10,
        new cv.Mat(),
        3,
        false,
        0.04,
      )

      if (prevPoints.rows > 0) {
        const nextPoints = new cv.Mat()
        const status = new cv.Mat()
        const err = new cv.Mat()

        cv.calcOpticalFlowPyrLK(
          prevGray,
          gray,
          prevPoints,
          nextPoints,
          status,
          err,
          new cv.Size(21, 21),
          3,
        )

        const goodPoints: Array<{ x: number; y: number }> = []
        for (let i = 0; i < status.rows; i++) {
          if (status.data[i] === 1) {
            const x = nextPoints.data32F[i * 2]
            const y = nextPoints.data32F[i * 2 + 1]
            goodPoints.push({ x, y })
          }
        }

        if (goodPoints.length > 0) {
          point = {
            x: goodPoints.reduce((sum, p) => sum + p.x, 0) / goodPoints.length,
            y: goodPoints.reduce((sum, p) => sum + p.y, 0) / goodPoints.length,
          }
          state.trajectory.push(point)
        }

        nextPoints.delete()
        status.delete()
        err.delete()
      }

      prevFrame.delete()
      prevGray.delete()
    }

    state.prevFrameData = imageData
    frame.delete()
    gray.delete()
    payload.imageData.close()
  } catch (error) {
    console.error('[TrackingWorker] Error processing frame:', error)
  }

  return { frameNumber: payload.frameNumber, point }
}

function detectReleaseAndLanding(trajectory: Array<{ x: number; y: number }>): {
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number
} {
  if (trajectory.length < 10) {
    return { releasePoint: null, landingPoint: null, releaseFrame: 0 }
  }

  const velocities: Array<number> = []
  for (let i = 1; i < trajectory.length; i++) {
    const dx = trajectory[i].x - trajectory[i - 1].x
    const dy = trajectory[i].y - trajectory[i - 1].y
    velocities.push(Math.sqrt(dx * dx + dy * dy))
  }

  let releaseIndex = 0
  let maxVelocityIncrease = 0

  for (let i = 5; i < velocities.length - 5; i++) {
    const avgBefore = velocities.slice(i - 5, i).reduce((a, b) => a + b, 0) / 5
    const avgAfter = velocities.slice(i, i + 5).reduce((a, b) => a + b, 0) / 5
    const increase = avgAfter - avgBefore

    if (increase > maxVelocityIncrease) {
      maxVelocityIncrease = increase
      releaseIndex = i
    }
  }

  let landingIndex = trajectory.length - 1
  for (let i = releaseIndex + 10; i < velocities.length - 3; i++) {
    const avgVelocity =
      velocities.slice(i, i + 3).reduce((a, b) => a + b, 0) / 3
    if (avgVelocity < 2) {
      landingIndex = i
      break
    }
  }

  return {
    releasePoint: trajectory[releaseIndex] || null,
    landingPoint: trajectory[landingIndex] || null,
    releaseFrame: releaseIndex,
  }
}

function handleDetectReleaseLanding(): TrackingResultPayload {
  const { releasePoint, landingPoint, releaseFrame } = detectReleaseAndLanding(
    state.trajectory,
  )

  const scaledTrajectory = state.trajectory.map((p) => ({
    x: p.x / state.scale,
    y: p.y / state.scale,
  }))

  const scaledRelease = releasePoint
    ? { x: releasePoint.x / state.scale, y: releasePoint.y / state.scale }
    : null
  const scaledLanding = landingPoint
    ? { x: landingPoint.x / state.scale, y: landingPoint.y / state.scale }
    : null

  return {
    trajectory: scaledTrajectory,
    releasePoint: scaledRelease,
    landingPoint: scaledLanding,
    releaseFrame,
  }
}

self.onmessage = async (e: MessageEvent<TrackingWorkerInput>) => {
  const { type, payload } = e.data

  try {
    switch (type) {
      case 'init': {
        await handleInit(payload as InitPayload)
        const response: TrackingWorkerOutput = {
          type: 'initialized',
          payload: null,
        }
        self.postMessage(response)
        break
      }
      case 'processFrame': {
        const result = await handleProcessFrame(payload as FramePayload)
        const response: TrackingWorkerOutput = {
          type: 'frameProcessed',
          payload: result,
        }
        self.postMessage(response)
        break
      }
      case 'detectReleaseLanding': {
        const result = handleDetectReleaseLanding()
        const response: TrackingWorkerOutput = {
          type: 'result',
          payload: result,
        }
        self.postMessage(response)
        break
      }
    }
  } catch (error) {
    const response: TrackingWorkerOutput = {
      type: 'error',
      payload: error instanceof Error ? error.message : 'Unknown error',
    }
    self.postMessage(response)
  }
}

export {}
