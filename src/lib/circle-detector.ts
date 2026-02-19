import { getOpenCV, loadOpenCV } from '@/hooks/use-opencv'

let cvModule: any | null = null

export interface CircleDetectionResult {
  center: { x: number; y: number }
  radius: number
  confidence: 'low' | 'medium' | 'high'
  score: number
}

export async function preloadOpenCV(): Promise<void> {
  await loadOpenCV()
  cvModule = getOpenCV()
  if (!cvModule) throw new Error('OpenCV not loaded')
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
  if (circle.radius >= minExpectedRadius && circle.radius <= maxExpectedRadius) {
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Circle detection aborted')
}

export async function detectThrowingCircle(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<CircleDetectionResult | null> {
  if (!cvModule) await preloadOpenCV()
  const cv = cvModule as any

  throwIfAborted(signal)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Aggressive downscale = huge speed win
  const maxDimension = 320
  const scale = Math.min(
    1,
    maxDimension / Math.max(canvas.width, canvas.height),
  )
  const processWidth = Math.max(2, Math.round(canvas.width * scale))
  const processHeight = Math.max(2, Math.round(canvas.height * scale))

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = processWidth
  tempCanvas.height = processHeight
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return null

  // Draw a single frame
  tempCtx.drawImage(video, 0, 0, processWidth, processHeight)

  // Yield so UI can render “Detecting…”
  await nextFrame()
  throwIfAborted(signal)

  const imageData = tempCtx.getImageData(0, 0, processWidth, processHeight)

  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Median blur is often cheaper than large Gaussian kernels in JS/WASM
    cv.medianBlur(gray, blurred, 5)

    await nextFrame()
    throwIfAborted(signal)

    const circles = new cv.Mat()

    // Tighter params: fewer candidates, faster
    const minR = Math.round(Math.min(processWidth, processHeight) * 0.09)
    const maxR = Math.round(Math.min(processWidth, processHeight) * 0.30)

    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1.2, // dp
      gray.rows / 6, // minDist
      120, // param1 (Canny high)
      35, // param2 (accumulator threshold) ↑ => fewer circles
      minR,
      maxR,
    )

    const count = circles.cols ?? 0
    if (count === 0) {
      circles.delete()
      return null
    }

    const candidates: Array<CircleCandidate> = []
    for (let i = 0; i < count; i++) {
      const x = circles.data32F[i * 3]
      const y = circles.data32F[i * 3 + 1]
      const radius = circles.data32F[i * 3 + 2]
      const score = scoreCircleCandidate(
        { x, y, radius },
        processWidth,
        processHeight,
      )
      candidates.push({ x, y, radius, score })
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]

    circles.delete()

    const scaleBack = 1 / scale
    return {
      center: { x: best.x * scaleBack, y: best.y * scaleBack },
      radius: best.radius * scaleBack,
      confidence: getConfidenceLevel(best.score),
      score: best.score,
    }
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    tempCanvas.width = 0
    tempCanvas.height = 0
  }
}