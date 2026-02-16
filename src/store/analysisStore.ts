import { create } from 'zustand';
import type { 
  AnalysisStage, 
  AnalysisResult, 
  AnalysisProgress,
  TrackedPosition,
  CircleCalibration,
  CameraAngle,
  ImplementType,
  ImplementSpec
} from '../types';
import { IMPLEMENTS } from '../types';

interface AnalysisState {
  // Video
  videoFile: File | null;
  videoUrl: string;
  
  // Analysis state
  stage: AnalysisStage;
  progress: AnalysisProgress;
  isAnalyzing: boolean;
  error: string | null;
  
  // Raw data
  trackedPositions: TrackedPosition[];
  calibration: CircleCalibration | null;
  cameraAngle: CameraAngle | null;
  detectedImplement: ImplementType | null;
  pixelsPerMeter: number;
  releaseFrame: number;
  
  // Results
  result: AnalysisResult | null;
  
  // Actions
  setVideoFile: (file: File | null) => void;
  startAnalysis: () => void;
  updateProgress: (progress: AnalysisProgress) => void;
  setRawData: (data: {
    trackedPositions: TrackedPosition[];
    calibration: CircleCalibration | null;
    cameraAngle: CameraAngle;
    detectedImplement: ImplementType;
    pixelsPerMeter: number;
    releaseFrame: number;
  }) => void;
  setResult: (result: AnalysisResult) => void;
  setError: (error: string) => void;
  reset: () => void;
}

const initialState = {
  videoFile: null,
  videoUrl: '',
  stage: 'idle' as AnalysisStage,
  progress: { stage: 'idle' as AnalysisStage, progress: 0, message: '' },
  isAnalyzing: false,
  error: null,
  trackedPositions: [],
  calibration: null,
  cameraAngle: null,
  detectedImplement: null,
  pixelsPerMeter: 0,
  releaseFrame: 0,
  result: null,
};

export const useAnalysisStore = create<AnalysisState>((set) => ({
  ...initialState,
  
  setVideoFile: (file) => {
    if (file) {
      const url = URL.createObjectURL(file);
      set({ videoFile: file, videoUrl: url });
    } else {
      set((state) => {
        if (state.videoUrl) {
          URL.revokeObjectURL(state.videoUrl);
        }
        return { videoFile: null, videoUrl: '' };
      });
    }
  },
  
  startAnalysis: () => set({ 
    stage: 'extracting-frames', 
    isAnalyzing: true, 
    error: null,
    result: null,
  }),
  
  updateProgress: (progress) => set({ 
    progress,
    stage: progress.stage as AnalysisStage,
  }),
  
  setRawData: (data) => set({
    trackedPositions: data.trackedPositions,
    calibration: data.calibration,
    cameraAngle: data.cameraAngle,
    detectedImplement: data.detectedImplement,
    pixelsPerMeter: data.pixelsPerMeter,
    releaseFrame: data.releaseFrame,
  }),
  
  setResult: (result) => set({ 
    result, 
    isAnalyzing: false,
    stage: 'complete',
  }),
  
  setError: (error) => set({ 
    error, 
    isAnalyzing: false,
    stage: 'error',
  }),
  
  reset: () => {
    set((state) => {
      if (state.videoUrl) {
        URL.revokeObjectURL(state.videoUrl);
      }
      return initialState;
    });
  },
}));

// Selectors
export const selectIsReadyToAnalyze = (state: AnalysisState) => 
  state.videoFile !== null && !state.isAnalyzing;

export const selectImplementSpec = (state: AnalysisState): ImplementSpec | null =>
  state.detectedImplement ? IMPLEMENTS[state.detectedImplement] : null;

export const selectConfidence = (state: AnalysisState): number => {
  if (!state.result) return 0;
  return state.result.confidence;
};