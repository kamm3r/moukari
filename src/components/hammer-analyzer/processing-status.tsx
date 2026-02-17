import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

interface ProcessingStatusProps {
  progress: number
}

export function ProcessingStatus({ progress }: ProcessingStatusProps) {
  const getStage = (progress: number): string => {
    if (progress < 10) return 'Initializing...'
    if (progress < 30) return 'Extracting frames...'
    if (progress < 50) return 'Detecting release point...'
    if (progress < 70) return 'Tracking hammer trajectory...'
    if (progress < 90) return 'Detecting landing point...'
    if (progress < 100) return 'Calculating physics metrics...'
    return 'Finalizing results...'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Processing Video
        </CardTitle>
        <CardDescription>
          Analyzing the hammer throw. This may take a minute depending on video
          length.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{getStage(progress)}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </CardContent>
    </Card>
  )
}
