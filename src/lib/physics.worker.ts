import { calculatePhysics } from './physics-engine'
import type {
  PhysicsResultPayload,
  PhysicsWorkerInput,
  PhysicsWorkerOutput,
} from './worker-utils'

self.onmessage = (e: MessageEvent<PhysicsWorkerInput>) => {
  const { payload } = e.data

  try {
    const result = calculatePhysics({
      trajectory: payload.trajectory,
      releasePoint: payload.releasePoint,
      landingPoint: payload.landingPoint,
      releaseFrame: payload.releaseFrame,
      fps: payload.fps,
      scaleFactor: payload.scaleFactor,
      circleCenter: payload.circleCenter,
    })

    const output: PhysicsResultPayload = {
      trackedDistance: result.trackedDistance,
      predictedDistance: result.predictedDistance,
      distanceConfidence: result.distanceConfidence,
      releaseAngle: result.releaseAngle,
      releaseVelocity: result.releaseVelocity,
      flightTime: result.flightTime,
    }

    const response: PhysicsWorkerOutput = {
      type: 'result',
      payload: output,
    }
    self.postMessage(response)
  } catch (error) {
    const response: PhysicsWorkerOutput = {
      type: 'error',
      payload: error instanceof Error ? error.message : 'Unknown error',
    }
    self.postMessage(response)
  }
}

export {}
