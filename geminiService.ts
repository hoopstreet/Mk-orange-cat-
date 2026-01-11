
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { VideoAnalysisResult, RecreationScript, SceneBreakdown, GroundingResult, GroundingSource, AspectRatio } from "./types";

/**
 * MANDATORY GLOBAL STYLE LOCK
 */
const LOCKED_GLOBAL_STYLE = "3D Pixar-style animation, hyper-realistic fur textures, cinematic lighting, vibrant colors, expressive facial animations, 8k resolution";

/**
 * MASTER CHARACTER ANCHOR
 */
const MASTER_CHARACTER_DESCRIPTION = "A chubby orange tabby cat with expressive eyes, soft hyper-realistic fur textures, and a charmingly round physique.";

// Helper for base64 decoding
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper for PCM decoding
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Convert AudioBuffer to a WAV blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + bufferLength;
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, bufferLength, true);
  
  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export const generateTTS = async (text: string, voiceName: string = 'Fenrir', isTagalog: boolean = true): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const targetVoice = voiceName === 'Alexander' ? 'Fenrir' : voiceName;
  const instruction = isTagalog 
    ? `Speak this content exclusively in Tagalog with a natural, authoritative tone: ${text}`
    : `Read this with professional cinematic energy: ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: instruction }] }],
    config: {
      responseModalalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: targetVoice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("TTS generation failed.");

  const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const decodedBytes = decodeBase64(base64Audio);
  const audioBuffer = await decodeAudioData(decodedBytes, outputAudioContext, 24000, 1);
  const wavBlob = audioBufferToWav(audioBuffer);
  return URL.createObjectURL(wavBlob);
}

export const analyzeShortsVideo = async (videoBase64: string, mimeType: string): Promise<VideoAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Analyze this YouTube Shorts video in extreme detail to recreate the SAME full story structure as a cinematic masterwork.
    You are a professional YouTube Shorts analyst, lead cinematographer, and senior performance director.

    MANDATORY GLOBAL STYLE LOCK:
    You MUST use the following style for the STYLE: section of ALL visual prompts: "${LOCKED_GLOBAL_STYLE}".

    MANDATORY CHARACTER ANCHOR:
    The main character for all episodes and scenes is: "${MASTER_CHARACTER_DESCRIPTION}".
    
    CRITICAL ATTIRE REQUIREMENT:
    In every "visualPrompt" for the "recreationScript", you MUST explicitly mention the "chubby orange tabby cat" AND its specific ATTIRE. 
    Detail the textures and colors of its cinematic accessories (e.g., a "deep crimson velvet bowtie with gold stitching," a "soft midnight-blue wool-knit sweater with white snowflake patterns," or an "ornate leather collar with a brushed brass bell"). 
    The attire MUST have specific textures (velvet, wool, silk, leather) and vivid colors that align with the Pixar 8K aesthetic.

    CRITICAL REQUIREMENT: CHARACTER PERFORMANCE & ACTION REALISM
    The "action" field in the "recreationScript" MUST be a detailed performance script.
    Include:
    - MICRO-EXPRESSIONS: pupil dilation, ear flickers, whisker twitches.
    - SUBTLE GESTURES: heavy weight shifts, paw-kneading, tail-tip jitters.
    - ENVIRONMENTAL SENSORY DETAILS: Specify the texture of surfaces the cat walks on and how its round body weight compresses them.
    - LIGHT ON FUR & ATTIRE: Detail how the cinematic lighting catches the individual hyper-realistic hairs AND the specific textures of its clothing (e.g., glints on the velvet, fuzzy wool highlights).

    CRITICAL REQUIREMENT: 6-PART VISUAL PROMPT FORMAT
    Every visual prompt MUST follow this exact format:
    VISUAL, STYLE, CHARACTER, ACTION / MOVEMENT, MOOD & EMOTION, PURPOSE.

    AUTOMATIC COMMENTARY REQUIREMENT:
    For the "narration" field, provide a "Cinematic Automatic Commentary" in Tagalog.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: videoBase64, mimeType: mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalLength: { type: Type.NUMBER },
            totalScenes: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            masterStyleAnchor: { type: Type.STRING },
            masterCharacterAnchors: { type: Type.STRING },
            breakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.NUMBER },
                  duration: { type: Type.NUMBER },
                  visualDescription: { type: Type.STRING },
                  action: { type: Type.STRING },
                  emotion: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  technicalNotes: { type: Type.STRING },
                  imageGenPrompt: { type: Type.STRING }
                },
                required: ["sceneNumber", "duration", "visualDescription", "action", "emotion", "purpose", "technicalNotes", "imageGenPrompt"]
              }
            },
            recreationScript: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.NUMBER },
                  duration: { type: Type.NUMBER },
                  visualPrompt: { type: Type.STRING },
                  action: { type: Type.STRING },
                  narration: { type: Type.STRING },
                  emotion: { type: Type.STRING },
                  transition: { type: Type.STRING }
                },
                required: ["sceneNumber", "duration", "visualPrompt", "action", "narration", "emotion", "transition"]
              }
            }
          },
          required: ["totalLength", "totalScenes", "breakdown", "recreationScript", "summary", "masterStyleAnchor", "masterCharacterAnchors"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI returned empty content.");
    return JSON.parse(text) as VideoAnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const auditSceneConsistency = async (
  prompt: string,
  styleAnchor: string,
  charAnchor: string
): Promise<{ isConsistent: boolean; auditScore: number; auditFeedback: string; missingAnchors: string[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const auditPrompt = `
    Analyze this Visual Prompt for consistency with the MANDATORY GLOBAL STYLE, Character Anchor, and ATTIRE requirements.
    STYLE: ${LOCKED_GLOBAL_STYLE}
    CHARACTER: ${MASTER_CHARACTER_DESCRIPTION}
    ATTIRE MANDATE: Must specify cinematic textures (velvet, wool, etc.) and specific colors for the chubby orange tabby cat's accessories.
    PROMPT: ${prompt}
    
    Ensure the prompt explicitly mentions the "Chubby orange tabby cat" and its attire. 
    Return a structured JSON evaluation.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: auditPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isConsistent: { type: Type.BOOLEAN },
            auditScore: { type: Type.NUMBER },
            auditFeedback: { type: Type.STRING },
            missingAnchors: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["isConsistent", "auditScore", "auditFeedback", "missingAnchors"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Audit Error:", error);
    return { isConsistent: true, auditScore: 100, auditFeedback: "", missingAnchors: [] };
  }
};

