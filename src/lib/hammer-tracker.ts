import { preloadOpenCV } from './circle-detector'
import type {
  FramePayload,
  InitPayload,
  TrackingResultPayload,
  TrackingWorkerInput,
  TrackingWorkerOutput,
} from './worker-utils'

export interface TrackingResult {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number
}

export async function trackHammerTrajectoryWithWorker(
  video: HTMLVideoElement,
  fps: number,
  onProgress: (progress: number) => void,
): Promise<TrackingResult> {
  console.log('[HammerTracker] Starting worker-based trajectory tracking...')
  console.log(
    `[HammerTracker] Video: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`,
  )

  const worker = new Worker(new URL('./tracking.worker.ts', import.meta.url), {
    type: 'module',
  })

  const canvas = document.createElement('canvas')
  const maxDimension = 640
  const scale = Math.min(
    1,
    maxDimension / Math.max(video.videoWidth, video.videoHeight),
  )
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas context')

  const frameStep = 6
  const totalFrames = Math.round(video.duration * fps)

  let pendingResolve: ((value: TrackingWorkerOutput) => void) | null = null
  let pendingReject: ((reason: Error) => void) | null = null

  worker.onmessage = (e: MessageEvent<TrackingWorkerOutput>) => {
    if (pendingResolve) {
      pendingResolve(e.data)
      pendingResolve = null
      pendingReject = null
    }
  }

  worker.onerror = (e) => {
    if (pendingReject) {
      pendingReject(new Error(`Worker error: ${e.message}`))
      pendingReject = null
      pendingResolve = null
    }
  }

  const sendAndWait = async (
    data: TrackingWorkerInput,
  ): Promise<TrackingWorkerOutput> => {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve
      pendingReject = reject
      worker.postMessage(data)
    })
  }

  try {
    const initPayload: InitPayload = {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      fps,
    }
    await sendAndWait({ type: 'init', payload: initPayload })
    console.log('[HammerTracker] Worker initialized')

    const startTime = Date.now()
    const maxProcessingTime = 300000

    let framesProcessed = 0

    for (let frameNum = 0; frameNum < totalFrames; frameNum += frameStep) {
      if (Date.now() - startTime > maxProcessingTime) {
        throw new Error('Video processing timeout - took longer than 5 minutes')
      }

      if (framesProcessed % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const time = frameNum / fps
      video.currentTime = time

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Video seek timeout at frame ${frameNum}`))
        }, 5000)

        const handleSeek = () => {
          clearTimeout(timeout)
          resolve()
        }
        video.addEventListener('seeked', handleSeek, { once: true })
      })

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            createImageBitmap(blob).then(resolve).catch(reject)
          } else {
            reject(new Error('Failed to create blob'))
          }
        })
      })

      const framePayload: FramePayload = {
        frameNumber: frameNum,
        imageData: bitmap,
      }

      await sendAndWait({ type: 'processFrame', payload: framePayload })

      framesProcessed++
      onProgress((frameNum / totalFrames) * 100)

      if (framesProcessed % 10 === 0) {
        console.log(
          `[HammerTracker] Processed ${framesProcessed} frames (${Math.round((frameNum / totalFrames) * 100)}%)`,
        )
      }
    }

    console.log(
      '[HammerTracker] All frames processed, detecting release/landing...',
    )
    const result = await sendAndWait({
      type: 'detectReleaseLanding',
      payload: null,
    })

    if (result.type === 'result') {
      const payload = result.payload as TrackingResultPayload
      console.log(
        `[HammerTracker] Complete. Trajectory points: ${payload.trajectory.length}`,
      )
      return {
        trajectory: payload.trajectory,
        releasePoint: payload.releasePoint,
        landingPoint: payload.landingPoint,
        releaseFrame: payload.releaseFrame,
      }
    } else {
      throw new Error('Failed to get tracking result from worker')
    }
  } finally {
    worker.terminate()
    canvas.width = 0
    canvas.height = 0
    console.log('[HammerTracker] Worker terminated, cleanup complete')
  }
}

export async function trackHammerTrajectory(
  video: HTMLVideoElement,
  fps: number,
  onProgress: (progress: number) => void,
): Promise<TrackingResult> {
  console.log('[HammerTracker] Starting trajectory tracking (legacy mode)...')
  console.log(
    `[HammerTracker] Video: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`,
  )

  await new Promise((resolve) => setTimeout(resolve, 0))

  console.log('[HammerTracker] Ensuring OpenCV is loaded...')
  await preloadOpenCV()
  const cv = await import('@techstark/opencv-js')
  console.log('[HammerTracker] OpenCV loaded')

  const canvas = document.createElement('canvas')
  const maxDimension = 640
  const scale = Math.min(
    1,
    maxDimension / Math.max(video.videoWidth, video.videoHeight),
  )
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  console.log(
    `[HammerTracker] Processing canvas: ${canvas.width}x${canvas.height}`,
  )

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas context')

  const trajectory: Array<{ x: number; y: number }> = []
  const frameStep = 6
  const totalFrames = Math.round(video.duration * fps)

  let prevFrame: InstanceType<typeof cv.Mat> | null = null
  let prevPoints: InstanceType<typeof cv.Mat> | null = null

  try {
    let framesProcessed = 0
    const startTime = Date.now()
    const maxProcessingTime = 300000

    for (let frameNum = 0; frameNum < totalFrames; frameNum += frameStep) {
      if (Date.now() - startTime > maxProcessingTime) {
        throw new Error('Video processing timeout - took longer than 5 minutes')
      }

      if (framesProcessed % 1 === 0 && framesProcessed > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      framesProcessed++

      if (framesProcessed % 10 === 0) {
        console.log(
          `[HammerTracker] Processing frame ${framesProcessed}/${Math.ceil(totalFrames / frameStep)} (${Math.round((frameNum / totalFrames) * 100)}%)`,
        )
      }

      const time = frameNum / fps
      video.currentTime = time

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error(
            `[HammerTracker] Video seek timeout at frame ${frameNum}`,
          )
          reject(new Error(`Video seek timeout at frame ${frameNum}`))
        }, 5000)

        const handleSeek = () => {
          clearTimeout(timeout)
          resolve()
        }
        video.addEventListener('seeked', handleSeek, { once: true })
      })

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const frame = cv.matFromImageData(imageData)
      const gray = new cv.Mat()

      try {
        cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)
      } catch (e) {
        console.error(
          `[HammerTracker] Error converting to grayscale at frame ${frameNum}:`,
          e,
        )
        throw e
      }

      if (prevFrame && prevPoints) {
        const nextPoints = new cv.Mat()
        const status = new cv.Mat()
        const err = new cv.Mat()

        cv.calcOpticalFlowPyrLK(
          prevFrame,
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
          const centroid = {
            x: goodPoints.reduce((sum, p) => sum + p.x, 0) / goodPoints.length,
            y: goodPoints.reduce((sum, p) => sum + p.y, 0) / goodPoints.length,
          }
          trajectory.push(centroid)
        }

        nextPoints.delete()
        status.delete()
        err.delete()
      }

      if (prevFrame) {
        prevFrame.delete()
      }

      try {
        prevFrame = gray.clone()
        prevPoints = new cv.Mat()
        cv.goodFeaturesToTrack(
          gray,
          prevPoints,
          100,
          0.01,
          10,
          new cv.Mat(),
          3,
          false,
          0.04,
        )
      } catch (e) {
        console.error(
          `[HammerTracker] Error in goodFeaturesToTrack at frame ${frameNum}:`,
          e,
        )
        throw e
      }

      frame.delete()
      gray.delete()

      onProgress((frameNum / totalFrames) * 100)
    }

    console.log(
      `[HammerTracker] Processing complete. Trajectory points: ${trajectory.length}`,
    )

    const { releasePoint, landingPoint, releaseFrame } =
      detectReleaseAndLanding(trajectory)

    console.log(
      `[HammerTracker] Release point: ${releasePoint ? 'found' : 'not found'}, Landing point: ${landingPoint ? 'found' : 'not found'}`,
    )

    const scaledTrajectory = trajectory.map((p) => ({
      x: p.x / scale,
      y: p.y / scale,
    }))
    const scaledRelease = releasePoint
      ? { x: releasePoint.x / scale, y: releasePoint.y / scale }
      : null
    const scaledLanding = landingPoint
      ? { x: landingPoint.x / scale, y: landingPoint.y / scale }
      : null

    return {
      trajectory: scaledTrajectory,
      releasePoint: scaledRelease,
      landingPoint: scaledLanding,
      releaseFrame,
    }
  } catch (error) {
    console.error('[HammerTracker] Error during tracking:', error)
    throw error
  } finally {
    console.log('[HammerTracker] Cleaning up...')
    if (prevFrame) prevFrame.delete()
    if (prevPoints) prevPoints.delete()
    canvas.width = 0
    canvas.height = 0
    console.log('[HammerTracker] Cleanup complete')
  }
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
    const velocity = Math.sqrt(dx * dx + dy * dy)
    velocities.push(velocity)
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
