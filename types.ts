export enum AnalysisPhase {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING', // Unified phase for UX simplicity
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface FeedbackItem {
  type: 'strength' | 'gap' | 'neutral';
  text: string;
  reference?: string; 
}

export interface Insight {
  title: string;
  description: string;
  trend: 'stable' | 'improving' | 'declining' | 'new';
}

export interface GuidanceStep {
  step: string;
  rationale: string;
}

export interface HandwritingAnalysis {
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'illegible';
  feedback: string;
}

export interface ConceptStability {
  status: 'emerging' | 'unstable_pressure' | 'stabilizing' | 'robust' | 'unknown';
  evidence: string;
}

export interface StudentInfo {
  name?: string;
  class?: string;
  confidence: 'high' | 'medium' | 'low';
}

export type OwnershipContextType = 'student_direct' | 'teacher_uploaded_student_work';

export interface OwnershipContext {
  type: OwnershipContextType;
  student?: StudentInfo;
}

export interface AnalysisResult {
  id: string; // Links to Submission ID
  timestamp: number;
  subject: string;
  topic: string;
  score: {
    value: number | string; 
    label: string;
    reasoning: string;
  };
  feedback: FeedbackItem[];
  insights: Insight[];
  guidance: GuidanceStep[];
  handwriting?: HandwritingAnalysis; // New dimension
  conceptStability?: ConceptStability; // Internal intelligence signal (v1.1)
  ownership?: OwnershipContext; // Role-aware context
  teacherInsight?: string; // Teacher Insight Moment (v1.1) - Conversational cue
  rawText?: string;
}

// --- SUBMISSION LIFECYCLE ABSTRACTIONS ---

export type SubmissionStatus = 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';

export interface Submission {
  id: string;
  timestamp: number;
  status: SubmissionStatus;
  fileName?: string;
  result?: AnalysisResult;
  error?: string;
}

export interface HistoryItem {
  id: string;
  date: string;
  subject: string;
  topic: string;
  scoreLabel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  type: 'text' | 'analysis' | 'error';
  content?: string;
  analysisResult?: AnalysisResult;
  isStreaming?: boolean;
  phase?: AnalysisPhase; // For displaying orchestration status
}

// Orchestration Types
export type OrchestratorEvent = 
  | { type: 'PHASE_UPDATE'; phase: AnalysisPhase }
  | { type: 'STREAM_CHUNK'; text: string }
  | { type: 'SUBMISSION_COMPLETE'; submission: Submission }
  | { type: 'TASK_COMPLETE' }
  | { type: 'ERROR'; message: string }
  | { type: 'FOLLOW_UP'; text: string };

export interface UnifiedInput {
  text: string;
  file?: File;
}

export type UserRole = 'TEACHER' | 'STUDENT';

// --- SERVER MODE ABSTRACTIONS ---
// Decoupling from @google/genai SDK types for UI components

export interface IGenerationChunk {
  text: string;
}

export interface IChatSession {
  sendMessageStream(request: { message: string }): Promise<AsyncGenerator<IGenerationChunk>>;
  sendMessage(request: { message: string }): Promise<{ text: string }>;
}