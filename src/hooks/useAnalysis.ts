import { useAnalysisStore, selectIsReadyToAnalyze } from '../store/analysisStore';
import { useCallback } from 'react';
import type { AnalysisResult, TrackedPosition, ImplementType } from '../types';
import { calculateThrowWithDrag, fitVelocityFromPositions } from '../lib/physics';
import { IMPLEMENTS } from '../types';

let cv: any = null;

async function loadOpenCV(): Promise<void> {
  if (cv) return;
  
  const module = await import('@techstark/opencv-js');
  cv = module.default || module;
  
  return new Promise((resolve) => {
    const checkReady = () => {
      if (cv.Mat) {
        resolve();
      } else {
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  });
}

async function extractFrames(video: HTMLVideoElement): Promise<{
  frames: ImageData[];
  fps: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to create canvas context'));
      return;
    }
    
    const frames: ImageData[] = [];
    const fps = 30;
    const duration = video.duration;
    
    const captureFrame = (currentTime: number) => {
      if (currentTime >= duration) {
        resolve({
          frames,
          fps,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        return;
      }
      
      video.currentTime = currentTime;
    };
    
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0);
      frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      
      const nextTime = video.currentTime + 1 / fps;
      if (nextTime < duration) {
        captureFrame(nextTime);
      } else {
        resolve({
          frames,
          fps,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    
    captureFrame(0);
  });
}

function detectCircle(frames: ImageData[]): { center: { x: number; y: number }; radius: number; confidence: number } | null {
  if (!cv || frames.length === 0) return null;
  
  const frameIndex = Math.floor(frames.length / 2);
  const frame = frames[frameIndex];
  
  const src = cv.matFromImageData(frame);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const circles = new cv.Mat();
  
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2);
    
    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      gray.rows / 8,
      100,
      50,
      Math.min(frame.width, frame.height) / 20,
      Math.min(frame.width, frame.height) / 4
    );
    
    let bestCircle: { x: number; y: number; radius: number } | null = null;
    let bestScore = 0;
    
    for (let i = 0; i < circles.cols; i++) {
      const x = circles.data32F[i * 3];
      const y = circles.data32F[i * 3 + 1];
      const radius = circles.data32F[i * 3 + 2];
      
      if (y > frame.height * 0.5) {
        const score = radius * (y / frame.height);
        if (score > bestScore) {
          bestScore = score;
          bestCircle = { x, y, radius };
        }
      }
    }
    
    if (bestCircle) {
      return {
        center: { x: bestCircle.x, y: bestCircle.y },
        radius: bestCircle.radius,
        confidence: Math.min(bestScore / 1000, 0.95),
      };
    }
    
    return null;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    circles.delete();
  }
}

function trackHammer(frames: ImageData[]): TrackedPosition[] {
  if (!cv || frames.length === 0) return [];
  
  const positions: TrackedPosition[] = [];
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const timestamp = i / 30;
    
    const pos = detectHammerInFrame(frame);
    
    if (pos) {
      positions.push({
        frameIndex: i,
        timestamp,
        x: pos.x,
        y: pos.y,
        confidence: pos.confidence,
      });
    }
  }
  
  return positions;
}

function detectHammerInFrame(frame: ImageData): { x: number; y: number; confidence: number } | null {
  const src = cv.matFromImageData(frame);
  const hsv = new cv.Mat();
  const mask = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const morphed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  
  try {
    cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);
    
    const lowerBound = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 150, 0]);
    const upperBound = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 80, 255, 255]);
    
    cv.inRange(hsv, lowerBound, upperBound, mask);
    cv.morphologyEx(mask, morphed, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_CLOSE, kernel);
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    lowerBound.delete();
    upperBound.delete();
    
    let bestContour: number | null = null;
    let bestScore = 0;
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      if (area > 10 && area < 500) {
        const perimeter = cv.arcLength(contour, true);
        const circularity = 4 * Math.PI * area / (perimeter * perimeter);
        
        const score = area * circularity;
        if (score > bestScore) {
          bestScore = score;
          bestContour = i;
        }
      }
    }
    
    if (bestContour !== null) {
      const moments = cv.moments(contours.get(bestContour));
      const x = moments.m10 / moments.m00;
      const y = moments.m01 / moments.m00;
      
      return {
        x,
        y,
        confidence: Math.min(bestScore / 1000, 0.95),
      };
    }
    
    return null;
  } finally {
    src.delete();
    hsv.delete();
    mask.delete();
    kernel.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function detectReleasePoint(positions: TrackedPosition[]): number {
  if (positions.length < 10) return Math.floor(positions.length / 2);
  
  const velocities: { index: number; speed: number }[] = [];
  
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    const dt = positions[i].timestamp - positions[i - 1].timestamp;
    
    if (dt > 0) {
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      velocities.push({ index: i, speed });
    }
  }
  
  let maxSpeed = 0;
  let maxIndex = 0;
  
  for (let i = 5; i < velocities.length - 5; i++) {
    let avgSpeed = 0;
    for (let j = i - 5; j <= i + 5; j++) {
      avgSpeed += velocities[j].speed;
    }
    avgSpeed /= 11;
    
    if (avgSpeed > maxSpeed) {
      maxSpeed = avgSpeed;
      maxIndex = velocities[i].index;
    }
  }
  
  return maxIndex;
}

