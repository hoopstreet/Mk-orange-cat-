
export interface SceneBreakdown {
  sceneNumber: number;
  duration: number;
  visualDescription: string;
  action: string;
  emotion: string;
  purpose: string;
  technicalNotes: string;
  imageGenPrompt: string;
}

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export interface RecreationScript {
  sceneNumber: number;
  duration: number;
  visualPrompt: string;
  action: string;
  narration: string;
  emotion: string;
  transition: string;
  isConsistent?: boolean;
  missingAnchors?: string[];
  auditScore?: number;
  auditFeedback?: string;
  videoUri?: string;
  audioUrl?: string;
}

export interface TimelineItem {
  id: string;
  sceneNumber: number;
  type: 'image' | 'video';
  url: string;
  audioUrl?: string; // Voiceover track
  duration: number;
  narration: string;
  startOffset?: number; // For trimming
  endOffset?: number;   // For trimming
  isLocal?: boolean;
}

export interface VideoAnalysisResult {
  totalLength: number;
  totalScenes: number;
  masterStyleAnchor: string;
  masterCharacterAnchors: string;
  breakdown: SceneBreakdown[];
  recreationScript: RecreationScript[];
  summary: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GroundingResult {
  text: string;
  sources: GroundingSource[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  title: string;
  result: VideoAnalysisResult;
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
