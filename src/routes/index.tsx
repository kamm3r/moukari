import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Ruler, Gauge, Clock, Video } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="container mx-auto max-w-4xl py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Hammer Throw Analyzer</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Fully automated hammer throw distance calculation from video. Just
          upload your video and get instant results.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Distance Measurement
            </CardTitle>
            <CardDescription>
              Automatically calculates throw distance from the throwing circle
              to landing point
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Release Velocity
            </CardTitle>
            <CardDescription>
              Measures release velocity using frame-by-frame motion tracking
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Flight Time
            </CardTitle>
            <CardDescription>
              Calculates total flight time from release to landing
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Easy Upload
            </CardTitle>
            <CardDescription>
              Simply drag and drop your video file - no manual calibration
              needed
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Three simple steps to analyze your throw
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </span>
              <div>
                <p className="font-medium">Upload Your Video</p>
                <p className="text-sm text-muted-foreground">
                  Drag and drop or select your hammer throw video (MP4, WebM)
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </span>
              <div>
                <p className="font-medium">Verify Circle Detection</p>
                <p className="text-sm text-muted-foreground">
                  The app automatically detects the throwing circle for
                  calibration
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </span>
              <div>
                <p className="font-medium">Get Results</p>
                <p className="text-sm text-muted-foreground">
                  View distance, release angle, velocity, and flight time with
                  trajectory visualization
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link to="/analyze">
          <Button size="lg" className="gap-2">
            Start Analysis
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
