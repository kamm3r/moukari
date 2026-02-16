import { useCallback, useState } from 'react';
import { Upload, FileVideo, X } from 'lucide-react';
import { useAnalysisStore } from '../../store/analysisStore';
import { cn } from '../../lib/utils';

export function UploadZone() {
  const { videoFile, setVideoFile, isAnalyzing } = useAnalysisStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
    }
  }, [setVideoFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
    }
  }, [setVideoFile]);

  const handleRemove = useCallback(() => {
    setVideoFile(null);
  }, [setVideoFile]);

  if (videoFile) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white border-2 border-dashed border-green-500 rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-green-100 p-3 rounded-xl">
              <FileVideo className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{videoFile.name}</p>
              <p className="text-sm text-gray-500">
                {(videoFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          {!isAnalyzing && (
            <button
              onClick={handleRemove}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200",
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"
        )}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className={cn(
            "p-4 rounded-full mb-4 transition-colors",
            isDragging ? "bg-blue-100" : "bg-white"
          )}>
            <Upload className={cn(
              "w-8 h-8",
              isDragging ? "text-blue-600" : "text-gray-400"
            )} />
          </div>
          <p className="mb-2 text-lg font-semibold text-gray-700">
            {isDragging ? 'Drop video here' : 'Upload hammer throw video'}
          </p>
          <p className="text-sm text-gray-500">
            Click to browse or drag and drop
          </p>
          <p className="text-xs text-gray-400 mt-2">
            MP4, MOV, WebM up to 100MB
          </p>
        </div>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </label>
    </div>
  );
}