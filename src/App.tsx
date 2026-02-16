import { UploadZone } from './components/UploadZone';
import { AnalysisProgress } from './components/AnalysisProgress';
import { VideoPlayer } from './components/VideoPlayer';
import { ResultsDisplay } from './components/ResultsDisplay';
import { useAnalysis } from './hooks/useAnalysis';
import { useAnalysisStore } from './store/analysisStore';
import { Hammer } from 'lucide-react';

function App() {
  const { isReady, isAnalyzing, runAnalysis, result } = useAnalysis();
  const { videoFile } = useAnalysisStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Hammer className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Hammer Throw Analyzer</h1>
              <p className="text-sm text-gray-500">Automatic distance calculation from video</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!result && (
          <>
            {/* Upload Section */}
            <section className="mb-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-3">
                  Analyze Your Hammer Throw
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Upload a video of your throw and get automatic distance calculation with 
                  detailed metrics. No manual calibration needed.
                </p>
              </div>

              <UploadZone />
            </section>

            {/* Progress */}
            <AnalysisProgress />

            {/* Analyze Button */}
            {videoFile && !isAnalyzing && !result && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={runAnalysis}
                  disabled={!isReady}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:cursor-not-allowed"
                >
                  Start Analysis
                </button>
              </div>
            )}
          </>
        )}

        {/* Video Player */}
        <VideoPlayer />

        {/* Results */}
        <ResultsDisplay />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
            <p>Hammer Throw Analyzer - Automatic CV-based analysis</p>
            <div className="flex items-center space-x-4 mt-4 md:mt-0">
              <span>Built with React + OpenCV</span>
              <span>•</span>
              <span>Offline capable</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;