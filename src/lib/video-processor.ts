import { trackHammerTrajectory } from './hammer-tracker'
import { calculatePhysics } from './physics-engine'

export interface HammerThrowResult {
  distance: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number
  releaseFrame: number
  totalFrames: number
  fps: number
  scaleFactor: number
  trajectory: { x: number; y: number }[]
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
}

interface ProcessVideoOptions {
  videoUrl: string
  calibrationData: {
    circleCenter: { x: number; y: number }
    circleRadius: number
    scaleFactor: number
  }
  hammerWeight: 'men' | 'women'
  onProgress: (_progress: number) => void
}

export async function processVideo(
  options: ProcessVideoOptions,
): Promise<HammerThrowResult> {
  const { videoUrl, calibrationData, onProgress } = options

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = videoUrl
    video.crossOrigin = 'anonymous'

    // Set a timeout for video loading
    const timeoutId = setTimeout(() => {
      reject(new Error('Video load timeout - took longer than 30 seconds'))
    }, 30000)

    video.onloadedmetadata = async () => {
      clearTimeout(timeoutId)
      try {
        const fps = 30 // Estimated
        const totalFrames = Math.round(video.duration * fps)

        onProgress(10)

        // Track hammer trajectory
        const trackingResult = await trackHammerTrajectory(
          video,
          fps,
          (progress: number) => {
            // Map tracking progress (0-100) to overall progress (10-70)
            onProgress(10 + progress * 0.6)
          },
        )

        onProgress(70)

        if (!trackingResult.releasePoint || !trackingResult.landingPoint) {
          throw new Error('Could not detect release or landing point')
        }

        onProgress(80)

        // Calculate physics metrics
        const physics = calculatePhysics({
          trajectory: trackingResult.trajectory,
          releasePoint: trackingResult.releasePoint,
          landingPoint: trackingResult.landingPoint,
          releaseFrame: trackingResult.releaseFrame,
          fps,
          scaleFactor: calibrationData.scaleFactor,
          circleCenter: calibrationData.circleCenter,
        })

        onProgress(90)

        const result: HammerThrowResult = {
          distance: physics.distance,
          releaseAngle: physics.releaseAngle,
          releaseVelocity: physics.releaseVelocity,
          flightTime: physics.flightTime,
          releaseFrame: trackingResult.releaseFrame,
          totalFrames,
          fps,
          scaleFactor: calibrationData.scaleFactor,
          trajectory: trackingResult.trajectory,
          releasePoint: trackingResult.releasePoint,
          landingPoint: trackingResult.landingPoint,
        }

        onProgress(100)
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    video.onerror = () => {
      clearTimeout(timeoutId)
      reject(new Error('Failed to load video for processing'))
    }
  })
}
