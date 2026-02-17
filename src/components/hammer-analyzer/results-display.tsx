import { useRef, useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { HammerThrowResult } from '@/lib/video-processor'
import {
  RotateCcw,
  Download,
  Ruler,
  Gauge,
  Clock,
  TrendingUp,
} from 'lucide-react'

interface ResultsDisplayProps {
  results: HammerThrowResult
  hammerWeight: 'men' | 'women'
  onReset: () => void
}

export function ResultsDisplay({
  results,
  hammerWeight,
  onReset,
}: ResultsDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [trajectoryImage, setTrajectoryImage] = useState<string | null>(null)

  // Generate trajectory visualization
  useEffect(() => {
    if (!canvasRef.current || results.trajectory.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw trajectory path
    if (results.trajectory.length > 1) {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 3
      ctx.beginPath()

      results.trajectory.forEach(
        (point: { x: number; y: number }, index: number) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y)
          } else {
            ctx.lineTo(point.x, point.y)
          }
        },
      )

      ctx.stroke()
    }

    // Draw release point
    if (results.releasePoint) {
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(results.releasePoint.x, results.releasePoint.y, 8, 0, 2 * Math.PI)
      ctx.fill()
    }

    // Draw landing point
    if (results.landingPoint) {
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(results.landingPoint.x, results.landingPoint.y, 8, 0, 2 * Math.PI)
      ctx.fill()
    }

    // Export as image
    setTrajectoryImage(canvas.toDataURL('image/png'))
  }, [results])

  const weightText =
    hammerWeight === 'men' ? "Men's (7.26 kg)" : "Women's (4 kg)"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl">Analysis Complete</CardTitle>
              <CardDescription>
                Hammer throw results for {weightText}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {results.distance.toFixed(2)} m
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="physics">Physics</TabsTrigger>
              <TabsTrigger value="visualization">Visualization</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Ruler className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Distance
                        </p>
                        <p className="text-2xl font-bold">
                          {results.distance.toFixed(2)} m
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Flight Time
                        </p>
                        <p className="text-2xl font-bold">
                          {results.flightTime.toFixed(2)} s
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Release Angle
                        </p>
                        <p className="text-2xl font-bold">
                          {results.releaseAngle.toFixed(1)}°
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Gauge className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Release Velocity
                        </p>
                        <p className="text-2xl font-bold">
                          {results.releaseVelocity.toFixed(1)} m/s
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">
                  Analysis Summary
                </p>
                <ul className="space-y-1">
                  <li>
                    • Release frame detected at {results.releaseFrame} of{' '}
                    {results.totalFrames} frames
                  </li>
                  <li>• Landing point calculated from trajectory analysis</li>
                  <li>
                    • Velocity calculated using frame-by-frame motion tracking
                  </li>
                  <li>
                    • Distance measured from circle center to landing point
                  </li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="physics" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Release Height
                    </p>
                    <p className="text-xl font-semibold">
                      {results.releasePoint
                        ? (
                            results.releasePoint.y * results.scaleFactor
                          ).toFixed(2)
                        : 'N/A'}{' '}
                      m
                    </p>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Horizontal Distance
                    </p>
                    <p className="text-xl font-semibold">
                      {results.landingPoint && results.releasePoint
                        ? Math.abs(
                            (results.landingPoint.x - results.releasePoint.x) *
                              results.scaleFactor,
                          ).toFixed(2)
                        : 'N/A'}{' '}
                      m
                    </p>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-medium mb-2">Trajectory Details</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        Total frames analyzed:
                      </span>
                      <span className="ml-2 font-medium">
                        {results.totalFrames}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Tracking points:
                      </span>
                      <span className="ml-2 font-medium">
                        {results.trajectory.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Processing scale:
                      </span>
                      <span className="ml-2 font-medium">
                        {results.scaleFactor.toFixed(2)} px/m
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Video FPS:</span>
                      <span className="ml-2 font-medium">
                        {results.fps} fps
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="visualization" className="space-y-4 mt-4">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={1280}
                  height={720}
                  className="w-full rounded-lg border bg-black/5"
                />
                <div className="absolute top-4 left-4 flex gap-2">
                  <Badge variant="default" className="bg-green-500">
                    Release Point
                  </Badge>
                  <Badge variant="default" className="bg-red-500">
                    Landing Point
                  </Badge>
                  <Badge variant="secondary">Trajectory</Badge>
                </div>
              </div>

              {trajectoryImage && (
                <a
                  href={trajectoryImage}
                  download="hammer-throw-trajectory.png"
                >
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Trajectory Image
                  </Button>
                </a>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Analyze Another Video
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