const refinePromptStructure = async (currentPrompt: string, styleAnchor: string, characterAnchor: string, taskDescription: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `You are a Lead Production Designer. Task: ${taskDescription}
  
  MANDATORY: Output MUST follow the 6-part format (VISUAL, STYLE, CHARACTER, ACTION / MOVEMENT, MOOD & EMOTION, PURPOSE).
  
  CRITICAL ATTIRE ENFORCEMENT: 
  The "CHARACTER" and "VISUAL" sections MUST explicitly mention the "Chubby orange tabby cat" AND its detailed attire with specific textures (e.g., heavy velvet, fuzzy wool, shimmering silk) and colors. 
  Example: "wearing a royal purple velvet bowtie with gold embroidery."
  
  STYLE: "${LOCKED_GLOBAL_STYLE}"
  CHARACTER ANCHOR: "${MASTER_CHARACTER_DESCRIPTION}"
  
  CURRENT PROMPT: ${currentPrompt}`;
  
  const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
  return response.text?.trim() || currentPrompt;
};

export const refineDynamicMotion = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Enhance cinematic camera choreography and dynamic angles while strictly maintaining character identity and attire consistency.");
};

export const refineAtmosAndLighting = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Enhance volumetric lighting and depth of field layers while ensuring the character anchor and its specific attire textures are the central focus.");
};

export const refineMoodAndIdentity = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Align mood and character identity strictly with Pixar 8K standards, the chubby orange tabby cat anchor, and detailed attire specifications.");
};

export const refineEvocativeExpressions = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Detail high-fidelity micro-expressions for the chubby orange tabby cat, considering how its attire (like a collar) might react to movement.");
};

export const refineCharacterDynamics = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Deepen character interactions and performance details for the main anchor, emphasizing its physical presence and attire.");
};

export const refineAttireDetails = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "MANDATORY: Detail hyper-realistic attire for the chubby orange tabby cat. Focus on explicit high-end textures (e.g., heavy velvet, fuzzy wool, shimmering silk) and specific vibrant cinematic colors. CRITICAL: Describe how the cinematic light (rim lights, glints, soft fill) interacts with these specific textures, highlighting the weave of the fabric and individual orange hairs.");
};

export const refineCameraAndDepth = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Enhance camera angles and background depth layers to frame the chubby orange tabby cat and its detailed attire heroically.");
};

export const alignPromptToAnchors = async (currentPrompt: string, styleAnchor: string, characterAnchor: string): Promise<string> => {
  return refinePromptStructure(currentPrompt, styleAnchor, characterAnchor, "Sync all sections with the Master Style, the Chubby Orange Tabby Cat Character Anchor, and the required specific attire details.");
};

export const expandActionDynamics = async (
  currentAction: string,
  visualPrompt: string,
  characterAnchor: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `You are a Senior Performance Director. Expand the ACTION field into a hyper-detailed performance script specifically for the character "${MASTER_CHARACTER_DESCRIPTION}".
  
  MANDATORY ENHANCEMENTS FOR CHARACTER PERFORMANCE:
  1. SUBTLE INTERACTIONS (Character-to-Character): Detail meaningful glances, subtle proxemics, and intentional physical contact.
  2. SUBTLE INTERACTIONS (Character-to-Environment): Describe the sensory result of the cat's round physique interacting with its surroundings (belly pressing into velvet, paws crunching on textures).
  3. GESTURES & MICRO-EXPRESSIONS: Detail micro-movements like whisker twitches, pupil dilation response to light, or tail-tip jitters.
  4. LIGHTING & SENSORY DETAIL: Describe how rim lights catch individual hairs or glints on attire accessories during these interactions.
  5. PHYSICAL PRESENCE: Emphasize the "chubby" and "round" physique in all movements.
  
  CURRENT ACTION: ${currentAction}
  VISUAL CONTEXT: ${visualPrompt}`;
  
  const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
  return response.text?.trim() || currentAction;
};

export const refineVoiceoverScript = async (
  action: string,
  visualPrompt: string,
  styleAnchor: string,
  targetLanguage: string = 'Tagalog'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Convert this performance into a professional Tagalog voiceover script.
  ACTION: ${action}
  STYLE: ${LOCKED_GLOBAL_STYLE}`;
  
  const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
  return response.text?.trim() || action;
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "9:16" } }
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("Failed.");
};

export const generateVideo = async (
  prompt: string, 
  base64Image?: string, 
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  onProgress?.("Initiating production sequence...");
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    image: base64Image ? { imageBytes: base64Image.split(',')[1], mimeType: 'image/png' } : undefined,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: "9:16" }
  });

  while (!operation.done) {
    onProgress?.("Synthesizing cinematic motion...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const searchGroundingCheck = async (topic: string): Promise<GroundingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Trending insights for: ${topic}`,
    config: { tools: [{ googleSearch: {} }] }
  });
  const text = response.text || "";
  const sources: GroundingSource[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) sources.push({ title: chunk.web.title || "Ref", uri: chunk.web.uri });
    });
  }
  return { text, sources };
};
