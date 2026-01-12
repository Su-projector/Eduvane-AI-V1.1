import { geminiService } from './geminiService';
import { UnifiedInput, OrchestratorEvent, AnalysisPhase, Submission, UserRole } from '../types';
import { saveSubmission, getUserProfile, getRecentInsights } from './persistenceService';
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
   * LINGUISTIC VARIABILITY LAYER (v1.1)
   * Ensures responses are fresh but intent-anchored.
   */
  private getVariedResponse(intent: 'GREETING' | 'CONTINUITY' | 'FOLLOW_UP_ANALYSIS' | 'FOLLOW_UP_TASK', context: { role?: UserRole, name?: string }): string {
    const nameStr = context.name ? `, ${context.name}` : '';
    
    // 1. GREETINGS (Welcome + Role Alignment)
    if (intent === 'GREETING') {
        if (context.role === 'TEACHER') {
            return this.selectVariant([
                `Hello${nameStr}. As a teacher, I can help you grade efficiently, identify class-wide learning gaps, and generate targeted assessments.\n\nUpload a student submission to begin, or describe a topic you need questions for.`,
                `Welcome${nameStr}. My goal is to streamline your grading and provide insight into student needs.\n\nTo begin, you can upload a student's work or describe a topic for new questions.`,
                `Good to see you${nameStr}. You can use me to analyze student performance or generate targeted practice materials.\n\nI'm ready when you are—just upload a file or ask for a specific resource.`
            ]);
        } else if (context.role === 'STUDENT') {
            return this.selectVariant([
                `Hi${nameStr}. I'm here to help you strengthen your understanding. I can check your work for gaps or create practice questions for you.\n\nUpload your work whenever you're ready.`,
                `Hello${nameStr}. Let's focus on improving your grasp of the material. I can analyze your answers or set up a practice session.\n\nFeel free to upload an image or ask a question.`,
                `Welcome${nameStr}. I can act as your study partner—reviewing your solutions or generating new problems to solve.\n\nYou can start by sharing your work, and we'll take it from there.`
            ]);
        } else {
            return this.selectVariant([
                `Nice to meet you${nameStr}. I’m Eduvane — a smart classroom feedback engine.\n\nTo help me align my feedback, are you a Teacher or a Student?`,
                `Hello${nameStr}. I am Eduvane. I provide feedback and insights for the classroom.\n\nTo give you the right support, I need to know: are you a Teacher or a Student?`,
                `Hi${nameStr}. I'm Eduvane. My purpose is to turn student work into learning intelligence.\n\nAre you using this as a Teacher or a Student?`
            ]);
        }
    }

    // 2. CONTINUITY (Acknowledgement)
    if (intent === 'CONTINUITY') {
        return this.selectVariant([
            `I'm listening${nameStr}. What would you like to work on?`,
            `I'm ready${nameStr}. You can upload an answer or tell me what you need.`,
            `I'm here${nameStr}. How can I support your learning right now?`,
            `Go ahead${nameStr}. I'm ready to analyze work or generate questions.`
        ]);
    }

    // 3. FOLLOW-UP (Post-Analysis Transition)
    if (intent === 'FOLLOW_UP_ANALYSIS') {
        if (context.role === 'TEACHER') {
             return this.selectVariant([
                 "Analysis complete. I've highlighted the student's key gaps.\n\nWould you like to generate a practice set based on these errors?",
                 "I've finished the diagnosis. You can see the specific feedback above.\n\nShould we create some targeted questions to address these issues?",
                 "The assessment is ready. I've noted the main areas for improvement.\n\nWould you like to generate follow-up exercises for this student?"
             ]);
        } else if (context.role === 'STUDENT') {
             return this.selectVariant([
                 "I've analyzed your work. Check the feedback for tips.\n\nWant to try a few practice questions to improve this score?",
                 "I've looked through your solution. The feedback above details where you stand.\n\nShall we try some practice problems to reinforce this?",
                 "Analysis done. I've pointed out a few things to watch for.\n\nWould you like to generate a quick quiz to practice these concepts?"
             ]);
        } else {
             return this.selectVariant([
                 "Analysis complete. You can upload another answer for review,\nor I can generate practice questions focused on the areas identified.",
                 "I've completed the review. Feel free to upload more work, or ask me to create a practice set.",
                 "The feedback is ready. We can move on to a new upload, or I can generate questions based on this topic."
             ]);
        }
    }

    // 4. FOLLOW-UP (Post-Task Transition)
    if (intent === 'FOLLOW_UP_TASK') {
        if (context.role === 'TEACHER') {
            return this.selectVariant([
                "You can copy these for your class. Would you like me to create an answer key?",
                "Here is the practice material. I can also generate the solutions if you need them.",
                "Questions generated. Let me know if you need an answer key or more variations."
            ]);
        } else {
             return this.selectVariant([
                "Try solving these. You can upload your answers here for me to check.",
                "Here are some practice problems. When you're done, upload a photo and I'll review it.",
                "Give these a try. I can grade your work whenever you're ready to upload it."
            ]);
        }
    }

    return '';
  }

  private selectVariant(variants: string[]): string {
    return variants[Math.floor(Math.random() * variants.length)];
  }

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
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : undefined;
                 
                 // CASE 1: TEACHER
                 if (this.state.userRole === 'TEACHER') {
                    const pitch = this.getVariedResponse('GREETING', { role: 'TEACHER', name: firstName });
                    yield { type: 'STREAM_CHUNK', text: pitch };
                 }
                 // CASE 2: STUDENT
                 else if (this.state.userRole === 'STUDENT') {
                    const pitch = this.getVariedResponse('GREETING', { role: 'STUDENT', name: firstName });
                    yield { type: 'STREAM_CHUNK', text: pitch };
                 }
                 // CASE 3: UNKNOWN (Ask Once)
                 else {
                     if (!this.state.roleAsked) {
                         this.state.roleAsked = true;
                         const pitch = this.getVariedResponse('GREETING', { role: undefined, name: firstName });
                         yield { type: 'STREAM_CHUNK', text: pitch };
                     } else {
                         // Fallback if they ignored the question previously
                         const pitch = this.getVariedResponse('CONTINUITY', { name: firstName });
                         yield { type: 'STREAM_CHUNK', text: pitch };
                     }
                 }
                 
                 yield { type: 'TASK_COMPLETE' };
                 return; // Stop processing
             } 
             
             // Scenario: Continuity (User chatting after intro)
             else {
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : undefined;
                 const pitch = this.getVariedResponse('CONTINUITY', { name: firstName });
                 yield { type: 'STREAM_CHUNK', text: pitch };
                 yield { type: 'TASK_COMPLETE' };
                 return;
             }
        }
        
        // B. LEARNING TASK PIPELINE (Text only)
        // Note: We now treat implicit text questions as Tasks via this pipeline.
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

        // Step 3.5: History Context Retrieval (Longitudinal Pattern Recognition)
        let historyContext = "";
        if (!isGuest && context.subject) {
            historyContext = getRecentInsights(context.subject);
        }
        
        // Step 4: Reasoning
        const result = await geminiService.reason(
          base64, 
          input.file.type, 
          extractedText, 
          context, 
          input.text,
          mode,
          historyContext, // Inject history here
          this.state.userRole // Inject User Role for Teacher Insight Moments
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

        // Step 5: Role-Aware Continuity & Teacher Insight Moments
        let followUpText = "";
        
        if (this.state.userRole === 'TEACHER' && result.teacherInsight) {
            // Check for Teacher Insight Moment (specific override)
             followUpText = `${result.teacherInsight}\n\nWould you like to generate a practice set based on these errors?`;
        } else {
             // Standard Varied Response
             followUpText = this.getVariedResponse('FOLLOW_UP_ANALYSIS', { role: this.state.userRole });
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
        // v1.1 Update: Pass User Role to enable Role-Governed Solving Logic
        const stream = await geminiService.streamLearningTask(input.text, this.state.userRole);
        
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
                yield { type: 'STREAM_CHUNK', text: c.text };
            }
        }
        
        yield { type: 'TASK_COMPLETE' };

        // Post-Generation Continuity
        // Only trigger follow-up if it looks like a task completion, not just chat
        if (this.isTaskIntent(input.text)) {
            const followUpText = this.getVariedResponse('FOLLOW_UP_TASK', { role: this.state.userRole });
            yield { type: 'FOLLOW_UP', text: followUpText };
        }

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
    // Broaden implicit detection for Text-Based Question Recognition (math symbols, question words)
    const implicitMath = /[\d=+\-*/^]/.test(t) && t.length > 5;
    const implicitQuestion = /^(what|how|calculate|find|explain|why)\s/i.test(t);

    return taskKeywords.some(k => t.includes(k)) || implicitMath || implicitQuestion;
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