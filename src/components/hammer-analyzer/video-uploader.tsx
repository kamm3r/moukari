import { useCallback, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Upload, AlertCircle } from 'lucide-react'

interface VideoUploaderProps {
  onUpload: (file: File) => void
  disabled?: boolean
}

export function VideoUploader({ onUpload, disabled }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('video/')) {
      return 'Please upload a video file (MP4, WebM, etc.)'
    }
    if (file.size > 100 * 1024 * 1024) {
      return 'File size must be less than 100MB'
    }
    return null
  }

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
      setError(null)
      onUpload(file)
    },
    [onUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      if (disabled) return

      const file = e.dataTransfer.files[0]
      if (file) {
        handleFile(file)
      }
    },
    [disabled, handleFile],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) {
        setIsDragging(true)
      }
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() =>
          !disabled && document.getElementById('video-input')?.click()
        }
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <p className="text-lg font-medium mb-2">
            Drag and drop your video here
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse files
          </p>
          <Button variant="outline" disabled={disabled}>
            Select Video
          </Button>
          <input
            id="video-input"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleInputChange}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium mb-1">Requirements for best accuracy:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>60 fps recommended (30 fps minimum)</li>
          <li>1080p resolution or higher</li>
          <li>Throwing circle clearly visible</li>
          <li>Video length: 5-15 seconds (entire throw sequence)</li>
          <li>Max file size: 100MB</li>
        </ul>
      </div>
    </div>
  )
}
