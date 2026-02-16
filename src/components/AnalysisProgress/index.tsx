import { useAnalysisStore } from '../../store/analysisStore';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const stageMessages: Record<string, string> = {
  'idle': 'Ready to analyze',
  'extracting-frames': 'Extracting frames from video...',
  'detecting-circle': 'Detecting throwing circle...',
  'tracking-hammer': 'Tracking hammer motion...',
  'detecting-release': 'Detecting release point...',
  'calculating-physics': 'Calculating trajectory...',
  'complete': 'Analysis complete!',
  'error': 'Analysis failed',
};

export function AnalysisProgress() {
  const { isAnalyzing, progress, stage, error } = useAnalysisStore();

  if (!isAnalyzing && stage !== 'error' && stage !== 'complete') {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        {error ? (
          <div className="flex items-center space-x-3 text-red-600">
            <AlertCircle className="w-6 h-6" />
            <div>
              <p className="font-semibold">Analysis Failed</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : stage === 'complete' ? (
          <div className="flex items-center space-x-3 text-green-600">
            <CheckCircle2 className="w-6 h-6" />
            <p className="font-semibold">Analysis complete!</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="font-medium text-gray-700">
                  {stageMessages[stage] || 'Analyzing...'}
                </span>
              </div>
              <span className="text-sm font-semibold text-blue-600">
                {Math.round(progress.progress)}%
              </span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.progress}%` }}
              />
            </div>

            {progress.message && progress.message !== stageMessages[stage] && (
              <p className="mt-3 text-sm text-gray-500">{progress.message}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}