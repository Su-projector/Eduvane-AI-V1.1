import { 
  SYSTEM_INSTRUCTION_PERCEPTION, 
  SYSTEM_INSTRUCTION_INTERPRETATION, 
  SYSTEM_INSTRUCTION_REASONING, 
  SYSTEM_INSTRUCTION_QUESTION_WORKSPACE
} from "../constants";
import { AnalysisResult, OwnershipContext, UserRole, IChatSession, IGenerationChunk } from "../types";
import { GoogleGenAI, Type, GenerateContentResponse, Content } from "@google/genai";

// 1. Configuration
const API_BASE = 'http://localhost:3000/api';
// Initialize SDK for fallback (Client-side execution)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types for Transport Layer ---
interface InterpretationResult {
  subject: string;
  topic: string;
  intent: 'solution' | 'explanation' | 'both';
  ownership: OwnershipContext;
}

/**
 * HybridChatSession
 * Strategy:
 * 1. Attempt to send message via Server API (State managed via history payload).
 * 2. If Server fails, fallback to direct SDK call using the same history.
 * 3. Maintain a "Canonical History" locally to ensure continuity across transport switches.
 */
class HybridChatSession implements IChatSession {
  // Canonical History: Shared state for both Server and SDK modes
  private history: Content[] = [];

  constructor(private systemInstruction: string) {}

  async sendMessageStream(request: { message: string }): Promise<AsyncGenerator<IGenerationChunk>> {
    const userContent: Content = { role: 'user', parts: [{ text: request.message }] };
    
    // Optimistic Update
    this.history.push(userContent);

    try {
      // --- ATTEMPT 1: SERVER ---
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.message,
          history: this.history.slice(0, -1), // Send history excluding the just-added message (server adds it)
          systemInstruction: this.systemInstruction,
          model: 'gemini-3-flash-preview'
        })
      });

      if (!response.ok || !response.body) throw new Error("Server unreachable or error");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const that = this;
      let fullResponse = "";

      async function* serverGenerator() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) {
              fullResponse += chunk;
              yield { text: chunk };
            }
          }
          // Sync canonical history with server response
          that.history.push({ role: 'model', parts: [{ text: fullResponse }] });
        } catch (e) {
          console.error("Server Stream Error", e);
          throw e; 
        }
      }

      return serverGenerator();

    } catch (serverError) {
      console.warn("⚠️ Server Mode Failed. Falling back to Client SDK.", serverError);

      // --- ATTEMPT 2: CLIENT SDK ---
      try {
        // We recreate the chat session with the current canonical history
        // Note: We exclude the last user message from 'history' param because sendMessageStream takes it as arg
        const historyForSdk = this.history.slice(0, -1);
        
        const chat = ai.chats.create({
          model: 'gemini-3-flash-preview',
          history: historyForSdk,
          config: {
            systemInstruction: this.systemInstruction,
          }
        });

        const resultStream = await chat.sendMessageStream({ message: request.message });
        const that = this;
        let fullResponse = "";

        async function* sdkGenerator() {
            for await (const chunk of resultStream) {
                const c = chunk as GenerateContentResponse;
                if (c.text) {
                    fullResponse += c.text;
                    yield { text: c.text };
                }
            }
            // Sync canonical history with SDK response
            that.history.push({ role: 'model', parts: [{ text: fullResponse }] });
        }

        return sdkGenerator();

      } catch (sdkError) {
        console.error("Critical: Both Server and SDK failed.", sdkError);
        throw sdkError;
      }
    }
  }

  async sendMessage(request: { message: string }): Promise<{ text: string }> {
    const generator = await this.sendMessageStream(request);
    let text = "";
    for await (const chunk of generator) {
      text += chunk.text;
    }
    return { text };
  }
}

export class GeminiService {
  private currentSession: IChatSession | null = null;

  // --- Session Lifecycle Management ---
  
  private getOrCreateSession(): IChatSession {
    if (!this.currentSession) {
      this.currentSession = new HybridChatSession(SYSTEM_INSTRUCTION_QUESTION_WORKSPACE);
    }
    return this.currentSession;
  }

