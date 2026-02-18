import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, Loader2, Move } from 'lucide-react'
import type { VideoMetadata, VideoWarning } from '@/hooks/use-video-metadata'
import type {CircleDetectionResult} from '@/lib/circle-detector';
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
import {
  
  detectThrowingCircle,
  preloadOpenCV
} from '@/lib/circle-detector'

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

  const canvasWidth = Math.min(metadata?.width || 1280, 640)
  const canvasHeight = Math.min(metadata?.height || 720, 360)

  useEffect(() => {
    console.log('[CalibrationViewer] Starting circle detection effect...')
    let isCancelled = false
    const abortController = new AbortController()

    const detect = async () => {
      if (!videoRef.current || !canvasRef.current) {
        console.error('[CalibrationViewer] Missing video or canvas ref')
        return
      }

      const video = videoRef.current
      console.log(
        '[CalibrationViewer] Video element ready, readyState:',
        video.readyState,
      )

      try {
        if (video.readyState < 2) {
          console.log('[CalibrationViewer] Waiting for video to load...')
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.error('[CalibrationViewer] Video load timeout')
              reject(new Error('Video load timeout'))
            }, 10000)

            const handleLoad = () => {
              console.log('[CalibrationViewer] Video loaded')
              clearTimeout(timeout)
              resolve()
            }

            const handleError = () => {
              console.error('[CalibrationViewer] Video load error')
              clearTimeout(timeout)
              reject(new Error('Failed to load video'))
            }

            video.addEventListener('loadeddata', handleLoad, {
              signal: abortController.signal,
            })
            video.addEventListener('error', handleError, {
              signal: abortController.signal,
            })
          })
        }

        if (isCancelled) return

        const seekTime = video.duration / 2
        console.log(`[CalibrationViewer] Seeking to ${seekTime}s`)
        video.currentTime = seekTime

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Video seek timeout')),
            5000,
          )

          const handleSeek = () => {
            clearTimeout(timeout)
            resolve()
          }
          const handleError = () => {
            clearTimeout(timeout)
            reject(new Error('Failed to seek video'))
          }

          video.addEventListener('seeked', handleSeek, { once: true })
          video.addEventListener('error', handleError, { once: true })
        })

        if (isCancelled) return

        console.log('[CalibrationViewer] Preloading OpenCV...')
        await preloadOpenCV()

        if (isCancelled) return

        console.log('[CalibrationViewer] Starting circle detection...')
        const detectionPromise = detectThrowingCircle(video, canvasRef.current)
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(
            () => reject(new Error('Circle detection timeout')),
            15000,
          ),
        )
        const result = await Promise.race([detectionPromise, timeoutPromise])

        if (isCancelled) return

        if (result) {
          console.log('[CalibrationViewer] Circle detected:', result)
          setDetectionResult(result)
          setManualCenter(result.center)
          setManualRadius(result.radius)
        } else {
          console.log(
            '[CalibrationViewer] No circle detected, switching to manual mode',
          )
          setManualMode(true)
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[CalibrationViewer] Detection error:', err)
          setManualMode(true)
        }
      } finally {
        if (!isCancelled) {
          setIsProcessing(false)
        }
      }
    }

    detect()

    return () => {
      console.log('[CalibrationViewer] Cleanup - cancelling detection')
      isCancelled = true
      abortController.abort()
    }
  }, [videoUrl])

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

    const center =
      manualMode && manualCenter ? manualCenter : detectionResult?.center
    const radius = manualMode ? manualRadius : detectionResult?.radius

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
  }, [detectionResult, manualCenter, manualRadius, manualMode])

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
      setManualRadius(v ?? 100)
    },
    [],
  )

  const getScaleFactor = useCallback(() => {
    const radius = manualMode ? manualRadius : detectionResult?.radius
    if (!radius) return 0
    return (radius * 2) / 2.135
  }, [manualMode, manualRadius, detectionResult])

  const handleComplete = useCallback(() => {
    const center =
      manualMode && manualCenter ? manualCenter : detectionResult?.center
    const radius = manualMode ? manualRadius : detectionResult?.radius
    if (!center || !radius) return

    onComplete({
      circleCenter: center,
      circleRadius: radius,
      scaleFactor: (radius * 2) / 2.135,
    })
  }, [manualMode, manualCenter, manualRadius, detectionResult, onComplete])

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Calibration</CardTitle>
            <CardDescription>
              {manualMode
                ? 'Click on the video to position the circle center'
                : 'Verify the throwing circle detection. Adjust if needed.'}
            </CardDescription>
          </div>
          {confidenceBadge}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((warning, idx) => (
              <Alert
                key={idx}
                variant={
                  warning.severity === 'error' ? 'destructive' : 'default'
                }
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{warning.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <div className="relative">
          <video
            ref={videoRef}
            src={videoUrl}
            className="hidden"
            crossOrigin="anonymous"
          />
          <canvas
            ref={canvasRef}
            className={`w-full rounded-lg border ${manualMode ? 'cursor-crosshair' : ''}`}
            width={canvasWidth}
            height={canvasHeight}
            onClick={handleCanvasClick}
          />
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Detecting throwing circle...</span>
              </div>
            </div>
          )}
        </div>

        {!isProcessing && !manualMode && detectionResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span>Circle detected! Adjust radius if needed.</span>
            </div>

            <div className="space-y-2">
              <Label>Circle Radius Adjustment</Label>
              <Slider
                value={[detectionResult.radius]}
                onValueChange={handleRadiusChange}
                min={detectionResult.radius * 0.5}
                max={detectionResult.radius * 1.5}
                step={1}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Smaller</span>
                <span>Current: {Math.round(detectionResult.radius)}px</span>
                <span>Larger</span>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-lg text-sm">
              <p>
                <strong>Calibration:</strong> {getScaleFactor().toFixed(2)}{' '}
                pixels per meter
              </p>
              <p className="text-muted-foreground">
                Based on standard 2.135m diameter throwing circle
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => setManualMode(true)}
              className="w-full"
            >
              <Move className="h-4 w-4 mr-2" />
              Switch to Manual Mode
            </Button>
          </div>
        )}

        {!isProcessing && manualMode && (
          <div className="space-y-4">
            <Alert>
              <Move className="h-4 w-4" />
              <AlertDescription>
                <strong>Manual Mode:</strong> Click on the video to set the
                circle center, then adjust the radius.
              </AlertDescription>
            </Alert>

            {manualCenter && (
              <div className="space-y-2">
                <Label>Circle Radius</Label>
                <Slider
                  value={[manualRadius]}
                  onValueChange={handleRadiusChange}
                  min={20}
                  max={Math.min(canvasWidth, canvasHeight) / 2}
                  step={1}
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Smaller</span>
                  <span>Current: {Math.round(manualRadius)}px</span>
                  <span>Larger</span>
                </div>
              </div>
            )}

            {!manualCenter && (
              <p className="text-muted-foreground text-sm">
                Click on the video to place the circle center.
              </p>
            )}

            <div className="bg-muted p-3 rounded-lg text-sm">
              <p>
                <strong>Calibration:</strong>{' '}
                {manualCenter
                  ? `${getScaleFactor().toFixed(2)} pixels per meter`
                  : 'Position the circle first'}
              </p>
              <p className="text-muted-foreground">
                Based on standard 2.135m diameter throwing circle
              </p>
            </div>

            {detectionResult && (
              <Button
                variant="outline"
                onClick={() => setManualMode(false)}
                className="w-full"
              >
                Return to Auto Detection
              </Button>
            )}
          </div>
        )}

        {!isProcessing && !detectionResult && !manualMode && !openCVError && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Could not detect throwing circle automatically. The circle may
                not be clearly visible, or the video angle may not be suitable.
              </AlertDescription>
            </Alert>
            <Button onClick={() => setManualMode(true)} className="w-full">
              <Move className="h-4 w-4 mr-2" />
              Use Manual Calibration
            </Button>
          </div>
        )}

        {openCVError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load OpenCV: {openCVError}. Your device may not have
              enough memory for video analysis.
            </AlertDescription>
          </Alert>
        )}

        {isOpenCVLoading && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Loading computer vision libraries... This may take a moment.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleComplete}
          disabled={
            isProcessing ||
            isOpenCVLoading ||
            !!openCVError ||
            (manualMode && !manualCenter) ||
            (!manualMode && !detectionResult)
          }
        >
          {isOpenCVLoading ? 'Loading...' : 'Start Analysis'}
        </Button>
      </CardFooter>
    </Card>
  )
}
