export interface PhysicsResult {
  distance: number
  releaseAngle: number
  releaseVelocity: number
  flightTime: number
}

interface CalculatePhysicsOptions {
  trajectory: { x: number; y: number }[]
  releasePoint: { x: number; y: number }
  landingPoint: { x: number; y: number }
  releaseFrame: number
  fps: number
  scaleFactor: number
  circleCenter: { x: number; y: number }
}

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

  // Calculate distance from circle center to landing point (in meters)
  const dx = (landingPoint.x - circleCenter.x) / scaleFactor
  const dy = (landingPoint.y - circleCenter.y) / scaleFactor
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Calculate release velocity
  // Use points shortly after release to estimate initial velocity
  let releaseVelocity = 0
  if (trajectory.length > releaseFrame + 5) {
    const p1 = trajectory[releaseFrame]
    const p2 = trajectory[releaseFrame + 3]
    const dx = (p2.x - p1.x) / scaleFactor
    const dy = (p2.y - p1.y) / scaleFactor
    const dt = 3 / fps
    releaseVelocity = Math.sqrt(dx * dx + dy * dy) / dt
  }

  // Calculate release angle
  let releaseAngle = 0
  if (trajectory.length > releaseFrame + 2) {
    const p1 = trajectory[releaseFrame]
    const p2 = trajectory[releaseFrame + 2]
    const dx = p2.x - p1.x
    const dy = p1.y - p2.y // Inverted Y for angle calculation
    releaseAngle = Math.atan2(dy, dx) * (180 / Math.PI)
    // Normalize to 0-90 degrees (upward angle)
    releaseAngle = Math.abs(releaseAngle)
    if (releaseAngle > 90) {
      releaseAngle = 180 - releaseAngle
    }
  }

  // Calculate flight time
  let flightTime = 0
  if (trajectory.length > releaseFrame + 5) {
    // Find when the hammer hits the ground (y position stops decreasing)
    let landingFrame = trajectory.length - 1
    for (let i = releaseFrame + 5; i < trajectory.length - 3; i++) {
      const yChange = trajectory[i + 3].y - trajectory[i].y
      if (Math.abs(yChange) < 5) {
        // Stable position
        landingFrame = i
        break
      }
    }
    flightTime = (landingFrame - releaseFrame) / fps
  }

  return {
    distance,
    releaseAngle,
    releaseVelocity,
    flightTime,
  }
}