  public createQuestionSession(): IChatSession {
    return new HybridChatSession(SYSTEM_INSTRUCTION_QUESTION_WORKSPACE);
  }

  public endSession() {
    this.currentSession = null;
  }

  // --- Capability 1: Analysis Execution (Hybrid) ---

  async perceive(base64Image: string, mimeType: string): Promise<string> {
    const payload = {
        image: base64Image,
        mimeType,
        systemInstruction: SYSTEM_INSTRUCTION_PERCEPTION
    };

    // 1. Try Server
    try {
        const response = await fetch(`${API_BASE}/perceive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();
        return data.text || "";
    } catch (e) {
        console.warn("Falling back to SDK for Perception");
        // 2. Fallback SDK
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType: mimeType } },
                    { text: "Extract all legible text from this content. Describe the layout briefly." }
                ]
            },
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_PERCEPTION,
                temperature: 0.1,
            }
        });
        return response.text || "";
    }
  }

  async interpret(extractedText: string): Promise<InterpretationResult> {
    const payload = {
        text: extractedText,
        systemInstruction: SYSTEM_INSTRUCTION_INTERPRETATION
    };

    // Shared Schema for SDK
    const interpretationSchema = {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          topic: { type: Type.STRING },
          difficulty: { type: Type.STRING },
          intent: { 
              type: Type.STRING, 
              enum: ["solution", "explanation", "both"],
          },
          ownership: {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING, enum: ["student_direct", "teacher_uploaded_student_work"] },
                student: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        class: { type: Type.STRING },
                        confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
                    }
                }
            },
            required: ["type"]
          }
        },
        required: ["subject", "topic", "intent", "ownership"]
    };

    // 1. Try Server
    try {
        const response = await fetch(`${API_BASE}/interpret`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Server Error");
        return await response.json();
    } catch (e) {
        console.warn("Falling back to SDK for Interpretation");
        // 2. Fallback SDK
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [{ text: `Analyzed Text: ${extractedText}` }]
                },
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION_INTERPRETATION,
                    responseMimeType: "application/json",
                    responseSchema: interpretationSchema
                }
            });
            const jsonStr = response.text || "{}";
            return JSON.parse(jsonStr);
        } catch (sdkError) {
             return { 
                subject: "General", 
                topic: "Unknown", 
                intent: "explanation",
                ownership: { type: "student_direct" }
            };
        }
    }
  }

  async reason(
    base64Image: string | undefined, 
    mimeType: string | undefined, 
    extractedText: string, 
    context: InterpretationResult,
    userInstruction: string | undefined, 
    mode: 'fast' | 'deep', 
    historyContext?: string, 
    userRole?: UserRole 
  ): Promise<AnalysisResult> {
    
    const prompt = `
        [LEVEL 2: USER ROLE & OWNERSHIP]
        Active Role: ${userRole || 'Unknown'}
        Ownership Type: ${context.ownership.type}
        Student: ${context.ownership.student?.name || "Unknown"} (${context.ownership.student?.class || "Unknown"})

        [LEVEL 3: USER REQUEST & INTENT]
        Detected Intent: ${context.intent}
        Explicit Instruction: ${userInstruction || "None"}
        
        [LEVEL 4: CONTEXT]
        Subject/Topic: ${context.subject} / ${context.topic}
        History: ${historyContext || "None"}

        [CONTENT TO ANALYZE]
        ${extractedText}
        
        Analyze strictly following the INSTRUCTION HIERARCHY.
        Generate a JSON response for the Eduvane AI MVP.
    `;

    const payload = {
        prompt,
        image: base64Image,
        mimeType,
        systemInstruction: SYSTEM_INSTRUCTION_REASONING,
        mode
    };

    // Shared Schema for SDK
    const reasonSchema = {
        type: Type.OBJECT,
        properties: {
          score: {
            type: Type.OBJECT,
            properties: {
              value: { type: Type.STRING },
              label: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            }
          },
          feedback: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["strength", "gap", "neutral"] },
                text: { type: Type.STRING },
                reference: { type: Type.STRING }
              }
            }
          },
          handwriting: {
            type: Type.OBJECT,
            properties: {
                quality: { type: Type.STRING, enum: ["excellent", "good", "fair", "poor", "illegible"] },
                feedback: { type: Type.STRING }
            }
          },
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                trend: { type: Type.STRING, enum: ["stable", "improving", "declining", "new"] }
              }
            }
          },
          guidance: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.STRING },
                rationale: { type: Type.STRING }
              }
            }
          },
          concept_stability: {
            type: Type.OBJECT,
            properties: {
                status: { type: Type.STRING, enum: ["emerging", "unstable_pressure", "stabilizing", "robust", "unknown"] },
                evidence: { type: Type.STRING }
            }
          },
          teacher_insight: { type: Type.STRING }
        }
    };

    let rawData: any;

    try {
        // 1. Try Server
        const response = await fetch(`${API_BASE}/reason`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Server Error");
        rawData = await response.json();
    } catch (e) {
        console.warn("Falling back to SDK for Reasoning");
        // 2. Fallback SDK
        const modelName = mode === 'fast' ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
        const parts: any[] = [{ text: prompt }];
        if (base64Image && mimeType) {
            parts.unshift({ inlineData: { data: base64Image, mimeType: mimeType } });
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_REASONING,
                responseMimeType: "application/json",
                responseSchema: reasonSchema
            }
        });
        rawData = JSON.parse(response.text || "{}");
    }

    // Common Post-Processing
    const result: AnalysisResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        subject: context.subject,
        topic: context.topic,
        score: rawData.score || { value: "-", label: "Pending", reasoning: "Analysis incomplete" },
        feedback: Array.isArray(rawData.feedback) ? rawData.feedback : [],
        insights: Array.isArray(rawData.insights) ? rawData.insights : [],
        guidance: Array.isArray(rawData.guidance) ? rawData.guidance : [],
        handwriting: rawData.handwriting,
        conceptStability: rawData.concept_stability,
        teacherInsight: rawData.teacher_insight,
        ownership: context.ownership,
        rawText: extractedText
    };

    this.injectAnalysisContext(result);
    return result;
  }

  // --- Capability 2: Learning Task Execution (Hybrid Chat) ---

  async streamLearningTask(message: string, userRole?: UserRole): Promise<AsyncGenerator<IGenerationChunk>> {
    const session = this.getOrCreateSession();
    const contextMsg = `[Active User Role: ${userRole || 'Ambiguous'}] ${message}`;
    return session.sendMessageStream({ message: contextMsg });
  }

  async injectAnalysisContext(result: AnalysisResult) {
    const feedback = Array.isArray(result.feedback) ? result.feedback : [];
    const insights = Array.isArray(result.insights) ? result.insights : [];
    
    const contextPayload = `
      [SYSTEM UPDATE: LEARNING CONTEXT AVAILABLE]
      New analysis completed.
      Subject: ${result.subject} (${result.topic}).
      Ownership: ${result.ownership?.type || 'student_direct'}.
      
      Observation Summary:
      ${feedback.map(f => `- ${f.type.toUpperCase()}: ${f.text}`).join('\n')}
      
      Identified Learning Gaps:
      ${feedback.filter(f => f.type === 'gap').map(f => f.text).join(', ')}

      Stability Signal: ${result.conceptStability?.status || 'Unknown'} (${result.conceptStability?.evidence || 'No specific evidence'})

      Previous Insights (Longitudinal):
      ${insights.map(i => `- ${i.title}: ${i.trend}`).join('\n')}
      
      Teacher Insight (If any): ${result.teacherInsight || "None"}
    `;
    
    try {
      const session = this.getOrCreateSession();
      await session.sendMessage({ message: contextPayload }); 
    } catch (e) {
      console.error("Failed to inject context", e);
    }
  }
}

export const geminiService = new GeminiService();