
import { VideoAnalysisResult, RecreationScript, GroundingResult, TimelineItem } from '../types';
import SceneCard from './SceneCard';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { generateTTS, refineAttireDetails } from '../geminiService';

interface Props {
  result: VideoAnalysisResult;
  groundingInfo: GroundingResult | null;
  onReset: () => void;
}

type Workstation = 'image' | 'video' | 'editor' | 'grounding';

const AnalysisDashboard: React.FC<Props> = ({ result, groundingInfo, onReset }) => {
  const [activeTab, setActiveTab] = useState<Workstation>('editor');
  const [compilationMedia, setCompilationMedia] = useState<Record<number, { image?: string; video?: string; audio?: string }>>({});
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isCompiling, setIsCompiling] = useState<'image' | 'video' | 'animate-all' | 'audio' | 'attire' | null>(null);
  const [forceBatch, setForceBatch] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [isCopiedAll, setIsCopiedAll] = useState(false);
  const [voiceName, setVoiceName] = useState('Alexander');
  const [isCloningEnabled, setIsCloningEnabled] = useState(false);
  const [clonedSampleUrl, setClonedSampleUrl] = useState<string | null>(null);
  const [cloningStatus, setCloningStatus] = useState<'idle' | 'extracting' | 'ready'>('idle');
  const [voiceSettings, setVoiceSettings] = useState({ stability: 0.5, clarity: 0.75 });
  const [globalMusicUrl, setGlobalMusicUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const [localScripts, setLocalScripts] = useState<RecreationScript[]>(result.recreationScript);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceUploadRef = useRef<HTMLInputElement>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMediaGenerated = (sceneNumber: number, type: 'image' | 'video' | 'audio', url: string) => {
    setCompilationMedia(prev => ({
      ...prev,
      [sceneNumber]: { ...prev[sceneNumber], [type]: url }
    }));
  };

  const addToTimeline = (item: Omit<TimelineItem, 'id'>) => {
    const newItem: TimelineItem = { ...item, id: crypto.randomUUID(), startOffset: 0 };
    setTimeline(prev => [...prev, newItem]);
  };

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'visual' | 'music' | 'voice') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (fileType === 'visual') {
      const type = file.type.startsWith('video') ? 'video' : 'image';
      addToTimeline({
        sceneNumber: timeline.length + 1,
        type: type,
        url: url,
        duration: 5,
        narration: "Local Upload: " + file.name,
        isLocal: true
      });
    } else if (fileType === 'music') {
      setGlobalMusicUrl(url);
    } else if (fileType === 'voice') {
      setClonedSampleUrl(url);
      setCloningStatus('extracting');
      setTimeout(() => setCloningStatus('ready'), 2500);
    }
  };

  const handleBatchRefineAttire = async () => {
    if (isCompiling) return;
    setIsCompiling('attire');
    try {
      const updatedScripts = [...localScripts];
      for (let i = 0; i < updatedScripts.length; i++) {
        const refined = await refineAttireDetails(
          updatedScripts[i].visualPrompt, 
          result.masterStyleAnchor, 
          result.masterCharacterAnchors
        );
        updatedScripts[i] = { ...updatedScripts[i], visualPrompt: refined };
        setLocalScripts([...updatedScripts]); // Update incrementally for UI feedback
      }
    } catch (err) {
      console.error("Batch attire refinement failed", err);
    } finally {
      setIsCompiling(null);
    }
  };

  const handleGenerateFullVoiceover = async () => {
    if (isCompiling) return;
    setIsCompiling('audio');
    
    try {
      const sortedScenes = [...localScripts].sort((a, b) => a.sceneNumber - b.sceneNumber);
      for (const scene of sortedScenes) {
        if (scene.narration && !compilationMedia[scene.sceneNumber]?.audio) {
          const url = await generateTTS(scene.narration, voiceName, true);
          handleMediaGenerated(scene.sceneNumber, 'audio', url);
          setTimeline(prev => prev.map(item => 
            item.sceneNumber === scene.sceneNumber ? { ...item, audioUrl: url } : item
          ));
        }
      }
    } catch (err) {
      console.error("Voiceover generation failed", err);
    } finally {
      setIsCompiling(null);
    }
  };

  const handleCopyAllPrompts = async () => {
    if (isCopiedAll) return;
    const allPrompts = localScripts
      .map(s => `SCENE ${s.sceneNumber} (${s.duration}s):\n${s.visualPrompt}`)
      .join('\n\n---\n\n');
    await navigator.clipboard.writeText(allPrompts);
    setIsCopiedAll(true);
    setTimeout(() => setIsCopiedAll(false), 2000);
  };

  const handleStartCompilation = (type: 'image' | 'video' | 'animate-all' | 'audio', force: boolean = false) => {
    setForceBatch(force);
    setIsCompiling(type);
  };

  const handleExport = () => {
    if (isExporting || timeline.length === 0) return;
    setIsExporting(true);
    setTimeout(() => {
      alert("Video compilation process would start here, assembling " + timeline.length + " assets.");
      setIsExporting(false);
    }, 2000);
  };

  const stopCompilation = () => {
    setIsCompiling(null);
    setForceBatch(false);
  };

  const totalTimelineDuration = useMemo(() => timeline.reduce((sum, item) => sum + item.duration, 0), [timeline]);

  const progressPercent = useMemo(() => {
    const total = result.totalScenes;
    if (isCompiling === 'attire') {
      // For attire, we check how many match the original vs how many have been processed
      // But it's easier to just track a counter or index. Here we estimate by checking script differences.
      // This is a rough proxy. 
      return 0; // Handled differently if needed, but we rely on loop finishing
    }
    const count = Object.values(compilationMedia).filter((m: any) => {
      if (isCompiling === 'image') return !!m.image;
      if (isCompiling === 'video' || isCompiling === 'animate-all') return !!m.video;
      if (isCompiling === 'audio') return !!m.audio;
      return false;
    }).length;
    return Math.round((count / total) * 100);
  }, [compilationMedia, result.totalScenes, isCompiling]);

  useEffect(() => {
    if (progressPercent === 100 && isCompiling && isCompiling !== 'attire') {
      stopCompilation();
    }
  }, [progressPercent, isCompiling]);

  useEffect(() => {
    let interval: any;
    if (isPlayingSequence && timeline.length > 0) {
      const currentItem = timeline[currentPlayIndex];
      
      if (globalMusicUrl && bgMusicRef.current && currentPlayIndex === 0) {
        bgMusicRef.current.play().catch(console.warn);
      }

      if (currentItem.audioUrl && audioRef.current) {
        audioRef.current.src = currentItem.audioUrl;
        audioRef.current.play().catch(e => console.warn("Audio play blocked", e));
      }

      if (currentItem.type === 'video' && videoRef.current) {
        videoRef.current.currentTime = currentItem.startOffset || 0;
        videoRef.current.play().catch(console.warn);
      }

      interval = setTimeout(() => {
        if (currentPlayIndex === timeline.length - 1) {
          setIsPlayingSequence(false);
          setCurrentPlayIndex(0);
          if (bgMusicRef.current) bgMusicRef.current.pause();
        } else {
          setCurrentPlayIndex((prev) => (prev + 1) % timeline.length);
        }
      }, (currentItem?.duration || 3) * 1000);
    } else {
      if (audioRef.current) audioRef.current.pause();
      if (bgMusicRef.current) bgMusicRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
    }
    return () => clearTimeout(interval);
  }, [isPlayingSequence, currentPlayIndex, timeline]);

  return (
    <div className="animate-in fade-in duration-700">
      <audio ref={audioRef} hidden />
      <audio ref={bgMusicRef} src={globalMusicUrl || ""} loop hidden />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white uppercase italic">
              Production <span className="text-red-600">Station</span>
            </h2>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-zinc-500 text-[10px] font-black tracking-widest uppercase">
                {activeTab} Workstation &bull; {timeline.length} clips in timeline
              </p>
            </div>
          </div>
          <div className="h-10 w-px bg-zinc-800 mx-2 hidden md:block" />
          <div className="flex gap-6">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Total Scenes</span>
              <span className="text-lg font-black text-white">{result.totalScenes}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Est. Length</span>
              <span className="text-lg font-black text-red-600">{formatDuration(result.totalLength)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800">
          {(['image', 'video', 'editor', 'grounding'] as Workstation[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-black shadow-xl' : 'text-zinc-500 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {(activeTab === 'image' || activeTab === 'video') && (
          <div className="space-y-6">
            <div className="bg-[#0f0f0f] border border-zinc-800 rounded-3xl p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${activeTab === 'image' ? 'bg-blue-600 shadow-blue-600/20' : 'bg-red-600 shadow-red-600/20'}`}>
                   {activeTab === 'image' ? (
                     <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                   ) : (
                     <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                   )}
                </div>
                <div className="min-w-[200px]">
                  <h4 className="text-white font-black text-sm uppercase tracking-[0.2em]">{isCompiling ? `Processing Production...` : `${activeTab} Control Center`}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                       <div className="h-full bg-red-600 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                    <p className="text-zinc-500 text-[9px] uppercase font-bold tracking-wider">{activeTab === 'image' ? 'Batch Storyboard Rendering' : 'Cinematic Motion Synthesis'}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={handleBatchRefineAttire}
                  disabled={!!isCompiling}
                  className="px-6 py-3 bg-amber-600/10 border border-amber-500/30 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600/20 transition-all disabled:opacity-50"
                >
                  {isCompiling === 'attire' ? 'Refining Master Attire...' : 'Enforce Master Attire (All Scenes)'}
                </button>
                <button 
                  onClick={handleCopyAllPrompts}
                  disabled={isCopiedAll}
                  className={`px-6 py-3 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isCopiedAll ? 'bg-green-600 border-green-500 text-white' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}
                >
                  {isCopiedAll ? 'COPIED TO CLIPBOARD' : 'COPY ALL PROMPTS'}
                </button>
                <button 
                  onClick={() => handleStartCompilation(activeTab as any)}
                  disabled={!!isCompiling}
                  className={`px-6 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'image' ? 'bg-blue-600 shadow-blue-600/20' : 'bg-red-600 shadow-red-600/20'} ${isCompiling ? 'opacity-50' : ''}`}
                >
                  {isCompiling === activeTab ? (
                    <span className="flex items-center gap-2"><div className="w-2 h-2 border-2 border-t-transparent border-white rounded-full animate-spin"></div>WORKING...</span>
                  ) : `BATCH ${activeTab.toUpperCase()}`}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {localScripts.map((script) => (
                <SceneCard 
                  key={`${script.sceneNumber}-${script.visualPrompt.length}`} // Ensure refresh if prompt text length changes
                  type="recreation" 
                  data={script} 
                  layoutMode={activeTab as 'image' | 'video'}
                  masterStyle={result.masterStyleAnchor}
                  masterCharacter={result.masterCharacterAnchors}
                  onMediaGenerated={handleMediaGenerated}
                  onAddToTimeline={addToTimeline}
                  autoTrigger={isCompiling}
                  forceBatch={forceBatch}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-6">
              <div className="aspect-[9/16] bg-black rounded-[2.5rem] border border-zinc-800 overflow-hidden relative shadow-2xl">
                {timeline.length > 0 ? (
                  <div className="w-full h-full">
                     {timeline[currentPlayIndex].url.startsWith('data:image') || (!timeline[currentPlayIndex].url.includes('.mp4') && !timeline[currentPlayIndex].url.startsWith('blob:')) ? (
                       <img src={timeline[currentPlayIndex].url} className="w-full h-full object-cover animate-in fade-in zoom-in duration-1000" />
                     ) : (
                       <video ref={videoRef} key={timeline[currentPlayIndex].url} src={timeline[currentPlayIndex].url} className="w-full h-full object-cover" autoPlay={isPlayingSequence} muted loop />
                     )}
                     <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-black via-black/80 to-transparent">
                        <div className="flex items-center justify-between">
                          <span className="text-red-500 text-[10px] font-black uppercase tracking-[0.4em]">CLIP {currentPlayIndex + 1} / {timeline.length}</span>
                        </div>
                        <p className="text-white text-xl font-serif italic mt-3 leading-relaxed line-clamp-2">{timeline[currentPlayIndex].narration || "..."}</p>
                     </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-zinc-950">
                    <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6 border border-zinc-800">
                      <svg className="w-10 h-10 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                    </div>
                    <p className="text-zinc-700 text-[10px] font-black uppercase tracking-widest">Timeline Empty</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => setIsPlayingSequence(!isPlayingSequence)}
                  disabled={timeline.length === 0}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl ${timeline.length === 0 ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-black hover:scale-105'}`}
                >
                  {isPlayingSequence ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#0f0f0f] border border-zinc-800 rounded-3xl p-8 h-full flex flex-col">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-zinc-800 pb-6">
                  <div>
                    <h4 className="text-white font-black text-lg uppercase tracking-widest flex items-center gap-2">
                      Voice Intelligence <span className="text-[10px] bg-red-600/20 text-red-500 px-2 py-0.5 rounded-full border border-red-500/30">ElevenLabs Cloning Mode</span>
                    </h4>
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Professional Narrator Pipeline</p>
                  </div>
                  <button 
                    onClick={() => setIsCloningEnabled(!isCloningEnabled)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${isCloningEnabled ? 'bg-red-600 text-white border-red-600' : 'bg-transparent text-zinc-600 border-zinc-800 hover:border-zinc-500'}`}
                  >
                    {isCloningEnabled ? 'CLONING ACTIVE' : 'ENABLE CLONING'}
                  </button>
                </div>

                {isCloningEnabled ? (
                  <div className="space-y-8 animate-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Stability</label>
                          <input 
                            type="range" min="0" max="1" step="0.01" 
                            value={voiceSettings.stability} 
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, stability: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                          />
                          <div className="flex justify-between text-[8px] font-bold text-zinc-600 uppercase">
                             <span>More Variable</span>
                             <span>More Stable</span>
                          </div>
                       </div>
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Similarity / Clarity</label>
                          <input 
                            type="range" min="0" max="1" step="0.01" 
                            value={voiceSettings.clarity} 
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, clarity: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                          />
                          <div className="flex justify-between text-[8px] font-bold text-zinc-600 uppercase">
                             <span>Low Similarity</span>
                             <span>High Clarity</span>
                          </div>
                       </div>
                    </div>

                    <div className={`p-8 rounded-3xl border-2 border-dashed transition-all ${clonedSampleUrl ? 'bg-red-600/5 border-red-600/30' : 'bg-zinc-900/30 border-zinc-800 hover:border-red-600/50'}`}>
                       {cloningStatus === 'extracting' ? (
                         <div className="flex flex-col items-center justify-center py-4 gap-4">
                            <div className="w-12 h-12 border-2 border-t-transparent border-red-600 rounded-full animate-spin"></div>
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">Extracting Neural Signature...</span>
                         </div>
                       ) : clonedSampleUrl ? (
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd"/></svg>
                               </div>
                               <div>
                                  <span className="text-[10px] font-black text-white uppercase tracking-widest block">Neural Signature Ready</span>
                                  <span className="text-[8px] font-bold text-zinc-500 uppercase">Cloned from User Reference Sample</span>
                               </div>
                            </div>
                            <button onClick={() => { setClonedSampleUrl(null); setCloningStatus('idle'); }} className="text-[9px] font-black text-zinc-600 hover:text-white uppercase transition-all">Replace Sample</button>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center justify-center gap-4 cursor-pointer" onClick={() => voiceUploadRef.current?.click()}>
                            <input type="file" ref={voiceUploadRef} className="hidden" accept="audio/*" onChange={(e) => handleLocalUpload(e, 'voice')} />
                            <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-600 group-hover:text-red-500 transition-colors">
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                            </div>
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Upload Reference Voice Sample (WAV/MP3)</span>
                         </div>
                       )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 mb-8">
                     <div className="flex items-center gap-3 p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Prebuilt Voices:</span>
                        {['Alexander', 'Kore', 'Zephyr', 'Fenrir'].map(v => (
                          <button key={v} onClick={() => setVoiceName(v)} className={`px-4 py-2 rounded-xl text-[9px] font-black border transition-all ${voiceName === v ? 'bg-white text-black border-white shadow-lg' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-white'}`}>{v === 'Alexander' ? 'Alexander (ElevenLabs)' : v}</button>
                        ))}
                     </div>
                  </div>
                )}
                
                <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-4 scrollbar-hide mt-8">
                  {timeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-zinc-800 rounded-3xl opacity-50">
                       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">No assets in timeline</p>
                    </div>
                  ) : timeline.map((item, index) => (
                    <div key={item.id} className={`p-4 rounded-2xl border transition-all ${currentPlayIndex === index ? 'bg-red-600/10 border-red-500/50' : 'bg-zinc-900/40 border-zinc-800'}`}>
                      <div className="flex items-center gap-6" onClick={() => setCurrentPlayIndex(index)}>
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-black flex-shrink-0 border border-zinc-800 relative">
                           {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover" /> : <video src={item.url} className="w-full h-full object-cover" muted />}
                           {item.audioUrl && <div className="absolute bottom-1 left-1 bg-red-600 px-1 py-0.5 rounded-[2px] text-[7px] font-bold text-white uppercase italic">Cloned</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h6 className="text-white text-sm font-bold truncate font-serif italic">{item.narration || "..." }</h6>
                          <div className="flex items-center gap-3 mt-2">
                             <span className="text-[10px] font-bold text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{item.duration}s</span>
                             {item.audioUrl && <span className="text-[10px] font-bold text-green-500 bg-green-950/20 px-2 py-0.5 rounded">Neural Path Active</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                           <button onClick={(e) => { e.stopPropagation(); setTimeline(prev => prev.filter(t => t.id !== item.id)); }} className="text-zinc-600 hover:text-red-500 transition-colors p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-zinc-600 uppercase mb-1">Production Music</label>
                    <label className="py-4 bg-zinc-900 border border-zinc-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                      {globalMusicUrl ? 'Change Score' : 'Upload BG Music'}
                      <input type="file" className="hidden" accept="audio/*" onChange={(e) => handleLocalUpload(e, 'music')} />
                    </label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-zinc-600 uppercase mb-1">Narration Layer</label>
                    <button 
                      onClick={handleGenerateFullVoiceover}
                      disabled={isCompiling === 'audio' || (isCloningEnabled && !clonedSampleUrl)}
                      className={`py-4 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-600/10 hover:bg-blue-500 transition-all ${isCompiling === 'audio' ? 'opacity-50' : ''}`}
                    >
                      {isCompiling === 'audio' ? 'BATCHING...' : isCloningEnabled ? 'CLONE & BATCH' : 'BATCH AUDIO'}
                    </button>
                  </div>
                </div>
                
                <button 
                  onClick={handleExport}
                  disabled={isExporting || timeline.length === 0}
                  className="w-full mt-4 py-5 bg-red-600 text-white rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-red-600/20 hover:bg-red-500 transition-all"
                >
                  {isExporting ? 'FINALIZING PRODUCTION...' : 'EXPORT CINEMATIC SHORT (.MP4)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'grounding' && (
          <div className="bg-[#0f0f0f] border border-zinc-800 rounded-[2.5rem] p-12 max-w-4xl mx-auto shadow-2xl animate-in zoom-in duration-500">
            <h4 className="text-3xl font-black mb-8 flex items-center gap-4 text-white uppercase italic">
              <svg className="w-10 h-10 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/></svg>
              Grounding Intelligence
            </h4>
            <div className="prose prose-invert max-w-none text-zinc-400 text-lg leading-loose mb-12 italic font-serif">
              {groundingInfo?.text || "Synchronizing with market intelligence..."}
            </div>
            {groundingInfo?.sources && groundingInfo.sources.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10 border-t border-zinc-800/50">
                {groundingInfo.sources.map((source, idx) => (
                  <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-5 bg-zinc-900/50 rounded-2xl hover:bg-zinc-900 transition-all border border-zinc-800 group">
                    <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></div>
                    <span className="text-xs font-black text-zinc-300 uppercase tracking-widest truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisDashboard;
