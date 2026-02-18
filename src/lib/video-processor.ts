import {
  trackHammerTrajectory,
  trackHammerTrajectoryWithWorker,
} from './hammer-tracker'
import { calculatePhysics } from './physics-engine'
import type {
  PhysicsCalculationPayload,
  PhysicsResultPayload,
  PhysicsWorkerInput,
  PhysicsWorkerOutput,
} from './worker-utils'

export interface HammerThrowResult {
  trackedDistance: number
  predictedDistance: number
  distanceConfidence: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number
  releaseFrame: number
  totalFrames: number
  fps: number
  scaleFactor: number
  trajectory: Array<{ x: number; y: number }>
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
  useWorkers?: boolean
  onProgress: (_progress: number) => void
}

async function calculatePhysicsWithWorker(
  payload: PhysicsCalculationPayload,
): Promise<PhysicsResultPayload> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (e: MessageEvent<PhysicsWorkerOutput>) => {
      worker.terminate()
      if (e.data.type === 'result') {
        resolve(e.data.payload as PhysicsResultPayload)
      } else {
        reject(new Error(e.data.payload as string))
      }
    }

    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(`Physics worker error: ${e.message}`))
    }

    const input: PhysicsWorkerInput = {
      type: 'calculate',
      payload,
    }
    worker.postMessage(input)
  })
}

export async function processVideo(
  options: ProcessVideoOptions,
): Promise<HammerThrowResult> {
  const { videoUrl, calibrationData, onProgress, useWorkers = true } = options
  console.log('[VideoProcessor] Starting video processing...')
  console.log(`[VideoProcessor] Workers enabled: ${useWorkers}`)

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = videoUrl
    video.crossOrigin = 'anonymous'

    const timeoutId = setTimeout(() => {
      video.src = ''
      video.remove()
      reject(new Error('Video load timeout - took longer than 30 seconds'))
    }, 30000)

    const cleanupVideo = () => {
      video.src = ''
      video.remove()
    }

    video.onloadedmetadata = async () => {
      console.log(
        '[VideoProcessor] Video metadata loaded, duration:',
        video.duration,
      )
      clearTimeout(timeoutId)
      try {
        const fps = 30
        const totalFrames = Math.round(video.duration * fps)
        console.log(
          `[VideoProcessor] Video info: ${totalFrames} frames, ${fps}fps`,
        )

        if (video.duration > 120) {
          throw new Error('Video too long. Please use a video under 2 minutes.')
        }

        onProgress(10)

        const trackFn = useWorkers
          ? trackHammerTrajectoryWithWorker
          : trackHammerTrajectory
        console.log(
          `[VideoProcessor] Using ${useWorkers ? 'worker' : 'legacy'} tracking`,
        )

        const trackingPromise = trackFn(video, fps, (progress: number) => {
          onProgress(10 + progress * 0.6)
        })

        const trackingTimeoutPromise = new Promise<never>(
          (_, timeoutReject) => {
            setTimeout(
              () =>
                timeoutReject(
                  new Error(
                    'Video processing timeout - took longer than 5 minutes',
                  ),
                ),
              300000,
            )
          },
        )

        console.log('[VideoProcessor] Starting tracking...')
        const trackingResult = await Promise.race([
          trackingPromise,
          trackingTimeoutPromise,
        ])
        console.log('[VideoProcessor] Tracking complete')

        onProgress(70)

        if (!trackingResult.releasePoint || !trackingResult.landingPoint) {
          throw new Error('Could not detect release or landing point')
        }

        onProgress(80)

        let physicsResult: {
          trackedDistance: number
          predictedDistance: number
          distanceConfidence: number
          releaseAngle: number
          releaseVelocity: number
          flightTime: number
        }

        if (useWorkers) {
          console.log('[VideoProcessor] Calculating physics in worker...')
          const physicsPayload: PhysicsCalculationPayload = {
            trajectory: trackingResult.trajectory,
            releasePoint: trackingResult.releasePoint,
            landingPoint: trackingResult.landingPoint,
            releaseFrame: trackingResult.releaseFrame,
            fps,
            scaleFactor: calibrationData.scaleFactor,
            circleCenter: calibrationData.circleCenter,
          }
          physicsResult = await calculatePhysicsWithWorker(physicsPayload)
          console.log('[VideoProcessor] Physics calculation complete')
        } else {
          console.log('[VideoProcessor] Calculating physics on main thread...')
          physicsResult = calculatePhysics({
            trajectory: trackingResult.trajectory,
            releasePoint: trackingResult.releasePoint,
            landingPoint: trackingResult.landingPoint,
            releaseFrame: trackingResult.releaseFrame,
            fps,
            scaleFactor: calibrationData.scaleFactor,
            circleCenter: calibrationData.circleCenter,
          })
        }

        onProgress(90)

        const result: HammerThrowResult = {
          trackedDistance: physicsResult.trackedDistance,
          predictedDistance: physicsResult.predictedDistance,
          distanceConfidence: physicsResult.distanceConfidence,
          releaseAngle: physicsResult.releaseAngle,
          releaseVelocity: physicsResult.releaseVelocity,
          flightTime: physicsResult.flightTime,
          releaseFrame: trackingResult.releaseFrame,
          totalFrames,
          fps,
          scaleFactor: calibrationData.scaleFactor,
          trajectory: trackingResult.trajectory,
          releasePoint: trackingResult.releasePoint,
          landingPoint: trackingResult.landingPoint,
        }

        onProgress(100)
        cleanupVideo()
        console.log('[VideoProcessor] Processing complete')
        resolve(result)
      } catch (error) {
        console.error('[VideoProcessor] Error during processing:', error)
        cleanupVideo()
        reject(error)
      }
    }

    video.onerror = () => {
      clearTimeout(timeoutId)
      cleanupVideo()
      reject(new Error('Failed to load video for processing'))
    }
  })
}
