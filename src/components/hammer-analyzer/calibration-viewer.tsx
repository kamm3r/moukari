import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, Loader2, Move } from 'lucide-react'
import type { VideoMetadata, VideoWarning } from '@/hooks/use-video-metadata'
import type { CircleDetectionResult } from '@/lib/circle-detector'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { detectThrowingCircle, preloadOpenCV } from '@/lib/circle-detector'

interface CalibrationViewerProps {
  videoUrl: string
  metadata: VideoMetadata | null
  warnings: Array<VideoWarning>
  onComplete: (data: {
    circleCenter: { x: number; y: number }
    circleRadius: number
    scaleFactor: number
  }) => void
  onBack: () => void
  isOpenCVLoading?: boolean
  openCVError?: string | null
}

export function CalibrationViewer({
  videoUrl,
  metadata,
  warnings,
  onComplete,
  onBack,
  isOpenCVLoading = false,
  openCVError = null,
}: CalibrationViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [isProcessing, setIsProcessing] = useState(true)
  const [detectionResult, setDetectionResult] =
    useState<CircleDetectionResult | null>(null)

  const [manualMode, setManualMode] = useState(false)
  const [manualCenter, setManualCenter] = useState<{
    x: number
    y: number
  } | null>(null)
  const [manualRadius, setManualRadius] = useState(100)
  const [autoRadius, setAutoRadius] = useState<number | null>(null)

  // Track when the video frame is ready so the overlay effect
  // can reliably draw it.
  const [frameReady, setFrameReady] = useState(false)

  const canvasScale = useMemo(() => {
    const w = metadata?.width ?? 1280
    const h = metadata?.height ?? 720
    const s = Math.min(1, 640 / w, 360 / h)
    return Number.isFinite(s) && s > 0 ? s : 1
  }, [metadata?.width, metadata?.height])

  const canvasWidth = Math.round((metadata?.width ?? 1280) * canvasScale)
  const canvasHeight = Math.round((metadata?.height ?? 720) * canvasScale)

  // ── Detection effect ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()

    const waitForVideo = (video: HTMLVideoElement, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) return resolve()
        const timeout = setTimeout(
          () => reject(new Error('Video load timeout')),
          10_000,
        )
        const cleanup = () => clearTimeout(timeout)

        video.addEventListener(
          'loadeddata',
          () => {
            cleanup()
            resolve()
          },
          { once: true, signal },
        )
        video.addEventListener(
          'error',
          () => {
            cleanup()
            reject(new Error('Video load error'))
          },
          { once: true, signal },
        )

        signal.addEventListener('abort', () => {
          cleanup()
          reject(new Error('Aborted'))
        })
      })

    const seekTo = (
      video: HTMLVideoElement,
      time: number,
      signal: AbortSignal,
    ) =>
      new Promise<void>((resolve, reject) => {
        video.currentTime = time
        const timeout = setTimeout(
          () => reject(new Error('Seek timeout')),
          5_000,
        )
        const cleanup = () => clearTimeout(timeout)

        video.addEventListener(
          'seeked',
          () => {
            cleanup()
            resolve()
          },
          { once: true, signal },
        )
        signal.addEventListener('abort', () => {
          cleanup()
          reject(new Error('Aborted'))
        })
      })

    const waitForDecodedFrame = (
      video: HTMLVideoElement,
      signal: AbortSignal,
    ) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 500) // hard cap

        signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new Error('Aborted'))
        })

        if ('requestVideoFrameCallback' in video) {
          ;(video as any).requestVideoFrameCallback(() => {
            clearTimeout(timeout)
            resolve()
          })
        } else {
          // Two rAF fallback
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(timeout)
              resolve()
            }),
          )
        }
      })

    const run = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      try {
        setIsProcessing(true)
        setFrameReady(false)

        await waitForVideo(video, ac.signal)
        if (cancelled) return

        await seekTo(video, Math.max(0, video.duration / 2), ac.signal)
        if (cancelled) return

        await waitForDecodedFrame(video, ac.signal)
        if (cancelled) return

        setFrameReady(true)

        // Give the browser one frame to paint the "Detecting…"
        // overlay before we potentially block the main thread.
        await new Promise((r) => requestAnimationFrame(r))
        if (cancelled) return

        await preloadOpenCV()
        if (cancelled) return

        const result = await Promise.race([
          detectThrowingCircle(video, canvas, ac.signal),
          new Promise<null>((_, rej) =>
            setTimeout(() => rej(new Error('Detection timeout')), 8_000),
          ),
        ])

        if (cancelled) return

        if (result) {
          setDetectionResult(result)
          setAutoRadius(result.radius)
          setManualCenter(result.center)
          setManualRadius(result.radius)
          setManualMode(false)
        } else {
          setManualMode(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[CalibrationViewer]', err)
          setManualMode(true)
        }
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    }

    run()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [videoUrl])

  // ── Canvas redraw effect ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Only draw the video frame if we have one
    if (frameReady && video.readyState >= 2) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    const center =
      manualMode && manualCenter ? manualCenter : detectionResult?.center
    const radius = manualMode
      ? manualRadius
      : (autoRadius ?? detectionResult?.radius)

    if (center && radius) {
      ctx.strokeStyle = manualMode ? '#f59e0b' : '#22c55e'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI)
      ctx.stroke()

      ctx.fillStyle = manualMode ? '#f59e0b' : '#22c55e'
      ctx.beginPath()
      ctx.arc(center.x, center.y, 5, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [
    detectionResult,
    manualCenter,
    manualRadius,
    manualMode,
    autoRadius,
    frameReady, // ← added
    isProcessing, // ← added so it repaints when detection finishes
  ])

  // ── Handlers ──────────────────────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!manualMode) return
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) * (canvas.width / rect.width)
      const y = (e.clientY - rect.top) * (canvas.height / rect.height)
      setManualCenter({ x, y })
    },
    [manualMode],
  )

  const handleRadiusChange = useCallback(
    (value: number | ReadonlyArray<number>) => {
      const v = Array.isArray(value) ? value[0] : value
      const next = v ?? 100
      if (manualMode) setManualRadius(next)
      else setAutoRadius(next)
    },
    [manualMode],
  )

  const getScaleFactorPxPerMeter = useCallback(() => {
    const radiusCanvas = manualMode
      ? manualRadius
      : (autoRadius ?? detectionResult?.radius)
    if (!radiusCanvas) return 0
    const radiusOriginalPx = radiusCanvas / canvasScale
    return (radiusOriginalPx * 2) / 2.135
  }, [manualMode, manualRadius, detectionResult, autoRadius, canvasScale])

  const handleComplete = useCallback(() => {
    const centerCanvas =
      manualMode && manualCenter ? manualCenter : detectionResult?.center
    const radiusCanvas = manualMode
      ? manualRadius
      : (autoRadius ?? detectionResult?.radius)

    if (!centerCanvas || !radiusCanvas) return

    const centerOriginal = {
      x: centerCanvas.x / canvasScale,
      y: centerCanvas.y / canvasScale,
    }
    const radiusOriginal = radiusCanvas / canvasScale

    onComplete({
      circleCenter: centerOriginal,
      circleRadius: radiusOriginal,
      scaleFactor: (radiusOriginal * 2) / 2.135,
    })
  }, [
    manualMode,
    manualCenter,
    manualRadius,
    detectionResult,
    onComplete,
    autoRadius,
    canvasScale,
  ])

  const confidenceBadge = detectionResult && !manualMode && (
    <span
      className={`text-xs px-2 py-1 rounded ${
        detectionResult.confidence === 'high'
          ? 'bg-green-100 text-green-800'
          : detectionResult.confidence === 'medium'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
      }`}
    >
      {detectionResult.confidence} confidence
    </span>
  )

  return <Card>{/* ... rest of JSX stays the same ... */}</Card>
}
