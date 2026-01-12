import { GoogleGenAI, Type, Chat } from "@google/genai";
import { 
  SYSTEM_INSTRUCTION_PERCEPTION, 
  SYSTEM_INSTRUCTION_INTERPRETATION, 
  SYSTEM_INSTRUCTION_REASONING, 
  SYSTEM_INSTRUCTION_QUESTION_WORKSPACE
} from "../constants";
import { AnalysisResult, OwnershipContext, UserRole } from "../types";

const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

interface InterpretationResult {
  subject: string;
  topic: string;
  intent: 'solution' | 'explanation' | 'both';
  ownership: OwnershipContext;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private currentSession: Chat | null = null;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key is missing.");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || '' });
  }

  // --- Session Lifecycle Management ---
  
  private getOrCreateSession(): Chat {
    if (!this.currentSession) {
      this.currentSession = this.ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_QUESTION_WORKSPACE,
          temperature: 0.7,
        }
      });
    }
    return this.currentSession;
  }

  public createQuestionSession(): Chat {
    return this.ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_QUESTION_WORKSPACE,
        temperature: 0.7,
      }
    });
  }

  public endSession() {
    this.currentSession = null;
  }

  // --- Capability 1: Analysis Execution (Stateless) ---

  async perceive(base64Image: string, mimeType: string): Promise<string> {
    try {
      // Use gemini-3-flash-preview for PDFs as it handles documents well.
      // Use existing model for images.
      const model = mimeType === 'application/pdf' ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-image'; 
      const response = await this.ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: "Extract all legible text from this content. Describe the layout briefly." }
          ]
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_PERCEPTION,
          temperature: 0.1, 
        }
      });
      return response.text || "";
    } catch (e) {
      console.error("Perception failed", e);
      throw new Error("Unable to read the document.");
    }
  }

  async interpret(extractedText: string): Promise<InterpretationResult> {
    try {
      const model = 'gemini-3-flash-preview';
      const response = await this.ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: `Analyzed Text: ${extractedText}` }]
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_INTERPRETATION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              topic: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              intent: { 
                  type: Type.STRING, 
                  enum: ["solution", "explanation", "both"],
                  description: "User expectation: 'solution' (answer/steps), 'explanation' (guidance/why), or 'both'."
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
          }
        }
      });
      const jsonText = cleanJsonString(response.text || "{}");
      return JSON.parse(jsonText);
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
    mode: 'fast' | 'deep', // Performance mode routing
    historyContext?: string, // Longitudinal Intelligence
    userRole?: UserRole // Role context for Teacher Insight Moments
  ): Promise<AnalysisResult> {
    try {
      // Fast Path: Use Flash for < 5s response on simple inputs
      // Deep Path: Use Pro for complex reasoning
      const model = mode === 'fast' ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
      
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

      const parts: any[] = [{ text: prompt }];
      if (base64Image && mimeType) {
          parts.unshift({ inlineData: { data: base64Image, mimeType } });
      }

      const response = await this.ai.models.generateContent({
        model,
        contents: {
            parts
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_REASONING,
          responseMimeType: "application/json",
           responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.STRING, description: "Numeric score or Letter grade" },
                  label: { type: Type.STRING, description: "Short descriptive label" },
                  reasoning: { type: Type.STRING, description: "Why this score was given" }
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
              teacher_insight: { 
                type: Type.STRING, 
                description: "Optional, brief instructional cue for teachers." 
              }
            }
          }
        }
      });

      const jsonText = cleanJsonString(response.text || "{}");
      const data = JSON.parse(jsonText);
      
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
        conceptStability: data.concept_stability, // Map internal stability signal
        teacherInsight: data.teacher_insight, // Map Teacher Insight Moment
        ownership: context.ownership, // Pass ownership data through
        rawText: extractedText
      };

      this.injectAnalysisContext(result);

      return result;

    } catch (e) {
      console.error("Reasoning failed", e);
      throw new Error("Eduvane could not complete the diagnosis.");
    }
  }

  // --- Capability 2: Learning Task Execution (Stateful) ---

  async streamLearningTask(message: string, userRole?: UserRole): Promise<any> {
    const session = this.getOrCreateSession();
    // Inject role context so the model can apply Role-Governed Solving Logic
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
      await session.sendMessage({ message: contextPayload }); 
    } catch (e) {
      console.error("Failed to inject context", e);
    }
  }
}

export const geminiService = new GeminiService();