function detectCameraAngle(positions: TrackedPosition[]): { type: 'side' | 'angled'; confidence: number } {
  if (positions.length < 10) {
    return { type: 'side', confidence: 0.5 };
  }
  
  let totalCurvature = 0;
  for (let i = 2; i < positions.length; i++) {
    const p1 = positions[i - 2];
    const p2 = positions[i - 1];
    const p3 = positions[i];
    
    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;
    
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    
    if (Math.abs(v1x) > 1 || Math.abs(v1y) > 1) {
      totalCurvature += Math.abs(Math.atan2(cross, dot));
    }
  }
  
  const avgCurvature = totalCurvature / (positions.length - 2);
  
  const isAngled = avgCurvature > 0.1;
  const confidence = isAngled
    ? Math.min(avgCurvature * 5, 0.95)
    : Math.min(0.95, 1 - avgCurvature * 5);
  
  return {
    type: isAngled ? 'angled' : 'side',
    confidence,
  };
}

function estimateImplementType(positions: TrackedPosition[]): ImplementType {
  if (positions.length < 5) return 'men';
  
  let totalSpeed = 0;
  let count = 0;
  
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    const dt = positions[i].timestamp - positions[i - 1].timestamp;
    
    if (dt > 0) {
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      totalSpeed += speed;
      count++;
    }
  }
  
  const avgSpeed = count > 0 ? totalSpeed / count : 0;
  
  return avgSpeed > 800 ? 'men' : 'women';
}

function calculatePixelsPerMeter(calibration: { center: { x: number; y: number }; radius: number } | null, frameWidth: number): number {
  if (calibration) {
    const diameterPixels = calibration.radius * 2;
    return diameterPixels / 2.135;
  }
  
  return frameWidth / 10;
}

export function useAnalysis() {
  const store = useAnalysisStore();
  const isReady = selectIsReadyToAnalyze(store);
  
  const runAnalysis = useCallback(async () => {
    if (!store.videoFile || store.isAnalyzing) return;
    
    store.startAnalysis();
    
    try {
      store.updateProgress({ stage: 'extracting-frames', progress: 5, message: 'Loading video...' });
      
      const video = document.createElement('video');
      video.src = store.videoUrl;
      video.muted = true;
      video.playsInline = true;
      
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      });
      
      store.updateProgress({ stage: 'extracting-frames', progress: 10, message: 'Extracting frames...' });
      
      const { frames, width } = await extractFrames(video);
      
      if (frames.length === 0) {
        throw new Error('No frames extracted from video');
      }
      
      store.updateProgress({ stage: 'detecting-circle', progress: 30, message: 'Loading OpenCV...' });
      
      await loadOpenCV();
      
      store.updateProgress({ stage: 'detecting-circle', progress: 40, message: 'Detecting throwing circle...' });
      
      const calibration = detectCircle(frames);
      
      store.updateProgress({ stage: 'tracking-hammer', progress: 50, message: 'Tracking hammer motion...' });
      
      const trackedPositions = trackHammer(frames);
      
      if (trackedPositions.length < 5) {
        throw new Error('Could not track hammer motion. Please try a clearer video.');
      }
      
      store.updateProgress({ stage: 'detecting-release', progress: 70, message: 'Detecting release point...' });
      
      const releaseFrame = detectReleasePoint(trackedPositions);
      const cameraAngle = detectCameraAngle(trackedPositions);
      const detectedImplement = estimateImplementType(trackedPositions);
      const pixelsPerMeter = calculatePixelsPerMeter(calibration, width);
      
      store.setRawData({
        trackedPositions,
        calibration,
        cameraAngle,
        detectedImplement,
        pixelsPerMeter,
        releaseFrame,
      });
      
      const implement = IMPLEMENTS[detectedImplement];
      
      const startIdx = Math.max(0, releaseFrame - 15);
      const endIdx = Math.min(trackedPositions.length, releaseFrame + 5);
      const releasePositions = trackedPositions.slice(startIdx, endIdx);
      
      const velocityData = releasePositions.map((p: TrackedPosition) => ({
        x: p.x,
        y: p.y,
        t: p.timestamp,
      }));
      
      const { vx, vy, confidence: velocityConfidence } = fitVelocityFromPositions(
        velocityData,
        pixelsPerMeter
      );
      
      const velocity = Math.sqrt(vx * vx + vy * vy);
      const angle = Math.atan2(vy, vx) * (180 / Math.PI);
      
      const releasePos = trackedPositions[releaseFrame];
      const releaseHeight = calibration
        ? (calibration.center.y - releasePos.y) / pixelsPerMeter
        : 1.2;
      
      store.updateProgress({ stage: 'calculating-physics', progress: 90, message: 'Calculating trajectory...' });
      
      const physicsResult = calculateThrowWithDrag({
        vx0: vx,
        vy0: vy,
        releaseHeight: Math.max(0.5, releaseHeight),
        massKg: implement.massKg,
        diameterMm: implement.diameterMm,
      });
      
      const trajectory = physicsResult.trajectory.map((p) => ({
        x: releasePos.x + p.x * pixelsPerMeter,
        y: releasePos.y - (p.y - releaseHeight) * pixelsPerMeter,
      }));
      
      const result: AnalysisResult = {
        distance: physicsResult.distance,
        flightTime: physicsResult.flightTime,
        releaseVelocity: velocity,
        releaseAngle: angle,
        releaseHeight,
        landingVelocity: physicsResult.landingVelocity,
        implement,
        cameraAngle,
        trajectory,
        confidence: velocityConfidence * (calibration?.confidence || 0.7),
      };
      
      store.updateProgress({ stage: 'complete', progress: 100, message: 'Analysis complete!' });
      store.setResult(result);
      
    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Failed to analyze video');
    }
  }, [store]);
  
  return {
    isReady,
    isAnalyzing: store.isAnalyzing,
    progress: store.progress,
    stage: store.stage,
    error: store.error,
    result: store.result,
    runAnalysis,
    reset: store.reset,
  };
}