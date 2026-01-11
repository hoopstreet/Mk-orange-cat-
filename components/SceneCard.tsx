
import React, { useState, useEffect } from 'react';
import { SceneBreakdown, RecreationScript, TimelineItem, AspectRatio } from '../types';
import { 
  generateImage, 
  generateVideo,
  generateTTS,
  alignPromptToAnchors, 
  refineAtmosAndLighting,
  refineMoodAndIdentity,
  refineEvocativeExpressions,
  refineCharacterDynamics,
  refineAttireDetails,
  refineCameraAndDepth,
  refineVoiceoverScript,
  expandActionDynamics,
  auditSceneConsistency,
  refineDynamicMotion
} from '../geminiService';

interface Props {
  type: 'breakdown' | 'recreation';
  data: SceneBreakdown | RecreationScript | any;
  layoutMode: 'image' | 'video';
  masterStyle?: string;
  masterCharacter?: string;
  onMediaGenerated?: (sceneNumber: number, type: 'image' | 'video' | 'audio', url: string) => void;
  onAddToTimeline?: (item: Omit<TimelineItem, 'id'>) => void;
  autoTrigger?: 'image' | 'video' | 'animate-all' | 'audio' | 'attire' | null;
  forceBatch?: boolean;
}

const SceneCard: React.FC<Props> = ({ type, data, layoutMode, masterStyle, masterCharacter, onMediaGenerated, onAddToTimeline, autoTrigger, forceBatch }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [isAudioGenerating, setIsAudioGenerating] = useState(false);
  const [isScriptGenerating, setIsScriptGenerating] = useState(false);
  const [isDynamicsExpanding, setIsDynamicsExpanding] = useState(false);
  const [isCameraRefining, setIsCameraRefining] = useState(false);
  const [isAttireRefining, setIsAttireRefining] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string>("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAddingToEditor, setIsAddingToEditor] = useState(false);
  const [showSuccessTag, setShowSuccessTag] = useState<string | null>(null);
  
  const [auditResult, setAuditResult] = useState<{ isConsistent: boolean; auditScore: number; auditFeedback: string; missingAnchors: string[] } | null>(null);

  const initialPrompt = type === 'recreation' ? (data as RecreationScript).visualPrompt : (data as SceneBreakdown).imageGenPrompt;
  const initialAction = type === 'recreation' ? (data as RecreationScript).action : (data as SceneBreakdown).action;
  
  const [localVisualPrompt, setLocalVisualPrompt] = useState<string>(initialPrompt);
  const [localAction, setLocalAction] = useState<string>(data.narration || initialAction);
  const [isEdited, setIsEdited] = useState(false);

  // Synchronize local state with prop updates (e.g., from batch refinements)
  useEffect(() => {
    setLocalVisualPrompt(initialPrompt);
    setLocalAction(data.narration || initialAction);
  }, [initialPrompt, data.narration, initialAction]);

  useEffect(() => {
    if (autoTrigger === 'image' && !isGenerating && (forceBatch || !imageUrl)) {
      handleGenerateImage();
    }
    if (autoTrigger === 'video' && !isVideoGenerating && (forceBatch || !videoUrl)) {
      handleGenerateVideo(false);
    }
    if (autoTrigger === 'animate-all' && !isVideoGenerating && imageUrl && (forceBatch || !videoUrl)) {
      handleGenerateVideo(true);
    }
    if (autoTrigger === 'audio' && !isAudioGenerating && (forceBatch || !audioUrl)) {
      handleGenerateAudio();
    }
  }, [autoTrigger, forceBatch, imageUrl]);

  const handleGenerateImage = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const url = await generateImage(localVisualPrompt);
      setImageUrl(url);
      onMediaGenerated?.(data.sceneNumber, 'image', url);
      setIsEdited(false);
    } catch (err) {
      console.error("Image generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async (useImage: boolean = false) => {
    if (isVideoGenerating) return;
    setIsVideoGenerating(true);
    try {
      const url = await generateVideo(localVisualPrompt, useImage && imageUrl ? imageUrl : undefined, setVideoStatus);
      setVideoUrl(url);
      onMediaGenerated?.(data.sceneNumber, 'video', url);
      setIsEdited(false);
    } catch (err) {
      console.error("Video generation failed", err);
    } finally {
      setIsVideoGenerating(false);
      setVideoStatus("");
    }
  };

  const handleGenerateAudio = async () => {
    if (isAudioGenerating) return;
    setIsAudioGenerating(true);
    try {
      const url = await generateTTS(localAction, 'Alexander', true);
      setAudioUrl(url);
      onMediaGenerated?.(data.sceneNumber, 'audio', url);
    } catch (err) {
      console.error("Audio generation failed", err);
    } finally {
      setIsAudioGenerating(false);
    }
  };

  const handleRunAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    try {
      const result = await auditSceneConsistency(localVisualPrompt, masterStyle || "", masterCharacter || "");
      setAuditResult(result);
    } catch (err) {
      console.error("Audit failed", err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleRefineCamera = async () => {
    if (isCameraRefining) return;
    setIsCameraRefining(true);
    try {
      const refined = await refineCameraAndDepth(localVisualPrompt, masterStyle || "", masterCharacter || "");
      setLocalVisualPrompt(refined);
      setIsEdited(true);
      flashSuccess('camera');
    } catch (err) {
      console.error("Camera refinement failed", err);
    } finally {
      setIsCameraRefining(false);
    }
  };

  const handleRefineAttire = async () => {
    if (isAttireRefining) return;
    setIsAttireRefining(true);
    try {
      const refined = await refineAttireDetails(localVisualPrompt, masterStyle || "", masterCharacter || "");
      setLocalVisualPrompt(refined);
      setIsEdited(true);
      flashSuccess('attire');
    } catch (err) {
      console.error("Attire refinement failed", err);
    } finally {
      setIsAttireRefining(false);
    }
  };

  const handleRefineScript = async () => {
    if (isScriptGenerating) return;
    setIsScriptGenerating(true);
    try {
      const refined = await refineVoiceoverScript(initialAction, localVisualPrompt, masterStyle || "", 'Tagalog');
      setLocalAction(refined);
      setIsEdited(true);
      flashSuccess('script');
    } catch (err) {
      console.error("Script refinement failed", err);
    } finally {
      setIsScriptGenerating(false);
    }
  };

  const handleExpandDynamics = async () => {
    if (isDynamicsExpanding) return;
    setIsDynamicsExpanding(true);
    try {
      const expanded = await expandActionDynamics(localAction, localVisualPrompt, masterCharacter || "");
      setLocalAction(expanded);
      setIsEdited(true);
      flashSuccess('action');
    } catch (err) {
      console.error("Dynamics expansion failed", err);
    } finally {
      setIsDynamicsExpanding(false);
    }
  };

  const flashSuccess = (type: string) => {
    setShowSuccessTag(type);
    setTimeout(() => setShowSuccessTag(null), 2000);
  };

  const handleDownload = (e: React.MouseEvent, url: string, mediaType: string) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = url;
    link.download = `shortsarchitect-scene-${data.sceneNumber}-${mediaType}.${mediaType === 'video' ? 'mp4' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddToTimelineInternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoUrl && !imageUrl) return;
    setIsAddingToEditor(true);
    
    // Slight artificial delay to show state
    setTimeout(() => {
      onAddToTimeline?.({
        sceneNumber: data.sceneNumber,
        type: videoUrl ? 'video' : 'image',
        url: (videoUrl || imageUrl)!,
        duration: data.duration || 3,
        narration: localAction,
        audioUrl: audioUrl || undefined
      });
      setIsAddingToEditor(false);
    }, 400);
  };

  return (
    <div className={`relative overflow-hidden transition-all duration-500 rounded-3xl bg-[#0d0d0d] border ${auditResult && !auditResult.isConsistent ? 'border-red-900/50 shadow-[0_0_40px_rgba(220,38,38,0.1)]' : 'border-zinc-800'} p-8 group mb-4`}>
      {isPreviewOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div 
            className="aspect-[9/16] max-w-[90vw] max-h-[90vh] relative group/modal shadow-[0_0_100px_rgba(0,0,0,1)] rounded-3xl overflow-hidden border border-zinc-800" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-6 right-6 z-20 w-12 h-12 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            {videoUrl ? (
              <video src={videoUrl} className="w-full h-full object-cover" controls autoPlay loop />
            ) : (
              <img src={imageUrl!} className="w-full h-full object-cover animate-in zoom-in duration-500" />
            )}
          </div>
        </div>
      )}

      {/* Flagging Alert Banner */}
      {auditResult && !auditResult.isConsistent && (
        <div className="absolute top-0 inset-x-0 bg-red-600/10 border-b border-red-900/30 px-8 py-3 flex items-center justify-between animate-in slide-in-from-top-4 duration-500 z-10">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Consistency Warning: Style/Character Deviation Detected</span>
          </div>
          <button onClick={() => setAuditResult(null)} className="text-[8px] font-bold text-red-900 uppercase hover:text-red-500">Dismiss</button>
        </div>
      )}

      <div className={`flex flex-col lg:flex-row gap-12 ${auditResult && !auditResult.isConsistent ? 'mt-8' : ''}`}>
        <div className="flex-1 space-y-8">
          <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
            <div className="flex items-center gap-3">
              <h5 className={`text-[11px] font-black uppercase tracking-[0.2em] ${layoutMode === 'image' ? 'text-blue-500' : 'text-red-500'}`}>
                SCENE {data.sceneNumber} STUDIO (9:16)
              </h5>
              {isEdited && (
                <span className="text-[9px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full font-black uppercase animate-pulse">Modified</span>
              )}
              {auditResult && (
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${auditResult.isConsistent ? 'bg-green-600/20 text-green-400' : 'bg-red-600 text-white'}`}>
                  Score: {auditResult.auditScore}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all flex items-center gap-2"
              >
                {isAuditing ? 'AUDITING...' : (
                   <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    Audit Prompt
                   </>
                )}
              </button>
              <button 
                onClick={handleRefineAttire}
                disabled={isAttireRefining}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-amber-400 transition-all flex items-center gap-2"
              >
                {isAttireRefining ? 'STYLING...' : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5L6 9H2V15H6L11 19V5Z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
                    Cinematic Attire
                  </>
                )}
              </button>
              <button 
                onClick={handleRefineCamera}
                disabled={isCameraRefining}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-blue-400 transition-all flex items-center gap-2"
              >
                {isCameraRefining ? 'REFINING...' : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    Cinematic Depth
                  </>
                )}
              </button>
              <button 
                onClick={() => { setLocalVisualPrompt(initialPrompt); setLocalAction(data.narration || initialAction); setIsEdited(false); setAuditResult(null); }}
                className={`text-[9px] font-black uppercase tracking-widest transition-all ${isEdited ? 'text-zinc-400 hover:text-white' : 'hidden'}`}
              >
                Reset
              </button>
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{data.duration}S</span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="relative group/prompt">
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                 <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest bg-zinc-950 px-2 py-1 rounded border border-zinc-900">Visual Prompt</span>
                 <span className="text-[7px] font-black text-red-500 uppercase tracking-widest bg-red-600/10 px-2 py-1 rounded border border-red-900/20">Style Locked</span>
                 {showSuccessTag === 'camera' && (
                    <span className="text-[7px] bg-blue-600/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30 font-black uppercase animate-in fade-in duration-300">Camera Refined ✓</span>
                 )}
                 {showSuccessTag === 'attire' && (
                    <span className="text-[7px] bg-amber-600/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30 font-black uppercase animate-in fade-in duration-300">Attire & Lighting Refined ✓</span>
                 )}
              </div>
              <textarea 
                value={localVisualPrompt}
                onChange={(e) => { setLocalVisualPrompt(e.target.value); setIsEdited(true); }}
                className={`w-full h-44 bg-[#070707] border ${auditResult && !auditResult.isConsistent ? 'border-red-900' : 'border-zinc-800'} rounded-2xl p-8 pt-10 text-zinc-300 text-sm font-mono leading-relaxed focus:outline-none focus:border-red-500/50 transition-all resize-none scrollbar-hide`}
                placeholder="Cinematic visual prompt..."
                disabled={isGenerating || isVideoGenerating || isCameraRefining || isAttireRefining}
              />
              
              {auditResult && auditResult.auditFeedback && (
                <div className={`mt-3 p-4 rounded-xl text-[10px] font-medium leading-relaxed ${auditResult.isConsistent ? 'bg-zinc-900 text-zinc-400' : 'bg-red-950/20 text-red-400 border border-red-900/30 italic'}`}>
                  {auditResult.auditFeedback}
                  {auditResult.missingAnchors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="font-black uppercase text-[8px] text-red-500">Missing Elements:</span>
                      {auditResult.missingAnchors.map((m, i) => (
                        <span key={i} className="bg-red-600/10 px-2 py-0.5 rounded text-red-600 border border-red-900/20">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-800/50">
            <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-4">
                 <h6 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                   Character Performance / Action
                   <span className="text-[7px] bg-red-600/20 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20">Enhanced Dynamics</span>
                 </h6>
                 {showSuccessTag === 'action' && (
                    <span className="text-[8px] bg-green-600/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30 font-black uppercase animate-in fade-in duration-300">Action Refined ✓</span>
                 )}
                 {showSuccessTag === 'script' && (
                    <span className="text-[8px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-black uppercase animate-in fade-in duration-300">Script Updated ✓</span>
                 )}
               </div>
               <div className="flex gap-2">
                  <button onClick={handleExpandDynamics} disabled={isDynamicsExpanding} className="text-[8px] font-bold text-purple-400 uppercase border border-purple-900/30 px-2 py-1 rounded hover:bg-purple-900/10 transition-all flex items-center gap-2">
                    {isDynamicsExpanding ? (
                      <span className="flex items-center gap-2"><div className="w-2 h-2 border-2 border-t-transparent border-purple-400 rounded-full animate-spin"></div>ANALYZING BEATS...</span>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                        Enhance Action Performance
                      </>
                    )}
                  </button>
                  <button onClick={handleRefineScript} disabled={isScriptGenerating} className="text-[8px] font-bold text-zinc-400 uppercase border border-zinc-800 px-2 py-1 rounded hover:text-white transition-all">
                    {isScriptGenerating ? 'REFining...' : 'Refine Tagalog'}
                  </button>
                  <button onClick={handleGenerateAudio} disabled={isAudioGenerating} className="text-[8px] font-bold text-red-500 uppercase border border-red-900/30 px-2 py-1 rounded hover:bg-red-900/10 transition-all">
                    {isAudioGenerating ? 'Synthesizing...' : audioUrl ? 'Regenerate Alexander' : 'Alexander Voice'}
                  </button>
               </div>
            </div>
            <textarea
              value={localAction}
              onChange={(e) => { setLocalAction(e.target.value); setIsEdited(true); }}
              className="w-full h-24 text-zinc-400 text-xs leading-loose italic font-serif bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50 focus:outline-none focus:border-red-500/30 transition-all resize-none scrollbar-hide"
              placeholder="Action details including subtle gestures, glances, and physical contact..."
              disabled={isAudioGenerating || isDynamicsExpanding || isScriptGenerating}
            />
          </div>
        </div>

        <div className="lg:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6">
            <div 
              className="w-full aspect-[9/16] bg-black rounded-3xl border border-zinc-800 overflow-hidden relative group/preview shadow-2xl transition-all duration-700 ease-in-out"
            >
              {videoUrl ? (
                <video src={videoUrl} className="w-full h-full object-cover" muted loop autoPlay />
              ) : imageUrl ? (
                <img src={imageUrl} className="w-full h-full object-cover animate-in fade-in duration-500" />
              ) : (isGenerating || isVideoGenerating) ? (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center z-10">
                  <div className={`w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mb-4 ${isVideoGenerating ? 'border-red-600' : 'border-blue-600'}`}></div>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest block">{isVideoGenerating ? 'SYNTHeSIZING' : 'RENDERING'}</span>
                  {isVideoGenerating && <p className="text-[8px] text-zinc-500 mt-2 uppercase animate-pulse">{videoStatus}</p>}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-zinc-950/50">
                   <div className="w-16 h-16 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-center text-zinc-800 mb-6">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                   </div>
                   <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Capture Scene</p>
                </div>
              )}

              <div className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col items-center justify-center p-8 space-y-2 ${(isGenerating || isVideoGenerating) ? 'opacity-0' : 'opacity-0 group-hover/preview:opacity-100'}`}>
                <button 
                  onClick={() => handleGenerateImage()}
                  disabled={isGenerating || isVideoGenerating}
                  className={`w-full py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${isEdited ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-500'}`}
                >
                  {isGenerating ? 'RENDERING...' : (imageUrl ? 'RE-RENDER FRAME' : 'GENERATE FRAME')}
                </button>
                
                <button 
                  onClick={() => handleGenerateVideo(false)}
                  disabled={isGenerating || isVideoGenerating}
                  className={`w-full py-2.5 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:bg-red-500`}
                >
                  {isVideoGenerating ? 'SYNTHeSIZING...' : 'GENERATE VIDEO'}
                </button>

                {imageUrl && (
                  <button 
                    onClick={() => handleGenerateVideo(true)}
                    disabled={isGenerating || isVideoGenerating}
                    className="w-full py-2.5 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:bg-amber-500"
                  >
                    {isVideoGenerating ? 'ANIMATING...' : 'ANIMATE FRAME'}
                  </button>
                )}

                {(imageUrl || videoUrl) && (
                  <div className="w-full grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10">
                    <button 
                      onClick={() => setIsPreviewOpen(true)}
                      className="py-2.5 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-xl text-[9px] font-black uppercase hover:bg-white/20 flex items-center justify-center gap-2"
                    >
                      PREVIEW
                    </button>
                    <button 
                      onClick={handleAddToTimelineInternal} 
                      disabled={isAddingToEditor}
                      className="py-2.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-blue-500 flex items-center justify-center gap-2"
                    >
                      {isAddingToEditor ? 'ADDING...' : 'EDITOR'}
                    </button>
                  </div>
                )}
                
                {(imageUrl || videoUrl) && (
                  <button 
                    onClick={(e) => handleDownload(e, (videoUrl || imageUrl)!, videoUrl ? 'video' : 'image')}
                    className="w-full py-2 text-zinc-400 text-[8px] font-black uppercase tracking-widest hover:text-white"
                  >
                    DOWNLOAD RAW
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
