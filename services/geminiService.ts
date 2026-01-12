import { 
  SYSTEM_INSTRUCTION_PERCEPTION, 
  SYSTEM_INSTRUCTION_INTERPRETATION, 
  SYSTEM_INSTRUCTION_REASONING, 
  SYSTEM_INSTRUCTION_QUESTION_WORKSPACE
} from "../constants";
import { AnalysisResult, OwnershipContext, UserRole, IChatSession, IGenerationChunk } from "../types";

// --- Types for Transport Layer ---
interface InterpretationResult {
  subject: string;
  topic: string;
  intent: 'solution' | 'explanation' | 'both';
  ownership: OwnershipContext;
}

const SERVER_API_BASE = '/api';

/**
 * RemoteChatSession
 * Manages chat history client-side and delegates generation to the stateless /chat endpoint.
 */
class RemoteChatSession implements IChatSession {
  private history: { role: string; parts: { text: string }[] }[] = [];
  private systemInstruction: string;
  private model: string; // tracked for context, though server logic might override based on endpoint config

  constructor(systemInstruction: string, model: string = 'gemini-3-flash-preview') {
    this.systemInstruction = systemInstruction;
    this.model = model;
  }

  async sendMessageStream(request: { message: string }): Promise<AsyncGenerator<IGenerationChunk>> {
    const userMsg = { role: 'user', parts: [{ text: request.message }] };
    
    // Prepare payload: History + New Message
    const payload = {
      model: this.model,
      systemInstruction: this.systemInstruction,
      history: this.history,
      message: request.message
    };

    try {
      const response = await fetch(`${SERVER_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Chat request failed');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const that = this; // Capture scope for history update

      // Create a generator that yields chunks and updates history on completion
      async function* generator() {
        let fullResponseText = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            // Server sends raw text chunks. 
            // Note: In a real prod setup, we might use SSE (Server Sent Events) for structured data.
            // For this proxy, we assume the server flushes raw text tokens.
            if (chunk) {
              fullResponseText += chunk;
              yield { text: chunk };
            }
          }
        } finally {
          // Update History with the turn
          that.history.push(userMsg);
          that.history.push({ role: 'model', parts: [{ text: fullResponseText }] });
        }
      }

      return generator();

    } catch (e) {
      console.error("Stream error", e);
      throw e;
    }
  }

  async sendMessage(request: { message: string }): Promise<{ text: string }> {
    // Non-streaming fallback using the stream implementation
    const generator = await this.sendMessageStream(request);
    let fullText = '';
    for await (const chunk of generator) {
      fullText += chunk.text;
    }
    return { text: fullText };
  }
}

export class GeminiService {
  private currentSession: IChatSession | null = null;

  constructor() {
    // API Key is now handled on the server.
  }

  // --- Session Lifecycle Management ---
  
  private getOrCreateSession(): IChatSession {
    if (!this.currentSession) {
      this.currentSession = new RemoteChatSession(SYSTEM_INSTRUCTION_QUESTION_WORKSPACE);
    }
    return this.currentSession;
  }

  public createQuestionSession(): IChatSession {
    return new RemoteChatSession(SYSTEM_INSTRUCTION_QUESTION_WORKSPACE);
  }

  public endSession() {
    this.currentSession = null;
  }

  // --- Capability 1: Analysis Execution (Stateless via Proxy) ---

  async perceive(base64Image: string, mimeType: string): Promise<string> {
    try {
      const response = await fetch(`${SERVER_API_BASE}/perceive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          mimeType: mimeType,
          systemInstruction: SYSTEM_INSTRUCTION_PERCEPTION
        })
      });
      
      if (!response.ok) throw new Error('Perception request failed');
      const data = await response.json();
      return data.text || "";
    } catch (e) {
      console.error("Perception failed", e);
      throw new Error("Unable to read the document.");
    }
  }

  async interpret(extractedText: string): Promise<InterpretationResult> {
    try {
      const response = await fetch(`${SERVER_API_BASE}/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: extractedText,
          systemInstruction: SYSTEM_INSTRUCTION_INTERPRETATION
        })
      });

      if (!response.ok) throw new Error('Interpretation request failed');
      const data = await response.json();
      
      // The server returns the JSON object directly
      return data; 
    } catch (e) {
      // Fallback
      return { 
          subject: "General", 
          topic: "Unknown", 
          intent: "explanation",
          ownership: { type: "student_direct" }
      };
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
    try {
      // Prompt construction remains on client to preserve logic/orchestration control
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

      const response = await fetch(`${SERVER_API_BASE}/reason`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image: base64Image,
          mimeType: mimeType,
          systemInstruction: SYSTEM_INSTRUCTION_REASONING,
          mode // 'fast' or 'deep' -> Server maps to appropriate key/model
        })
      });

      if (!response.ok) throw new Error('Reasoning request failed');
      const data = await response.json();

      // Mapping response to internal type
      const result: AnalysisResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        subject: context.subject,
        topic: context.topic,
        score: data.score || { value: "-", label: "Pending", reasoning: "Analysis incomplete" },
        feedback: Array.isArray(data.feedback) ? data.feedback : [],
        insights: Array.isArray(data.insights) ? data.insights : [],
        guidance: Array.isArray(data.guidance) ? data.guidance : [],
        handwriting: data.handwriting,
        conceptStability: data.concept_stability,
        teacherInsight: data.teacher_insight,
        ownership: context.ownership,
        rawText: extractedText
      };

      this.injectAnalysisContext(result);

      return result;

    } catch (e) {
      console.error("Reasoning failed", e);
      throw new Error("Eduvane could not complete the diagnosis.");
    }
  }

  // --- Capability 2: Learning Task Execution (Stateful via Remote Session) ---

  async streamLearningTask(message: string, userRole?: UserRole): Promise<any> {
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

      This information is available for future task generation. Use it to infer intent (misconception vs slip) and sequence diagnostics.
    `;
    
    try {
      const session = this.getOrCreateSession();
      // We use the non-streaming send for context injection
      await session.sendMessage({ message: contextPayload }); 
    } catch (e) {
      console.error("Failed to inject context", e);
    }
  }
}

export const geminiService = new GeminiService();