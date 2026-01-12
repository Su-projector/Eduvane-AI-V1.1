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
                `Good to see you${nameStr}. You can use me to analyze student performance or generate targeted practice materials.\n\nI'm ready when you are—just upload a file or ask for a specific resource.`,
                `Hi${nameStr}. I'm here to handle the grading details so you can focus on teaching. \n\nUpload a submission or let me know what quiz you need generated today.`
            ]);
        } else if (context.role === 'STUDENT') {
            return this.selectVariant([
                `Hi${nameStr}. I'm here to help you strengthen your understanding. I can check your work for gaps or create practice questions for you.\n\nUpload your work whenever you're ready.`,
                `Hello${nameStr}. Let's focus on improving your grasp of the material. I can analyze your answers or set up a practice session.\n\nFeel free to upload an image or ask a question.`,
                `Welcome${nameStr}. I can act as your study partner—reviewing your solutions or generating new problems to solve.\n\nYou can start by sharing your work, and we'll take it from there.`,
                `Hey${nameStr}. Ready to work on this? \n\nYou can upload a problem you're stuck on, or I can give you some practice questions.`
            ]);
        } else {
            return this.selectVariant([
                `Nice to meet you${nameStr}. I’m Eduvane — a smart classroom feedback engine.\n\nTo help me align my feedback, are you a Teacher or a Student?`,
                `Hello${nameStr}. I am Eduvane. I provide feedback and insights for the classroom.\n\nTo give you the right support, I need to know: are you a Teacher or a Student?`,
                `Hi${nameStr}. I'm Eduvane. My purpose is to turn student work into learning intelligence.\n\nAre you using this as a Teacher or a Student?`,
                `Greetings${nameStr}. I analyze academic work and generate learning materials. \n\nAre you a Teacher managing a class, or a Student looking for help?`
            ]);
        }
    }

    // 2. CONTINUITY (Acknowledgement)
    if (intent === 'CONTINUITY') {
        return this.selectVariant([
            `I'm listening${nameStr}. What would you like to work on?`,
            `I'm ready${nameStr}. You can upload an answer or tell me what you need.`,
            `I'm here${nameStr}. How can I support your learning right now?`,
            `Go ahead${nameStr}. I'm ready to analyze work or generate questions.`,
            `What's next${nameStr}? I can review another file or start a practice session.`,
            `Standing by. Do you have more work to upload, or a question to ask?`
        ]);
    }

    // 3. FOLLOW-UP (Post-Analysis Transition)
    if (intent === 'FOLLOW_UP_ANALYSIS') {
        if (context.role === 'TEACHER') {
             return this.selectVariant([
                 "Analysis complete. I've highlighted the student's key gaps.\n\nWould you like to generate a practice set based on these errors?",
                 "I've finished the diagnosis. You can see the specific feedback above.\n\nShould we create some targeted questions to address these issues?",
                 "The assessment is ready. I've noted the main areas for improvement.\n\nWould you like to generate follow-up exercises for this student?",
                 "Review complete. The feedback above details the logic gaps.\n\nI can generate a remedial quiz for this topic if you'd like."
             ]);
        } else if (context.role === 'STUDENT') {
             return this.selectVariant([
                 "I've analyzed your work. Check the feedback for tips.\n\nWant to try a few practice questions to improve this score?",
                 "I've looked through your solution. The feedback above details where you stand.\n\nShall we try some practice problems to reinforce this?",
                 "Analysis done. I've pointed out a few things to watch for.\n\nWould you like to generate a quick quiz to practice these concepts?",
                 "That's done. I found a few spots where the logic drifted.\n\nReady to try a similar problem to lock this in?"
             ]);
        } else {
             return this.selectVariant([
                 "Analysis complete. You can upload another answer for review,\nor I can generate practice questions focused on the areas identified.",
                 "I've completed the review. Feel free to upload more work, or ask me to create a practice set.",
                 "The feedback is ready. We can move on to a new upload, or I can generate questions based on this topic.",
                 "Result generated. Let me know if you want to practice this topic further."
             ]);
        }
    }

    // 4. FOLLOW-UP (Post-Task Transition)
    if (intent === 'FOLLOW_UP_TASK') {
        if (context.role === 'TEACHER') {
            return this.selectVariant([
                "You can copy these for your class. Would you like me to create an answer key?",
                "Here is the practice material. I can also generate the solutions if you need them.",
                "Questions generated. Let me know if you need an answer key or more variations.",
                "Here is the set. Shall I generate the corresponding detailed solutions?"
            ]);
        } else {
             return this.selectVariant([
                "Try solving these. You can upload your answers here for me to check.",
                "Here are some practice problems. When you're done, upload a photo and I'll review it.",
                "Give these a try. I can grade your work whenever you're ready to upload it.",
                "See how you do with these. I'm ready to review your answers whenever you upload them."
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

    let isAnalysisPipeline = false;
    let extractedText = "";
    let base64Image: string | undefined = undefined;
    let mimeType: string | undefined = undefined;

    // --- 1. DETERMINE PIPELINE & NORMALIZE INPUT ---
    // REPRESENTATION EQUIVALENCE AWARENESS: Treat files and submission-like text equivalently.

    if (input.file) {
        isAnalysisPipeline = true;
    } else if (input.text) {
        // Distinguish between Conversational Command (Task) vs. Text Submission (Analysis)
        const isSubmission = this.isSubmissionIntent(input.text);
        const isConversational = this.isConversationalIntent(input.text);

        if (isSubmission && !isConversational) {
            isAnalysisPipeline = true;
            extractedText = input.text; // Normalization: Text input is treated as extracted text
        }
    }

    // --- 2. IDENTITY CHECK (Conversation Loop) ---
    // Only intercept if NOT entering the analysis pipeline (or if we really need to greet first)
    // For simplicity, if it's a submission, we proceed to analysis. If it's chat/intro, we handle here.
    
    if (!isAnalysisPipeline && input.text) {
        const text = input.text;
        const detectedIdentity = this.extractIdentity(text);
        
        // Update State
        if (detectedIdentity.name) this.state.userName = detectedIdentity.name;
        if (detectedIdentity.role) {
            this.state.userRole = detectedIdentity.role;
            this.state.roleConfirmed = true;
        }

        const isTask = this.isGenerationIntent(text);
        const isChat = this.isConversationalIntent(text);

        // If it's strictly conversational or identifying, handle it here.
        if (!isTask && (isChat || detectedIdentity.name || detectedIdentity.role || this.state.roleAsked)) {
             
             // Role Confirmation Logic
             if (this.state.roleAsked && !this.state.roleConfirmed) {
                 const roleAttempt = this.parseSimpleRole(text);
                 if (roleAttempt) {
                     this.state.userRole = roleAttempt;
                     this.state.roleConfirmed = true;
                     this.state.roleAsked = false;
                 } else {
                     this.state.roleAsked = false; 
                 }
             }

             // Greeting Logic
             if (!this.state.hasIntroducedSelf || detectedIdentity.role || detectedIdentity.name) {
                 this.state.hasIntroducedSelf = true;
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : undefined;
                 
                 let pitch = "";
                 if (this.state.userRole === 'TEACHER') {
                    pitch = this.getVariedResponse('GREETING', { role: 'TEACHER', name: firstName });
                 } else if (this.state.userRole === 'STUDENT') {
                    pitch = this.getVariedResponse('GREETING', { role: 'STUDENT', name: firstName });
                 } else {
                     if (!this.state.roleAsked) {
                         this.state.roleAsked = true;
                         pitch = this.getVariedResponse('GREETING', { role: undefined, name: firstName });
                     } else {
                         pitch = this.getVariedResponse('CONTINUITY', { name: firstName });
                     }
                 }
                 yield { type: 'STREAM_CHUNK', text: pitch };
                 yield { type: 'TASK_COMPLETE' };
                 return;
             } else {
                 // Simple Continuity
                 const firstName = this.state.userName ? this.state.userName.split(' ')[0] : undefined;
                 const pitch = this.getVariedResponse('CONTINUITY', { name: firstName });
                 yield { type: 'STREAM_CHUNK', text: pitch };
                 yield { type: 'TASK_COMPLETE' };
                 return;
             }
        }
        
        this.state.hasIntroducedSelf = true;
    }

    // --- 3. PIPELINE EXECUTION ---

    // A. ANALYSIS PIPELINE (File OR Text Submission)
    if (isAnalysisPipeline) {
      // 1. SUBMISSION CREATION
      const submissionId = crypto.randomUUID();
      const submission: Submission = {
        id: submissionId,
        timestamp: Date.now(),
        status: 'CREATED',
        fileName: input.file ? input.file.name : 'Text Submission'
      };

      // 2. LIFECYCLE: PROCESSING
      submission.status = 'PROCESSING';
      yield { type: 'PHASE_UPDATE', phase: AnalysisPhase.PROCESSING };
      
      try {
        if (input.file) {
            base64Image = await this.fileToBase64(input.file);
            mimeType = input.file.type;
            // Step 1: Perception (only if image)
            extractedText = await geminiService.perceive(base64Image, mimeType);
        } else {
            // Extracted text already set to input.text
        }
        
        // Step 2: Routing
        const isFastPath = extractedText.length < 800;
        const mode = isFastPath ? 'fast' : 'deep';
        
        // Step 3: Interpretation
        const context = await geminiService.interpret(extractedText);

        // Step 3.5: History Context Retrieval
        let historyContext = "";
        if (!isGuest && context.subject) {
            historyContext = getRecentInsights(context.subject);
        }
        
        // Step 4: Reasoning (Format Agnostic)
        const result = await geminiService.reason(
          base64Image, 
          mimeType, 
          extractedText, 
          context, 
          input.text, // User instruction override
          mode,
          historyContext, 
          this.state.userRole
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
        if (this.state.userRole === 'TEACHER' && result.teacherInsight) {
             followUpText = `${result.teacherInsight}\n\nWould you like to generate a practice set based on these errors?`;
        } else {
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

    // B. LEARNING TASK PIPELINE (General Chat / Generation)
    if (input.text) {
      try {
        const stream = await geminiService.streamLearningTask(input.text, this.state.userRole);
        
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
                yield { type: 'STREAM_CHUNK', text: c.text };
            }
        }
        yield { type: 'TASK_COMPLETE' };

        if (this.isGenerationIntent(input.text)) {
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

  // --- INTENT CLASSIFICATION UTILS ---

  private extractIdentity(text: string): { name?: string, role?: UserRole } {
    const result: { name?: string, role?: UserRole } = {};
    const t = text.trim();
    const nameMatch = t.match(/(?:^|\s)(?:i['’]m|i\s+am|my\s+name\s+is|call\s+me)\s+([a-zA-Z\s]+?)(?=$|[\.!,])/i);
    if (nameMatch && nameMatch[1]) {
        let name = nameMatch[1].trim();
        const blackList = ['a teacher', 'a student', 'ready', 'here', 'listening', 'eduvane'];
        if (!blackList.includes(name.toLowerCase())) {
            result.name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
    }
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

  private isGenerationIntent(text: string): boolean {
    const t = text.trim().toLowerCase();
    const genKeywords = ['generate', 'create', 'make', 'quiz', 'test', 'practice', 'questions', 'exercises'];
    return genKeywords.some(k => t.includes(k));
  }

  private isSubmissionIntent(text: string): boolean {
      const t = text.trim().toLowerCase();
      // Submission Keywords
      const subKeywords = ['solve', 'calculate', 'find', 'evaluate', 'simplify', 'check', 'analyze', 'assess'];
      // Implicit Math signals (longer than 5 chars to avoid simple words)
      const hasMath = /[\d=+\-*/^]/.test(t) && t.length > 5;
      // "What is..." can be chat, but often is a problem. "Explain..." is chat.
      
      const hasKeyword = subKeywords.some(k => t.includes(k));
      return hasKeyword || hasMath;
  }

  private isConversationalIntent(text: string): boolean {
    const t = text.trim().toLowerCase();
    const clean = t.replace(/[^\w\s]/g, '').trim();

    const greetings = ['hi', 'hello', 'hey', 'greetings', 'yo', 'hiya', 'sup', 'howdy', 'good morning'];
    const identityStart = ['i am ', 'im ', 'my name is ', 'call me '];
    const phatic = ['ok', 'okay', 'thanks', 'thank you', 'cool', 'nice'];
    const questions = ['who are you', 'what is eduvane', 'what is this', 'what can you do', 'help'];

    if (greetings.some(g => clean === g || clean.startsWith(g + ' '))) return true;
    if (identityStart.some(p => clean.startsWith(p) || clean.includes(' ' + p))) return true;
    if (phatic.includes(clean)) return true;
    if (questions.some(q => t.includes(q))) return true;

    return false;
  }
}

export const orchestratorService = new OrchestratorService();