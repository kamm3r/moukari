import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { VideoMetadata, VideoWarning } from '@/hooks/use-video-metadata'
import { detectThrowingCircle } from '@/lib/circle-detector'
import { Loader2, AlertCircle, Check, ChevronLeft } from 'lucide-react'

interface CalibrationViewerProps {
  videoUrl: string
  metadata: VideoMetadata | null
  warnings: VideoWarning[]
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
  const [circleData, setCircleData] = useState<{
    center: { x: number; y: number }
    radius: number
  } | null>(null)
  const [scaleFactor, setScaleFactor] = useState<number>(0)

  // Auto-detect circle on load
  useEffect(() => {
    let isCancelled = false
    const abortController = new AbortController()

    const detect = async () => {
      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current

      try {
        // Wait for video to be ready with timeout
        if (video.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Video load timeout'))
            }, 10000)

            const handleLoad = () => {
              clearTimeout(timeout)
              resolve()
            }

            const handleError = () => {
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

        // Seek to middle frame for best circle visibility
        video.currentTime = video.duration / 2

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video seek timeout'))
          }, 5000)

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

        const detected = await detectThrowingCircle(video, canvasRef.current)

        if (isCancelled) return

        if (detected) {
          setCircleData(detected)
          // Calculate scale factor: 2.135m is the diameter of a standard hammer throw circle
          const pixelsPerMeter = (detected.radius * 2) / 2.135
          setScaleFactor(pixelsPerMeter)
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Circle detection error:', err)
        }
      } finally {
        if (!isCancelled) {
          setIsProcessing(false)
        }
      }
    }

    detect()

    return () => {
      isCancelled = true
      abortController.abort()
    }
  }, [videoUrl])

  // Draw circle overlay
  useEffect(() => {
    if (!canvasRef.current || !circleData || !videoRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw video frame
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

    // Draw detected circle
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(
      circleData.center.x,
      circleData.center.y,
      circleData.radius,
      0,
      2 * Math.PI,
    )
    ctx.stroke()

    // Draw center point
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(circleData.center.x, circleData.center.y, 5, 0, 2 * Math.PI)
    ctx.fill()
  }, [circleData])

  const handleAdjustRadius = useCallback(
    (value: number | readonly number[]) => {
      if (!circleData) return
      const radius = Array.isArray(value) ? value[0] : value
      setCircleData({ ...circleData, radius })
      setScaleFactor((radius * 2) / 2.135)
    },
    [circleData],
  )

  const handleComplete = useCallback(() => {
    if (!circleData || scaleFactor === 0) return

    onComplete({
      circleCenter: circleData.center,
      circleRadius: circleData.radius,
      scaleFactor,
    })
  }, [circleData, scaleFactor, onComplete])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calibration</CardTitle>
        <CardDescription>
          Verify the throwing circle detection. Adjust if needed for accurate
          measurements.
        </CardDescription>
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
            className="w-full rounded-lg border"
            width={Math.min(metadata?.width || 1280, 854)}
            height={Math.min(metadata?.height || 720, 480)}
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

        {!isProcessing && circleData && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span>Circle detected! Adjust radius if needed.</span>
            </div>

            <div className="space-y-2">
              <Label>Circle Radius Adjustment</Label>
              <Slider
                value={[circleData.radius]}
                onValueChange={handleAdjustRadius}
                min={circleData.radius * 0.5}
                max={circleData.radius * 1.5}
                step={1}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Smaller</span>
                <span>Current: {Math.round(circleData.radius)}px</span>
                <span>Larger</span>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-lg text-sm">
              <p>
                <strong>Calibration:</strong> {scaleFactor.toFixed(2)} pixels
                per meter
              </p>
              <p className="text-muted-foreground">
                Based on standard 2.135m diameter throwing circle
              </p>
            </div>
          </div>
        )}

        {!isProcessing && !circleData && !openCVError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Could not detect throwing circle automatically. Please ensure the
              circle is clearly visible in the video.
            </AlertDescription>
          </Alert>
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
            !circleData || isProcessing || isOpenCVLoading || !!openCVError
          }
        >
          {isOpenCVLoading ? 'Loading...' : 'Start Analysis'}
        </Button>
      </CardFooter>
    </Card>
  )
}
