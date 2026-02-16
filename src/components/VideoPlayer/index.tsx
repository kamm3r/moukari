import { useRef, useEffect, useState } from 'react';
import { useAnalysisStore } from '../../store/analysisStore';
import { Play, Pause, RotateCcw } from 'lucide-react';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { 
    videoUrl, 
    result, 
    trackedPositions,
    calibration,
    isAnalyzing,
  } = useAnalysisStore();

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    
    videoRef.current.src = videoUrl;
    videoRef.current.load();
  }, [videoUrl]);

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const drawOverlay = () => {
      if (!video.videoWidth) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw tracked positions
      if (trackedPositions.length > 0) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        trackedPositions.forEach((pos, i) => {
          if (i === 0) {
            ctx.moveTo(pos.x, pos.y);
          } else {
            ctx.lineTo(pos.x, pos.y);
          }
        });
        
        ctx.stroke();
        
        // Draw points
        trackedPositions.forEach((pos, i) => {
          ctx.fillStyle = i === trackedPositions.length - 1 ? '#EF4444' : '#3B82F6';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      
      // Draw trajectory
      if (result?.trajectory) {
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        
        result.trajectory.forEach((point, i) => {
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw calibration circle
      if (calibration) {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(calibration.center.x, calibration.center.y, calibration.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      requestAnimationFrame(drawOverlay);
    };
    
    drawOverlay();
  }, [trackedPositions, result, calibration]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.pause();
    setIsPlaying(false);
  };

  if (!videoUrl) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-6">
      <div className="bg-black rounded-2xl overflow-hidden shadow-2xl">
        <div className="relative aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        </div>
        
        <div className="bg-gray-900 p-4 flex items-center justify-center space-x-4">
          <button
            onClick={togglePlay}
            disabled={isAnalyzing}
            className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-full transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white" />
            )}
          </button>
          
          <button
            onClick={handleReset}
            disabled={isAnalyzing}
            className="p-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 rounded-full transition-colors"
          >
            <RotateCcw className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}