
import React, { useState, useCallback, useEffect } from 'react';
import { AppState, VideoAnalysisResult, HistoryItem, GroundingResult } from './types';
import { analyzeShortsVideo, searchGroundingCheck } from './geminiService';
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
      // Using type assertion (window as any) to access aistudio, which is globally pre-configured.
      // This avoids conflicting with existing environment declarations that cause "identical modifiers" errors.
      try {
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
    setGroundingInfo(null); // Grounding isn't usually stored to save space
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
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
            {history.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-zinc-500 text-sm">No history yet.</p>
              </div>
            ) : (
              sortedHistory.map(item => (
                <div 
                  key={item.id}
                  onClick={() => loadHistoryItem(item)}
                  className="group relative bg-zinc-800/50 border border-zinc-700/50 hover:border-red-500/50 p-4 rounded-xl cursor-pointer transition-all hover:translate-x-[-4px]"
                >
                  <div className="text-sm font-medium line-clamp-2 mb-1 pr-6">{item.title}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {new Date(item.timestamp).toLocaleDateString()} • {item.result.totalScenes} scenes
                  </div>
                  <button 
                    onClick={(e) => deleteHistoryItem(e, item.id)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-500 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 py-4 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center font-bold text-white italic">S</div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              ShortsArchitect <span className="text-red-500">AI</span>
            </h1>
          </div>
          <nav className="flex items-center gap-4">
            <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              History
            </button>
            <div className="h-4 w-px bg-zinc-800 mx-2" />
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Billing Docs</a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {state === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-5xl font-black mb-6 tracking-tight">Deconstruct Any Short. <br/><span className="text-zinc-500">Reconstruct It Perfectly.</span></h2>
            <p className="text-zinc-400 max-w-xl mb-12 text-lg leading-relaxed">
              Upload a YouTube Short to receive a full frame-by-frame breakdown, visual prompts for AI generation, and a precise storytelling script.
            </p>
            <VideoUploader onUpload={handleVideoSelect} disabled={state === AppState.ANALYZING} />
            
            {history.length > 0 && (
              <div className="mt-16 w-full max-w-4xl border-t border-zinc-900 pt-12">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-[0.2em]">Quick Access History</h3>
                  <button onClick={() => setIsHistoryOpen(true)} className="text-xs text-red-500 font-bold hover:underline">View All</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {history.slice(0, 3).map(item => (
                    <div 
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl hover:border-red-500/30 transition-all text-left cursor-pointer group"
                    >
                      <div className="text-sm font-bold mb-3 group-hover:text-red-500 transition-colors line-clamp-1">{item.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="bg-zinc-800 px-1.5 py-0.5 rounded uppercase font-mono">{item.result.totalScenes} scenes</span>
                        <span>•</span>
                        <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-red-600/10 border-t-red-600 rounded-full animate-spin shadow-[0_0_20px_rgba(220,38,38,0.2)]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-[#0a0a0a] rounded-full"></div>
              </div>
            </div>
            <h3 className="mt-8 text-2xl font-black tracking-tight animate-pulse">Analyzing Video DNA...</h3>
            <p className="text-zinc-500 mt-2 text-sm max-w-xs text-center">Gemini 3 Pro is currently mapping every scene, technical cue, and story beats for 1:1 recreation.</p>
          </div>
        )}

        {state === AppState.COMPLETED && result && (
          <AnalysisDashboard 
            result={result} 
            groundingInfo={groundingInfo}
            onReset={reset}
          />
        )}

        {state === AppState.ERROR && (
          <div className="max-w-md mx-auto bg-red-950/10 border border-red-900/30 p-10 rounded-3xl text-center">
            <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="text-2xl font-black mb-3 text-white">Analysis Interrupted</h3>
            <p className="text-zinc-400 mb-8 leading-relaxed">{error}</p>
            <button 
              onClick={reset}
              className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-black transition-all shadow-lg shadow-red-600/20 active:scale-95"
            >
              Try Again
            </button>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-zinc-900 flex flex-col items-center gap-4 bg-zinc-950/50">
        <div className="flex items-center gap-2 opacity-50">
          <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center font-bold text-white text-[10px] italic">S</div>
          <span className="text-xs font-bold tracking-widest uppercase">ShortsArchitect</span>
        </div>
        <p className="text-zinc-600 text-xs tracking-wide">Professional Grade Content Analysis &bull; Made with Gemini 3 Pro</p>
      </footer>
    </div>
  );
};

export default App;
