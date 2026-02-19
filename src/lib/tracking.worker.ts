import type {
  FramePayload,
  FrameProcessedPayload,
  InitPayload,
  TrackingResultPayload,
  TrackingWorkerInput,
  TrackingWorkerOutput,
} from './worker-utils'

let cv: any = null

interface TrackingState {
  initialized: boolean
  videoWidth: number
  videoHeight: number
  fps: number
  frameStep: number
  scale: number
  canvasWidth: number
  canvasHeight: number
  circleCenterScaled: { x: number; y: number }
  trajectory: Array<{ x: number; y: number }>
  prevFrameData: ImageData | null
  offscreen: OffscreenCanvas | null
  ctx: OffscreenCanvasRenderingContext2D | null
}

const state: TrackingState = {
  initialized: false,
  videoWidth: 0,
  videoHeight: 0,
  fps: 30,
  frameStep: 4,
  scale: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  circleCenterScaled: { x: 0, y: 0 },
  trajectory: [],
  prevFrameData: null,
  offscreen: null,
  ctx: null,
}

function getWasmUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return new URL(`${base}opencv/opencv_js.wasm`, self.location.href).toString()
}

function configureLocateFileOnce() {
  const g = globalThis as any
  if (g.__OPENCV_LOCATEFILE_CONFIGURED__) return

  const wasmUrl = getWasmUrl()
  g.Module = g.Module ?? {}
  const prev = g.Module.locateFile

  g.Module.locateFile = (path: string, prefix?: string) => {
    if (path.endsWith('.wasm')) return wasmUrl
    if (typeof prev === 'function') return prev(path, prefix)
    return (prefix ?? '') + path
  }

  g.__OPENCV_LOCATEFILE_CONFIGURED__ = true
}

async function resolveTechstarkExport(modNs: any): Promise<any> {
  const maybe = modNs?.default ?? modNs
  if (maybe && typeof maybe.then === 'function') return await maybe
  return maybe
}

async function waitForMat(cvMod: any, timeoutMs: number) {
  const start = Date.now()
  while (true) {
    if (cvMod && typeof cvMod.Mat === 'function') return
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        'OpenCV runtime did not initialize in worker (Mat not available). ' +
          'Check /opencv/opencv_js.wasm is reachable.',
      )
    }
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function initOpenCV(): Promise<void> {
  if (cv && typeof cv.Mat === 'function') return

  configureLocateFileOnce()
  const mod = await import('@techstark/opencv-js')
  cv = await resolveTechstarkExport(mod)
  await waitForMat(cv, 60000)
}

async function handleInit(payload: InitPayload): Promise<void> {
  await initOpenCV()

  state.videoWidth = payload.videoWidth
  state.videoHeight = payload.videoHeight
  state.fps = payload.fps
  state.frameStep = payload.frameStep

  const maxDimension = 640
  state.scale = Math.min(
    1,
    maxDimension / Math.max(payload.videoWidth, payload.videoHeight),
  )

  state.canvasWidth = Math.round(payload.videoWidth * state.scale)
  state.canvasHeight = Math.round(payload.videoHeight * state.scale)

  state.circleCenterScaled = {
    x: payload.circleCenter.x * state.scale,
    y: payload.circleCenter.y * state.scale,
  }

  state.initialized = true
  state.trajectory = []
  state.prevFrameData = null

  state.offscreen = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
  state.ctx = state.offscreen.getContext('2d')
}

function centroidOfFarthestPoints(
  points: Array<{ x: number; y: number }>,
  center: { x: number; y: number },
): { x: number; y: number } | null {
  if (points.length === 0) return null

  const scored = points
    .map((p) => {
      const dx = p.x - center.x
      const dy = p.y - center.y
      return { p, d2: dx * dx + dy * dy }
    })
    .sort((a, b) => b.d2 - a.d2)

  const take = Math.max(5, Math.floor(scored.length * 0.2))
  const top = scored.slice(0, take)

  let sx = 0
  let sy = 0
  for (const t of top) {
    sx += t.p.x
    sy += t.p.y
  }
  return { x: sx / top.length, y: sy / top.length }
}

function handleProcessFrame(payload: FramePayload): FrameProcessedPayload {
  if (!state.initialized || !cv || !state.ctx) {
    return { frameNumber: payload.frameNumber, point: null }
  }

  state.ctx.drawImage(
    payload.imageData,
    0,
    0,
    state.canvasWidth,
    state.canvasHeight,
  )

  const imageData = state.ctx.getImageData(
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
    frame.delete()

    if (state.prevFrameData) {
      const prevFrame = cv.matFromImageData(state.prevFrameData)
      const prevGray = new cv.Mat()
      cv.cvtColor(prevFrame, prevGray, cv.COLOR_RGBA2GRAY)
      prevFrame.delete()

      const prevPoints = new cv.Mat()
      cv.goodFeaturesToTrack(
        prevGray,
        prevPoints,
        200,
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

        const c = centroidOfFarthestPoints(
          goodPoints,
          state.circleCenterScaled,
        )

        if (c) {
          point = c
          state.trajectory.push(point)
        }

        nextPoints.delete()
        status.delete()
        err.delete()
      }

      prevPoints.delete()
      prevGray.delete()
    }

    state.prevFrameData = imageData
    gray.delete()
    payload.imageData.close()
  } catch (error) {
    console.error('[TrackingWorker] Error processing frame:', error)
  }

  const outPoint = point
    ? { x: point.x / state.scale, y: point.y / state.scale }
    : null

  return { frameNumber: payload.frameNumber, point: outPoint }
}

function detectReleaseAndLanding(trajectory: Array<{ x: number; y: number }>) {
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

  return {
    trajectory: state.trajectory,
    releasePoint,
    landingPoint,
    releaseFrame,
  }
}

self.onmessage = async (e: MessageEvent<TrackingWorkerInput>) => {
  const { type, payload } = e.data

  try {
    switch (type) {
      case 'init': {
        await handleInit(payload as InitPayload)
        self.postMessage({ type: 'initialized', payload: null } satisfies TrackingWorkerOutput)
        break
      }
      case 'processFrame': {
        const result = handleProcessFrame(payload as FramePayload)
        self.postMessage({ type: 'frameProcessed', payload: result } satisfies TrackingWorkerOutput)
        break
      }
      case 'detectReleaseLanding': {
        const result = handleDetectReleaseLanding()
        self.postMessage({ type: 'result', payload: result } satisfies TrackingWorkerOutput)
        break
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: error instanceof Error ? error.message : 'Unknown error',
    } satisfies TrackingWorkerOutput)
  }
}

export {}