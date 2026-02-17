export async function detectThrowingCircle(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<{ center: { x: number; y: number }; radius: number } | null> {
  const cv = await import('@techstark/opencv-js')

  // Create canvas context and draw video frame
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  // Create OpenCV matrices
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()

  try {
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Apply Gaussian blur to reduce noise
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2)

    // Detect circles using Hough Transform
    const circles = new cv.Mat()
    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1, // dp
      gray.rows / 8, // minDist
      100, // param1 (Canny edge detection threshold)
      30, // param2 (accumulator threshold)
      Math.min(gray.rows, gray.cols) / 10, // minRadius
      Math.min(gray.rows, gray.cols) / 3, // maxRadius
    )

    if (circles.cols > 0) {
      // Get the largest circle (most likely to be the throwing circle)
      let bestCircle = { x: 0, y: 0, radius: 0 }
      let maxRadius = 0

      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3]
        const y = circles.data32F[i * 3 + 1]
        const radius = circles.data32F[i * 3 + 2]

        if (radius > maxRadius) {
          maxRadius = radius
          bestCircle = { x, y, radius }
        }
      }

      return {
        center: { x: bestCircle.x, y: bestCircle.y },
        radius: bestCircle.radius,
      }
    }

    return null
  } finally {
    // Clean up
    src.delete()
    gray.delete()
    blurred.delete()
  }
}
