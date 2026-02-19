import type {
  FramePayload,
  InitPayload,
  TrackingResultPayload,
  TrackingWorkerInput,
  TrackingWorkerOutput,
} from './worker-utils'
import { createImageBitmapFromCanvas } from './worker-utils'

export interface TurnMetrics {
  turnNumber: number
  startIndex: number
  endIndex: number
  durationSec: number
  avgTangentialVelocity: number
  peakTangentialVelocity: number
  avgTangentialAcceleration: number
  peakTangentialAcceleration: number
  avgCentripetalAcceleration: number
  peakCentripetalAcceleration: number
}

export interface TrackingResult {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number // index in trajectory array
  turns: TurnMetrics[]
}

function unwrapAngles(angles: number[]): number[] {
  if (angles.length === 0) return []
  const out = [angles[0]]
  for (let i = 1; i < angles.length; i++) {
    let d = angles[i] - angles[i - 1]
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    out.push(out[i - 1] + d)
  }
  return out
}

function analyzeTurns(options: {
  trajectory: Array<{ x: number; y: number }>
  releaseIndex: number
  circleCenter: { x: number; y: number }
  scaleFactor: number // px/m
  fps: number
  frameStep: number
}): TurnMetrics[] {
  const { trajectory, releaseIndex, circleCenter, scaleFactor, fps, frameStep } =
    options

  if (trajectory.length < 12 || releaseIndex < 8) return []

  const dt = frameStep / fps
  const pre = trajectory.slice(0, Math.min(releaseIndex + 1, trajectory.length))

  const rawAngles = pre.map((p) =>
    Math.atan2(p.y - circleCenter.y, p.x - circleCenter.x),
  )
  const angles = unwrapAngles(rawAngles)

  // Convert to cumulative rotation magnitude (handle direction)
  const totalRot = angles[angles.length - 1] - angles[0]
  const dir = totalRot >= 0 ? 1 : -1

  const rMeters = pre.map((p) => {
    const dx = p.x - circleCenter.x
    const dy = p.y - circleCenter.y
    return Math.sqrt(dx * dx + dy * dy) / scaleFactor
  })

  const omega: number[] = [0]
  for (let i = 1; i < angles.length; i++) {
    omega.push(((angles[i] - angles[i - 1]) * dir) / dt)
  }

  const vTan: number[] = omega.map((w, i) => Math.abs(w) * rMeters[i])

  const aTan: number[] = [0]
  for (let i = 1; i < vTan.length; i++) {
    aTan.push((vTan[i] - vTan[i - 1]) / dt)
  }

  const aCent: number[] = vTan.map((v, i) => {
    const r = Math.max(rMeters[i], 1e-6)
    return (v * v) / r
  })

  const turns: TurnMetrics[] = []
  let start = 0

  for (let i = 1; i < angles.length; i++) {
    const rotFromStart = (angles[i] - angles[start]) * dir
    if (rotFromStart >= 2 * Math.PI) {
      turns.push(
        summarizeTurn({
          turnNumber: turns.length + 1,
          startIndex: start,
          endIndex: i,
          dt,
          vTan,
          aTan,
          aCent,
        }),
      )
      start = i
    }
  }

  // Partial last turn if significant (>= 90 degrees)
  if (start < angles.length - 4) {
    const rem = Math.abs((angles[angles.length - 1] - angles[start]) * dir)
    if (rem >= Math.PI / 2) {
      turns.push(
        summarizeTurn({
          turnNumber: turns.length + 1,
          startIndex: start,
          endIndex: angles.length - 1,
          dt,
          vTan,
          aTan,
          aCent,
        }),
      )
    }
  }

  return turns
}

function summarizeTurn(args: {
  turnNumber: number
  startIndex: number
  endIndex: number
  dt: number
  vTan: number[]
  aTan: number[]
  aCent: number[]
}): TurnMetrics {
  const { turnNumber, startIndex, endIndex, dt, vTan, aTan, aCent } = args
  const slice = (arr: number[]) => arr.slice(startIndex, endIndex + 1)
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
  const peak = (arr: number[]) => (arr.length ? Math.max(...arr) : 0)

  const v = slice(vTan)
  const at = slice(aTan)
  const ac = slice(aCent)

  return {
    turnNumber,
    startIndex,
    endIndex,
    durationSec: (endIndex - startIndex) * dt,
    avgTangentialVelocity: avg(v),
    peakTangentialVelocity: peak(v),
    avgTangentialAcceleration: avg(at),
    peakTangentialAcceleration: peak(at),
    avgCentripetalAcceleration: avg(ac),
    peakCentripetalAcceleration: peak(ac),
  }
}

export async function trackHammerTrajectoryWithWorker(
  video: HTMLVideoElement,
  fps: number,
  frameStep: number,
  circleCenter: { x: number; y: number },
  scaleFactor: number,
  onProgress: (progress: number) => void,
): Promise<TrackingResult> {
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

  const seekTo = async (time: number) => {
    video.currentTime = time
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Video seek timeout at t=${time.toFixed(3)}`))
      }, 5000)

      const handleSeek = () => {
        clearTimeout(timeout)
        resolve()
      }

      video.addEventListener('seeked', handleSeek, { once: true })
    })
  }

  try {
    const initPayload: InitPayload = {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      fps,
      frameStep,
      circleCenter,
    }
    await sendAndWait({ type: 'init', payload: initPayload })

    const startTime = Date.now()
    const maxProcessingTime = 300000

    let framesProcessed = 0

    for (let frameNum = 0; frameNum < totalFrames; frameNum += frameStep) {
      if (Date.now() - startTime > maxProcessingTime) {
        throw new Error('Video processing timeout - took longer than 5 minutes')
      }

      if (framesProcessed % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      await seekTo(frameNum / fps)

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const bitmap = await createImageBitmapFromCanvas(canvas)

      const framePayload: FramePayload = {
        frameNumber: frameNum,
        imageData: bitmap,
      }

      await sendAndWait({ type: 'processFrame', payload: framePayload })

      framesProcessed++
      onProgress((frameNum / totalFrames) * 100)
    }

    const result = await sendAndWait({
      type: 'detectReleaseLanding',
      payload: null,
    })

    if (result.type !== 'result') {
      throw new Error('Failed to get tracking result from worker')
    }

    const payload = result.payload as TrackingResultPayload

    const turns = analyzeTurns({
      trajectory: payload.trajectory,
      releaseIndex: payload.releaseFrame,
      circleCenter,
      scaleFactor,
      fps,
      frameStep,
    })

    return {
      trajectory: payload.trajectory,
      releasePoint: payload.releasePoint,
      landingPoint: payload.landingPoint,
      releaseFrame: payload.releaseFrame,
      turns,
    }
  } finally {
    worker.terminate()
    canvas.width = 0
    canvas.height = 0
  }
}