
import React, { useRef } from 'react';

interface Props {
  onUpload: (file: File) => void;
  disabled: boolean;
}

const VideoUploader: React.FC<Props> = ({ onUpload, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <div 
        className={`group relative border-2 border-dashed border-zinc-800 hover:border-red-600/50 rounded-2xl p-12 transition-all cursor-pointer bg-zinc-900/30 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="video/*" 
          className="hidden" 
          disabled={disabled}
        />
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <span className="text-zinc-300 font-medium text-lg">Select Video Clip</span>
          <p className="text-zinc-500 text-sm mt-2">MP4, MOV up to 50MB</p>
        </div>
      </div>
      
      <div className="mt-8 flex items-center gap-4 text-zinc-500 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          Gemini 3 Pro Ready
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
          Auto-Scene Detection
        </div>
      </div>
    </div>
  );
};

export default VideoUploader;
