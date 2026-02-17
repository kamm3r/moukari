import { useState, useEffect } from 'react'

export interface VideoMetadata {
  duration: number
  fps: number
  width: number
  height: number
  frameCount: number
}

export interface VideoWarning {
  type: 'fps' | 'resolution' | 'duration'
  message: string
  severity: 'warning' | 'error'
}

export function useVideoMetadata(file: File | null) {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [warnings, setWarnings] = useState<VideoWarning[]>([])

  useEffect(() => {
    if (!file) {
      setMetadata(null)
      setWarnings([])
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      // Estimate FPS (most videos are 30 or 60fps)
      const estimatedFps = 30
      const frameCount = Math.round(video.duration * estimatedFps)

      const meta: VideoMetadata = {
        duration: video.duration,
        fps: estimatedFps,
        width: video.videoWidth,
        height: video.videoHeight,
        frameCount,
      }

      setMetadata(meta)

      // Generate warnings
      const newWarnings: VideoWarning[] = []

      if (estimatedFps < 30) {
        newWarnings.push({
          type: 'fps',
          message: `Low frame rate detected (${estimatedFps} fps). Accuracy may be reduced. Recommended: 60 fps.`,
          severity: 'warning',
        })
      }

      if (video.videoWidth < 1920) {
        newWarnings.push({
          type: 'resolution',
          message: `Low resolution detected (${video.videoWidth}x${video.videoHeight}). Accuracy may be reduced. Recommended: 1080p or higher.`,
          severity: 'warning',
        })
      }

      if (video.duration > 20) {
        newWarnings.push({
          type: 'duration',
          message: `Video is quite long (${video.duration.toFixed(1)}s). Processing may take longer.`,
          severity: 'warning',
        })
      }

      setWarnings(newWarnings)
    }

    video.onerror = () => {
      setWarnings([
        {
          type: 'duration',
          message: 'Failed to load video metadata',
          severity: 'error',
        },
      ])
    }

    video.src = URL.createObjectURL(file)

    return () => {
      URL.revokeObjectURL(video.src)
    }
  }, [file])

  return { metadata, warnings }
}
