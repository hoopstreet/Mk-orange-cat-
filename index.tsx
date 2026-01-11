
import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AppState, VideoAnalysisResult, HistoryItem, GroundingResult, RecreationScript } from './types';
import { analyzeShortsVideo, searchGroundingCheck, refineAttireDetails } from './geminiService';
import AnalysisDashboard from './components/AnalysisDashboard';
import VideoUploader from './components/VideoUploader';

const STORAGE_KEY = 'shorts_architect_history';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groundingInfo, setGroundingInfo] = useState<GroundingResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Load history on mount and check for API key selection
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const checkKey = async () => {
      try {
        // Accessing pre-configured aistudio interface
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } catch (e) {
        console.error("Failed to check for API key", e);
      }
    };
    checkKey();
  }, []);

  // Save history when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const handleSelectKey = async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true); // Proceed assuming selection as per guidelines to mitigate race condition
    } catch (e) {
      console.error("Failed to open key selection", e);
    }
  };

  const saveToHistory = useCallback((newResult: VideoAnalysisResult, fileName: string) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      title: fileName || newResult.summary.slice(0, 30) + '...',
      result: newResult
    };
    setHistory(prev => [newItem, ...prev].slice(0, 20)); // Keep last 20
  }, []);

  const handleVideoSelect = useCallback(async (file: File) => {
    setState(AppState.ANALYZING);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const analysis = await analyzeShortsVideo(base64, file.type);
          setResult(analysis);
          saveToHistory(analysis, file.name);
          
          setState(AppState.COMPLETED);
          
          // Optional: Grounding search based on summary
          try {
            const grounding = await searchGroundingCheck(analysis.summary);
            setGroundingInfo(grounding);
          } catch (gErr) {
            console.warn("Grounding failed, proceeding anyway", gErr);
          }
        } catch (apiErr: any) {
          setError(apiErr.message || "Gemini AI failed to analyze the video. Ensure the file is not corrupted.");
          setState(AppState.ERROR);
        }
      };
      reader.onerror = () => {
        setError("Failed to read video file.");
        setState(AppState.ERROR);
      };
    } catch (err: any) {
      setError(err.message || "An error occurred during analysis.");
      setState(AppState.ERROR);
    }
  }, [saveToHistory]);

  const loadHistoryItem = (item: HistoryItem) => {
    setResult(item.result);
    setGroundingInfo(null);
    setState(AppState.COMPLETED);
    setIsHistoryOpen(false);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const sortedHistory = [...history].sort((a, b) => {
    return sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
  });

  const reset = () => {
    setState(AppState.IDLE);
    setResult(null);
    setError(null);
    setGroundingInfo(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-zinc-100">
      {/* API Key Selection Overlay */}
      {hasKey === false && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
          <div className="max-w-md w-full text-center space-y-8 animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-red-600/20">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Select API Key</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">To use Veo video generation and Cinematic Analysis features, you must select a paid API key from a billing-enabled project.</p>
            </div>
            <div className="space-y-4 pt-4">
              <button 
                onClick={handleSelectKey}
                className="w-full bg-white text-black py-4 rounded-2xl font-black text-lg hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
              >
                Configure API Key
              </button>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                Required for Video Synthesis & Cinematic Analysis
              </p>
            </div>
            <div className="pt-4 border-t border-zinc-900">
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:text-red-500 underline decoration-zinc-800 underline-offset-4">
                View Billing Documentation
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Overlay */}
      {isHistoryOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity"
          onClick={() => setIsHistoryOpen(false)}
        />
      )}

      {/* History Sidebar */}
      <aside className={`fixed right-0 top-0 h-full w-80 bg-zinc-900 border-l border-zinc-800 z-[70] transform transition-transform duration-300 ease-in-out shadow-2xl ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">Analyses</h2>
            <button onClick={() => setIsHistoryOpen(false)} className="text-zinc-500 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{history.length} Saved</span>
            <button 
              onClick={toggleSortOrder}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-red-500 transition-colors bg-zinc-800/50 px-2 py-1 rounded"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
              {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
            </button>
          </div>
          
          <div className="flex-1