import { trackHammerTrajectoryWithWorker } from './hammer-tracker'
import type { TurnMetrics } from './hammer-tracker'
import { calculatePhysics } from './physics-engine'

export interface HammerThrowResult {
  trackedDistance: number
  predictedDistance: number
  distanceConfidence: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number

  // Video frame number (not trajectory index)
  releaseFrame: number

  // Trajectory index where release was detected (useful for debugging)
  releaseIndex: number

  totalFrames: number
  fps: number
  frameStep: number

  scaleFactor: number // px/m (original video coordinate space)

  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null

  turns: TurnMetrics[]
}

interface ProcessVideoOptions {
  videoUrl: string
  calibrationData: {
    circleCenter: { x: number; y: number } // ORIGINAL video coords
    circleRadius: number // ORIGINAL video coords
    scaleFactor: number // px/m in ORIGINAL video coords
  }
  hammerWeight: 'men' | 'women'
  onProgress: (_progress: number) => void
}

async function waitForLoadedData(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Video decode timeout'))
    }, 15000)

    const onLoaded = () => {
      clearTimeout(timeout)
      resolve()
    }

    const onError = () => {
      clearTimeout(timeout)
      reject(new Error('Failed to decode video'))
    }

    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

export async function processVideo(
  options: ProcessVideoOptions,
): Promise<HammerThrowResult> {
  const { videoUrl, calibrationData, onProgress } = options

  const video = document.createElement('video')
  video.src = videoUrl
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  ;(video as unknown as { playsInline?: boolean }).playsInline = true

  const cleanupVideo = () => {
    try {
      video.pause()
    } catch {
      // ignore
    }
    video.src = ''
    video.remove()
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Video load timeout - took longer than 30 seconds'))
      }, 30000)

      video.onloadedmetadata = () => {
        clearTimeout(timeoutId)
        resolve()
      }

      video.onerror = () => {
        clearTimeout(timeoutId)
        reject(new Error('Failed to load video for processing'))
      }
    })

    await waitForLoadedData(video)

    const fps = 30
    const frameStep = 4
    const totalFrames = Math.round(video.duration * fps)

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Invalid video duration')
    }

    if (video.duration > 120) {
      throw new Error('Video too long. Please use a video under 2 minutes.')
    }

    onProgress(10)

    // Tracking progress: map 0..100 -> 10..70
    const trackingResult = await trackHammerTrajectoryWithWorker(
      video,
      fps,
      frameStep,
      calibrationData.circleCenter,
      calibrationData.scaleFactor,
      (p) => {
        onProgress(10 + p * 0.6)
      },
    )

    onProgress(70)

    if (!trackingResult.releasePoint || !trackingResult.landingPoint) {
      throw new Error('Could not detect release or landing point')
    }

    onProgress(80)

    const physicsResult = calculatePhysics({
      trajectory: trackingResult.trajectory,
      releasePoint: trackingResult.releasePoint,
      landingPoint: trackingResult.landingPoint,
      releaseFrame: trackingResult.releaseFrame, // trajectory index
      fps,
      frameStep,
      scaleFactor: calibrationData.scaleFactor,
      circleCenter: calibrationData.circleCenter,
    })

    onProgress(95)

    const releaseIndex = trackingResult.releaseFrame
    const releaseFrameVideo = Math.round(releaseIndex * frameStep)

    const result: HammerThrowResult = {
      trackedDistance: physicsResult.trackedDistance,
      predictedDistance: physicsResult.predictedDistance,
      distanceConfidence: physicsResult.distanceConfidence,
      releaseAngle: physicsResult.releaseAngle,
      releaseVelocity: physicsResult.releaseVelocity,
      flightTime: physicsResult.flightTime,

      releaseFrame: releaseFrameVideo,
      releaseIndex,

      totalFrames,
      fps,
      frameStep,

      scaleFactor: calibrationData.scaleFactor,

      trajectory: trackingResult.trajectory,
      releasePoint: trackingResult.releasePoint,
      landingPoint: trackingResult.landingPoint,

      turns: trackingResult.turns,
    }

    onProgress(100)
    return result
  } finally {
    cleanupVideo()
  }
}