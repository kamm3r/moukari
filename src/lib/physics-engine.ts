export interface PhysicsResult {
  trackedDistance: number
  predictedDistance: number
  distanceConfidence: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number
}

interface CalculatePhysicsOptions {
  trajectory: Array<{ x: number; y: number }>
  releasePoint: { x: number; y: number }
  landingPoint: { x: number; y: number }
  releaseFrame: number
  fps: number
  scaleFactor: number
  circleCenter: { x: number; y: number }
}

const GRAVITY = 9.81

export function calculatePhysics(
  options: CalculatePhysicsOptions,
): PhysicsResult {
  const {
    trajectory,
    landingPoint,
    releaseFrame,
    fps,
    scaleFactor,
    circleCenter,
  } = options

  const trackedDistance = calculateTrackedDistance(
    landingPoint,
    circleCenter,
    scaleFactor,
  )

  const { releaseVelocity, releaseAngle } = calculateReleaseMetrics(
    trajectory,
    releaseFrame,
    fps,
    scaleFactor,
  )

  const predictedDistance = calculatePredictedDistance(
    releaseVelocity,
    releaseAngle,
  )

  const flightTime = calculateFlightTime(trajectory, releaseFrame, fps)

  const distanceConfidence = calculateDistanceConfidence(
    trackedDistance,
    predictedDistance,
  )

  return {
    trackedDistance,
    predictedDistance,
    distanceConfidence,
    releaseAngle,
    releaseVelocity,
    flightTime,
  }
}

function calculateTrackedDistance(
  landingPoint: { x: number; y: number },
  circleCenter: { x: number; y: number },
  scaleFactor: number,
): number {
  const dx = (landingPoint.x - circleCenter.x) / scaleFactor
  const dy = (landingPoint.y - circleCenter.y) / scaleFactor
  return Math.sqrt(dx * dx + dy * dy)
}

function calculateReleaseMetrics(
  trajectory: Array<{ x: number; y: number }>,
  releaseFrame: number,
  fps: number,
  scaleFactor: number,
): { releaseVelocity: number; releaseAngle: number } {
  let releaseVelocity = 0
  let releaseAngle = 0

  if (trajectory.length > releaseFrame + 5) {
    const p1 = trajectory[releaseFrame]
    const p2 = trajectory[releaseFrame + 3]
    const dx = (p2.x - p1.x) / scaleFactor
    const dy = (p2.y - p1.y) / scaleFactor
    const dt = 3 / fps
    releaseVelocity = Math.sqrt(dx * dx + dy * dy) / dt
  }

  if (trajectory.length > releaseFrame + 2) {
    const p1 = trajectory[releaseFrame]
    const p2 = trajectory[releaseFrame + 2]
    const dx = p2.x - p1.x
    const dy = p1.y - p2.y
    releaseAngle = Math.atan2(dy, dx) * (180 / Math.PI)
    releaseAngle = Math.abs(releaseAngle)
    if (releaseAngle > 90) {
      releaseAngle = 180 - releaseAngle
    }
  }

  return { releaseVelocity, releaseAngle }
}

function calculatePredictedDistance(
  releaseVelocity: number,
  releaseAngle: number,
): number {
  if (releaseVelocity <= 0 || releaseAngle <= 0 || releaseAngle >= 90) {
    return 0
  }

  const angleRadians = (releaseAngle * Math.PI) / 180
  const sin2Theta = Math.sin(2 * angleRadians)
  const distance = (releaseVelocity * releaseVelocity * sin2Theta) / GRAVITY

  return Math.max(0, distance)
}

function calculateFlightTime(
  trajectory: Array<{ x: number; y: number }>,
  releaseFrame: number,
  fps: number,
): number {
  if (trajectory.length <= releaseFrame + 5) {
    return 0
  }

  let landingFrame = trajectory.length - 1
  for (let i = releaseFrame + 5; i < trajectory.length - 3; i++) {
    const yChange = trajectory[i + 3].y - trajectory[i].y
    if (Math.abs(yChange) < 5) {
      landingFrame = i
      break
    }
  }

  return (landingFrame - releaseFrame) / fps
}

function calculateDistanceConfidence(
  trackedDistance: number,
  predictedDistance: number,
): number {
  if (trackedDistance <= 0 || predictedDistance <= 0) {
    return 0
  }

  const diff = Math.abs(trackedDistance - predictedDistance)
  const avg = (trackedDistance + predictedDistance) / 2
  const relativeError = diff / avg

  const confidence = Math.max(0, 1 - relativeError)
  return Math.round(confidence * 100) / 100
}
