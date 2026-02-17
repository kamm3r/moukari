import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VideoUploader } from '@/components/hammer-analyzer/video-uploader'
import { CalibrationViewer } from '@/components/hammer-analyzer/calibration-viewer'
import { ProcessingStatus } from '@/components/hammer-analyzer/processing-status'
import { ResultsDisplay } from '@/components/hammer-analyzer/results-display'
import { useVideoMetadata } from '@/hooks/use-video-metadata'
import { loadOpenCV, isOpenCVLoaded } from '@/hooks/use-opencv'
import { processVideo, type HammerThrowResult } from '@/lib/video-processor'
import { AlertCircle } from 'lucide-react'

export const Route = createFileRoute('/analyze')({
  component: AnalyzePage,
})

function AnalyzePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [step, setStep] = useState<
    'upload' | 'calibration' | 'processing' | 'results'
  >('upload')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<HammerThrowResult | null>(null)
  const [hammerWeight, setHammerWeight] = useState<'men' | 'women'>('men')
  const [error, setError] = useState<string | null>(null)
  const [isLoadingOpenCV, setIsLoadingOpenCV] = useState(false)
  const [openCVLoadError, setOpenCVLoadError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const { metadata, warnings } = useVideoMetadata(videoFile)

  // Load OpenCV on demand when video is uploaded
  useEffect(() => {
    if (
      videoFile &&
      !isOpenCVLoaded() &&
      !isLoadingOpenCV &&
      !openCVLoadError
    ) {
      setIsLoadingOpenCV(true)
      loadOpenCV()
        .then(() => {
          setIsLoadingOpenCV(false)
        })
        .catch((err: unknown) => {
          setIsLoadingOpenCV(false)
          setOpenCVLoadError(
            err instanceof Error ? err.message : 'Failed to load OpenCV',
          )
        })
    }
  }, [videoFile, isLoadingOpenCV, openCVLoadError])

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setStep('calibration')
    setError(null)
  }, [])

  const handleCalibrationComplete = useCallback(
    async (calibrationData: {
      circleCenter: { x: number; y: number }
      circleRadius: number
      scaleFactor: number
    }) => {
      if (!videoFile || !videoUrl) return

      setStep('processing')
      setProgress(0)

      try {
        const result = await processVideo({
          videoUrl,
          calibrationData,
          hammerWeight,
          onProgress: setProgress,
        })

        setResults(result)
        setStep('results')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Processing failed')
        setStep('calibration')
      }
    },
    [videoFile, videoUrl, hammerWeight],
  )

  const handleReset = useCallback(() => {
    setVideoFile(null)
    setVideoUrl(null)
    setStep('upload')
    setProgress(0)
    setResults(null)
    setError(null)
  }, [])

  if (openCVLoadError) {
    return (
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load OpenCV: {openCVLoadError}. Please refresh the page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Hammer Throw Analyzer</h1>
        <p className="text-muted-foreground">
          Upload a video to automatically calculate throw distance, release
          angle, and velocity.
        </p>
      </div>

      {!isOpenCVLoaded && step === 'upload' && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Loading computer vision libraries...
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Hammer Type</CardTitle>
          <CardDescription>
            Select the hammer weight for accurate calculations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={hammerWeight}
            onValueChange={(value) => setHammerWeight(value as 'men' | 'women')}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="men" id="men" />
              <Label htmlFor="men">Men's (7.26 kg)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="women" id="women" />
              <Label htmlFor="women">Women's (4 kg)</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {step === 'upload' && (
        <VideoUploader onUpload={handleVideoUpload} disabled={false} />
      )}

      {step === 'calibration' && videoUrl && (
        <CalibrationViewer
          videoUrl={videoUrl}
          metadata={metadata}
          warnings={warnings}
          onComplete={handleCalibrationComplete}
          onBack={handleReset}
          isOpenCVLoading={isLoadingOpenCV}
          openCVError={openCVLoadError}
        />
      )}

      {step === 'processing' && <ProcessingStatus progress={progress} />}

      {step === 'results' && results && (
        <ResultsDisplay
          results={results}
          hammerWeight={hammerWeight}
          onReset={handleReset}
        />
      )}

      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          crossOrigin="anonymous"
        />
      )}
    </div>
  )
}
