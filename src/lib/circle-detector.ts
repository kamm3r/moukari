import * as cvImport from '@techstark/opencv-js'

let cvModule: typeof cvImport | null = null
let cvReady = false

export interface CircleDetectionResult {
  center: { x: number; y: number }
  radius: number
  confidence: 'low' | 'medium' | 'high'
  score: number
}

export async function preloadOpenCV(): Promise<void> {
  if (cvReady && cvModule) return
  console.log('[CircleDetector] Preloading OpenCV...')
  await new Promise((resolve) => setTimeout(resolve, 100))

  const cvAny = cvImport as unknown as {
    Mat?: unknown
    then?: (fn: (m: typeof cvImport) => void) => void
  }

  const waitForInit = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const checkReady = () => {
        if (cvAny.Mat && typeof cvAny.Mat === 'function') {
          console.log('[CircleDetector] OpenCV ready (Mat available)')
          resolve()
        } else {
          console.log('[CircleDetector] Waiting for OpenCV Mat...')
          setTimeout(checkReady, 50)
        }
      }
      checkReady()
    })
  }

  if (cvAny.then && typeof cvAny.then === 'function') {
    console.log('[CircleDetector] OpenCV is a Promise, awaiting...')
    cvModule = await new Promise((resolve) => {
      cvAny.then!((m: typeof cvImport) => resolve(m))
    })
    cvReady = true
  } else {
    await waitForInit()
    cvModule = cvImport
    cvReady = true
  }
  console.log('[CircleDetector] OpenCV preloaded')
}

interface CircleCandidate {
  x: number
  y: number
  radius: number
  score: number
}

function scoreCircleCandidate(
  circle: { x: number; y: number; radius: number },
  imageWidth: number,
  imageHeight: number,
): number {
  let score = 0

  const expectedY = imageHeight * 0.65
  const yDistance = Math.abs(circle.y - expectedY) / imageHeight
  score += Math.max(0, 1 - yDistance * 1.5) * 35

  const expectedX = imageWidth * 0.5
  const xDistance = Math.abs(circle.x - expectedX) / imageWidth
  score += Math.max(0, 1 - xDistance * 2) * 15

  const minExpectedRadius = Math.min(imageWidth, imageHeight) * 0.08
  const maxExpectedRadius = Math.min(imageWidth, imageHeight) * 0.28
  if (
    circle.radius >= minExpectedRadius &&
    circle.radius <= maxExpectedRadius
  ) {
    const optimalRadius = Math.min(imageWidth, imageHeight) * 0.18
    const radiusRatio = Math.min(
      circle.radius / optimalRadius,
      optimalRadius / circle.radius,
    )
    score += radiusRatio * 30
  }

  score += Math.min(circle.radius / 10, 20)

  return score
}

function getConfidenceLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 60) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

export async function detectThrowingCircle(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<CircleDetectionResult | null> {
  console.log('[CircleDetector] Starting circle detection...')

  if (!cvModule) {
    console.error(
      '[CircleDetector] OpenCV not preloaded! Call preloadOpenCV() first.',
    )
    throw new Error('OpenCV not loaded')
  }
  const cv = cvModule
  console.log('[CircleDetector] Using preloaded OpenCV')

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('[CircleDetector] Failed to get canvas context')
    return null
  }

  const maxDimension = 640
  const scale = Math.min(
    1,
    maxDimension / Math.max(canvas.width, canvas.height),
  )
  const processWidth = Math.round(canvas.width * scale)
  const processHeight = Math.round(canvas.height * scale)
  console.log(
    `[CircleDetector] Processing at ${processWidth}x${processHeight} (scale: ${scale})`,
  )

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = processWidth
  tempCanvas.height = processHeight
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) {
    console.error('[CircleDetector] Failed to get temp canvas context')
    return null
  }

  console.log('[CircleDetector] Drawing video frame...')
  tempCtx.drawImage(video, 0, 0, processWidth, processHeight)

  const imageData = tempCtx.getImageData(0, 0, processWidth, processHeight)
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2)

    await new Promise((resolve) => setTimeout(resolve, 0))

    const circles = new cv.Mat()
    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      gray.rows / 8,
      100,
      30,
      Math.min(gray.rows, gray.cols) / 12,
      Math.min(gray.rows, gray.cols) / 3,
    )
    console.log(`[CircleDetector] HoughCircles found ${circles.cols} circles`)

    if (circles.cols === 0) {
      console.log('[CircleDetector] No circles found')
      circles.delete()
      return null
    }

    const candidates: Array<CircleCandidate> = []
    for (let i = 0; i < circles.cols; i++) {
      const x = circles.data32F[i * 3]
      const y = circles.data32F[i * 3 + 1]
      const radius = circles.data32F[i * 3 + 2]

      const score = scoreCircleCandidate(
        { x, y, radius },
        processWidth,
        processHeight,
      )
      console.log(
        `[CircleDetector] Circle ${i}: x=${x.toFixed(0)}, y=${y.toFixed(0)}, r=${radius.toFixed(0)}, score=${score.toFixed(1)}`,
      )

      candidates.push({ x, y, radius, score })
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]

    const scaleBack = 1 / scale
    circles.delete()

    const result: CircleDetectionResult = {
      center: { x: best.x * scaleBack, y: best.y * scaleBack },
      radius: best.radius * scaleBack,
      confidence: getConfidenceLevel(best.score),
      score: best.score,
    }

    console.log(
      `[CircleDetector] Best circle: score=${best.score.toFixed(1)}, confidence=${result.confidence}`,
    )
    return result
  } catch (error) {
    console.error('[CircleDetector] Error during detection:', error)
    throw error
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    tempCanvas.width = 0
    tempCanvas.height = 0
  }
}
