import { geminiService } from './geminiService';
import { UnifiedInput, OrchestratorEvent, AnalysisPhase, Submission, UserRole } from '../types';
import { saveSubmission, getUserProfile } from './persistenceService';
import { GenerateContentResponse } from '@google/genai';

interface SessionState {
  hasIntroducedSelf: boolean;
  roleConfirmed: boolean;
  userRole?: UserRole;
  userName?: string;
  roleAsked: boolean;
  initialized: boolean;
}

/**
 * EDUVANE AI ORCHESTRATOR
 * Authority: Single point of truth for intent detection and pipeline routing.
 */
export class OrchestratorService {

  private state: SessionState = {
    hasIntroducedSelf: false,
    roleConfirmed: false,
    roleAsked: false,
    initialized: false
  };

  /**
   * Process a UnifiedInput from the UI.
   */
  async *processInput(input: UnifiedInput, isGuest: boolean): AsyncGenerator<OrchestratorEvent> {
    
    // 0. INITIALIZATION & DATA LOADING
    if (!this.state.initialized) {
        if (!isGuest) {
            const profile = getUserProfile();
            if (profile) {
                this.state.userRole = profile.role;
                this.state.userName = profile.name;
                this.state.roleConfirmed = !!profile.role;
            }
        }
        this.state.initialized = true;
    }

    // --- 1. IMMEDIATE FILE PROCESSING (Explicit Task) ---
    if (input.file) {
      this.state.hasIntroducedSelf = true;
      // Proceed to Analysis Pipeline below...
    }
    
    // --- 2. TEXT INPUT PROCESSING ---
    else if (input.text) {
        const text = input.text;
        
        // CLASSIFY INTENT
        const isTask = this.isTaskIntent(text);
        const isConversational = this.isConversationalIntent(text);
        const detectedIdentity = this.extractIdentity(text);

        // Update State with any new identity info
        if (detectedIdentity.name) this.state.userName = detectedIdentity.name;
        if (detectedIdentity.role) {
            this.state.userRole = detectedIdentity.role;
            this.state.roleConfirmed = true;
        }
        
        // A. CONVERSATIONAL / IDENTITY HANDLING
        if (!isTask && (isConversational || detectedIdentity.name || detectedIdentity.role || this.state.roleAsked)) {
             
             // If we just asked for the role and the user responded
             if (this.state.roleAsked && !this.state.roleConfirmed) {
                 // Try to parse role from simple answers ("Teacher", "Student")
                 const roleAttempt = this.parseSimpleRole(text);
                 if (roleAttempt) {
                     this.state.userRole = roleAttempt;
                     this.state.roleConfirmed = true;
                     this.state.roleAsked = false;
                     // Proceed to yield acknowledged intro below
                 } else {
                     // Ambiguous response to role question? Treat as continuation.
                     this.state.roleAsked = false; 
                 }
             }

             // Scenario: First Contact / Orientation / Re-Orientation
             if (!this.state.hasIntroducedSelf || detectedIdentity.role || detectedIdentity.name) {
                 this.state.hasIntroducedSelf = true;
                 
                 // Personalization: Extract First Name
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : '';
                 const nameStr = firstName ? `, ${firstName}` : '';
                 
                 // CASE 1: TEACHER
                 if (this.state.userRole === 'TEACHER') {
                    const pitch = `Hello${nameStr}. As a teacher, I can help you grade efficiently, identify class-wide learning gaps, and generate targeted assessments.\n\nUpload a student submission to begin, or describe a topic you need questions for.`;
                    yield { type: 'STREAM_CHUNK', text: pitch };
                 }
                 // CASE 2: STUDENT
                 else if (this.state.userRole === 'STUDENT') {
                    const pitch = `Hi${nameStr}. I'm here to help you strengthen your understanding. I can analyze your answers to spot mistakes or generate practice questions to help you prepare.\n\nUpload your work when you're ready.`;
                    yield { type: 'STREAM_CHUNK', text: pitch };
                 }
                 // CASE 3: UNKNOWN (Ask Once)
                 else {
                     if (!this.state.roleAsked) {
                         this.state.roleAsked = true;
                         const pitch = `Nice to meet you${nameStr}. I’m Eduvane — a smart classroom feedback engine.\n\nTo help me align my feedback, are you a Teacher or a Student?`;
                         yield { type: 'STREAM_CHUNK', text: pitch };
                     } else {
                         // Fallback if they ignored the question previously
                         const pitch = `I'm listening${nameStr}. You can upload an answer or tell me what you'd like to work on.`;
                         yield { type: 'STREAM_CHUNK', text: pitch };
                     }
                 }
                 
                 yield { type: 'TASK_COMPLETE' };
                 return; // Stop processing
             } 
             
             // Scenario: Continuity (User chatting after intro)
             else {
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : '';
                 const ack = firstName ? `I'm listening, ${firstName}.` : "I'm listening.";
                 yield { type: 'STREAM_CHUNK', text: `${ack} What would you like to work on?` };
                 yield { type: 'TASK_COMPLETE' };
                 return;
             }
        }
        
        // B. TASK HANDLING
        this.state.hasIntroducedSelf = true;
        // Fall through...
    }

    // --- PIPELINE EXECUTION ---

    // A. ANALYSIS PIPELINE (File present)
    if (input.file) {
      // 1. SUBMISSION CREATION
      const submissionId = crypto.randomUUID();
      const submission: Submission = {
        id: submissionId,
        timestamp: Date.now(),
        status: 'CREATED',
        fileName: input.file.name
      };

      // 2. LIFECYCLE: PROCESSING
      submission.status = 'PROCESSING';
      yield { type: 'PHASE_UPDATE', phase: AnalysisPhase.PROCESSING };
      
      try {
        const base64 = await this.fileToBase64(input.file);
        
        // Step 1: Perception
        const extractedText = await geminiService.perceive(base64, input.file.type);
        
        // Step 2: Routing
        const isFastPath = extractedText.length < 800;
        const mode = isFastPath ? 'fast' : 'deep';
        
        // Step 3: Interpretation
        const context = await geminiService.interpret(extractedText);
        
        // Step 4: Reasoning
        const result = await geminiService.reason(
          base64, 
          input.file.type, 
          extractedText, 
          context, 
          input.text,
          mode
        );
        
        result.id = submissionId;

        // 3. LIFECYCLE: COMPLETED
        submission.status = 'COMPLETED';
        submission.result = result;

        if (!isGuest) {
            saveSubmission(submission);
        }

        yield { type: 'SUBMISSION_COMPLETE', submission };
        yield { type: 'PHASE_UPDATE', phase: AnalysisPhase.COMPLETE };

        // Step 5: Role-Aware Continuity
        let followUpText = "";
        
        if (this.state.userRole === 'TEACHER') {
            followUpText = "Analysis complete. I've highlighted the student's key gaps.\n\nWould you like to generate a practice set based on these errors?";
        } else if (this.state.userRole === 'STUDENT') {
            followUpText = "I've analyzed your work. Check the feedback for tips.\n\nWant to try a few practice questions to improve this score?";
        } else {
            // Default Neutral
            followUpText = "Analysis complete. You can upload another answer for review,\nor I can generate practice questions focused on the areas identified.";
        }

        yield { type: 'FOLLOW_UP', text: followUpText };

      } catch (error: any) {
        submission.status = 'ERROR';
        submission.error = error.message;
        yield { type: 'ERROR', message: error.message || "Analysis pipeline failed." };
        yield { type: 'PHASE_UPDATE', phase: AnalysisPhase.ERROR };
      }
      return;
    }

    // B. LEARNING TASK PIPELINE (Text only)
    if (input.text) {
      try {
        const stream = await geminiService.streamLearningTask(input.text);
        
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
                yield { type: 'STREAM_CHUNK', text: c.text };
            }
        }
        
        yield { type: 'TASK_COMPLETE' };

        // Post-Generation Continuity
        const followUpText = this.state.userRole === 'TEACHER' 
            ? "You can copy these for your class. Would you like me to create an answer key?"
            : "Try solving these. You can upload your answers here for me to check.";
            
        yield { type: 'FOLLOW_UP', text: followUpText };

      } catch (error: any) {
        yield { type: 'ERROR', message: "I encountered an issue processing that task." };
      }
      return;
    }
  }

  resetSession() {
    geminiService.endSession();
    this.state = {
        hasIntroducedSelf: false,
        roleConfirmed: false,
        roleAsked: false,
        initialized: false
    };
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- IDENTITY EXTRACTION UTILS ---

  private extractIdentity(text: string): { name?: string, role?: UserRole } {
    const result: { name?: string, role?: UserRole } = {};
    const t = text.trim();

    // 1. Extract Name
    // "I'm John", "I am Abdusobur Sulaimon", "My name is X", "Call me Y"
    const nameMatch = t.match(/(?:^|\s)(?:i['’]m|i\s+am|my\s+name\s+is|call\s+me)\s+([a-zA-Z\s]+?)(?=$|[\.!,])/i);
    if (nameMatch && nameMatch[1]) {
        let name = nameMatch[1].trim();
        const blackList = ['a teacher', 'a student', 'ready', 'here', 'listening', 'eduvane'];
        if (!blackList.includes(name.toLowerCase())) {
            result.name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
    }

    // 2. Extract Role
    // "I am a teacher", "I'm a student", "As a teacher"
    if (/(?:^|\s)(?:teacher|educator|professor|instructor)/i.test(t)) {
        result.role = 'TEACHER';
    } else if (/(?:^|\s)(?:student|learner|pupil)/i.test(t)) {
        result.role = 'STUDENT';
    }

    return result;
  }

  private parseSimpleRole(text: string): UserRole | null {
      const t = text.toLowerCase();
      if (t.includes('teacher') || t.includes('educator')) return 'TEACHER';
      if (t.includes('student') || t.includes('learner')) return 'STUDENT';
      return null;
  }

  private isTaskIntent(text: string): boolean {
    const t = text.trim().toLowerCase();
    const taskKeywords = [
        'generate', 'create', 'make', 'analyze', 'check', 'quiz', 'test', 
        'practice', 'questions', 'exam', 'exercises', 'grade', 'assess', 'solve'
    ];
    return taskKeywords.some(k => t.includes(k));
  }

  private isConversationalIntent(text: string): boolean {
    const t = text.trim().toLowerCase();
    const clean = t.replace(/[^\w\s]/g, '').trim();

    const greetings = ['hi', 'hello', 'hey', 'greetings', 'yo', 'hiya', 'sup', 'howdy', 'good morning'];
    const identityStart = ['i am ', 'im ', 'my name is ', 'call me '];
    const phatic = ['ok', 'okay', 'thanks', 'thank you', 'cool', 'nice'];
    const questions = ['who are you', 'what is eduvane', 'what is this', 'what can you do'];

    if (greetings.some(g => clean === g || clean.startsWith(g + ' '))) return true;
    if (identityStart.some(p => clean.startsWith(p) || clean.includes(' ' + p))) return true;
    if (phatic.includes(clean)) return true;
    if (questions.some(q => t.includes(q))) return true;

    return false;
  }
}

export const orchestratorService = new OrchestratorService();