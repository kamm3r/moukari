export interface TrackingResult {
  trajectory: { x: number; y: number }[]
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number
}

export async function trackHammerTrajectory(
  video: HTMLVideoElement,
  fps: number,
  onProgress: (progress: number) => void,
): Promise<TrackingResult> {
  const cv = await import('@techstark/opencv-js')

  const canvas = document.createElement('canvas')
  // Downscale for performance - process at 480p max
  const maxDimension = 854 // 480p width for 16:9
  const scale = Math.min(
    1,
    maxDimension / Math.max(video.videoWidth, video.videoHeight),
  )
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas context')

  const trajectory: { x: number; y: number }[] = []
  const frameStep = 6 // Process every 6th frame for better performance
  const totalFrames = Math.round(video.duration * fps)

  // Previous frame for optical flow
  let prevFrame: InstanceType<typeof cv.Mat> | null = null
  let prevPoints: InstanceType<typeof cv.Mat> | null = null

  try {
    // Sample frames throughout the video
    let framesProcessed = 0
    const yieldEvery = 3 // Yield to main thread every 3 frames to prevent UI freeze

    for (let frameNum = 0; frameNum < totalFrames; frameNum += frameStep) {
      // Yield control to browser periodically to prevent freezing
      if (framesProcessed % yieldEvery === 0 && framesProcessed > 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      framesProcessed++

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
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const frame = cv.matFromImageData(imageData)
      const gray = new cv.Mat()
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY)

      // Simple motion detection: find moving object
      if (prevFrame && prevPoints) {
        const nextPoints = new cv.Mat()
        const status = new cv.Mat()
        const err = new cv.Mat()

        // Calculate optical flow
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

        // Get good points
        const goodPoints: { x: number; y: number }[] = []
        for (let i = 0; i < status.rows; i++) {
          if (status.data[i] === 1) {
            const x = nextPoints.data32F[i * 2]
            const y = nextPoints.data32F[i * 2 + 1]
            goodPoints.push({ x, y })
          }
        }

        // Calculate centroid of motion
        if (goodPoints.length > 0) {
          const centroid = {
            x: goodPoints.reduce((sum, p) => sum + p.x, 0) / goodPoints.length,
            y: goodPoints.reduce((sum, p) => sum + p.y, 0) / goodPoints.length,
          }
          trajectory.push(centroid)
        }

        // Clean up
        nextPoints.delete()
        status.delete()
        err.delete()
      }

      // Detect features for next iteration
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

      // Clean up
      frame.delete()
      gray.delete()

      // Report progress
      onProgress((frameNum / totalFrames) * 100)
    }

    // Detect release and landing points
    const { releasePoint, landingPoint, releaseFrame } =
      detectReleaseAndLanding(trajectory)

    return {
      trajectory,
      releasePoint,
      landingPoint,
      releaseFrame,
    }
  } finally {
    // Clean up
    if (prevFrame) prevFrame.delete()
    if (prevPoints) prevPoints.delete()
  }
}

function detectReleaseAndLanding(trajectory: { x: number; y: number }[]): {
  releasePoint: { x: number; y: number } | null
  landingPoint: { x: number; y: number } | null
  releaseFrame: number
} {
  if (trajectory.length < 10) {
    return { releasePoint: null, landingPoint: null, releaseFrame: 0 }
  }

  // Calculate velocities between consecutive points
  const velocities: number[] = []
  for (let i = 1; i < trajectory.length; i++) {
    const dx = trajectory[i].x - trajectory[i - 1].x
    const dy = trajectory[i].y - trajectory[i - 1].y
    const velocity = Math.sqrt(dx * dx + dy * dy)
    velocities.push(velocity)
  }

  // Find release point: sudden velocity increase
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

  // Find landing point: velocity drops and position stabilizes
  let landingIndex = trajectory.length - 1

  for (let i = releaseIndex + 10; i < velocities.length - 3; i++) {
    const avgVelocity =
      velocities.slice(i, i + 3).reduce((a, b) => a + b, 0) / 3
    if (avgVelocity < 2) {
      // Threshold for "stopped"
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
