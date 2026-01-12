import { HistoryItem, Submission, UserRole } from "../types";

const HISTORY_KEY = 'eduvane_history_v1';
const SUBMISSIONS_KEY = 'eduvane_submissions_v1'; // Renamed to reflect new atomic unit
const PROFILE_KEY = 'eduvane_profile_v1';

export interface UserProfile {
  name: string;
  role?: UserRole; // Optional to support OAuth-first flows where role is determined later
  email?: string;
  googleId?: string;
}

// Helper to get submissions map
const getSubmissionsMap = (): Record<string, Submission> => {
  try {
    const raw = localStorage.getItem(SUBMISSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

export const saveSubmission = (submission: Submission) => {
  try {
    if (!submission.result) return; // Only save submissions with results

    // 1. Update History List (Summary)
    const historyItem: HistoryItem = {
      id: submission.id,
      date: new Date(submission.timestamp).toISOString(),
      subject: submission.result.subject,
      topic: submission.result.topic,
      scoreLabel: submission.result.score.label
    };
    
    const existingRaw = localStorage.getItem(HISTORY_KEY);
    const existing: HistoryItem[] = existingRaw ? JSON.parse(existingRaw) : [];
    
    // Add to top, limit to 50 items for storage sanity
    const updatedHistory = [historyItem, ...existing].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));

    // 2. Save Full Submission (Atomic Unit)
    const submissionsMap = getSubmissionsMap();
    submissionsMap[submission.id] = submission;
    
    // Prune map to match history
    const activeIds = new Set(updatedHistory.map(h => h.id));
    const prunedMap: Record<string, Submission> = {};
    activeIds.forEach(id => {
        if (submissionsMap[id]) prunedMap[id] = submissionsMap[id];
    });

    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(prunedMap));

  } catch (e) {
    console.error("Failed to save submission", e);
  }
};

export const getHistory = (): HistoryItem[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const getSubmissionById = (id: string): Submission | null => {
    const map = getSubmissionsMap();
    return map[id] || null;
};

export const getResultById = (id: string) => {
    const sub = getSubmissionById(id);
    return sub?.result || null;
};

/**
 * Retrieves a semantic summary of recent insights for a specific subject.
 * Used for longitudinal pattern recognition in v1.1.
 */
export const getRecentInsights = (subject: string): string => {
  try {
    const map = getSubmissionsMap();
    const history = getHistory();
    
    // Filter for same subject, take last 5 to form a context window
    const relevantIds = history
      .filter(h => h.subject && h.subject.toLowerCase() === subject.toLowerCase())
      .slice(0, 5)
      .map(h => h.id);

    if (relevantIds.length === 0) return "";

    const contextLines: string[] = [];
    
    relevantIds.forEach(id => {
      const sub = map[id];
      if (sub?.result) {
        // Extract Gaps (Learning Needs)
        const gaps = sub.result.feedback
          .filter(f => f.type === 'gap')
          .map(f => f.text)
          .join('; ');

        // Extract Strengths (For Feedback Compression)
        const strengths = sub.result.feedback
          .filter(f => f.type === 'strength')
          .map(f => f.text)
          .join('; ');

        // Extract Insights (Previous Patterns)
        const insights = sub.result.insights
           .map(i => i.title)
           .join('; ');
        
        // Extract Stability Signals (v1.1)
        const stability = sub.result.conceptStability;
        const stabilityStr = stability && stability.status !== 'unknown' 
            ? `Stability: ${stability.status} (${stability.evidence})` 
            : '';

        // Extract Handwriting Signals (v1.1 Handwriting Impact Memory)
        const handwriting = sub.result.handwriting?.feedback || '';
        
        if (gaps || strengths || insights || stabilityStr || handwriting) {
           const dateStr = new Date(sub.timestamp).toLocaleDateString();
           contextLines.push(`[${dateStr}] Topic: ${sub.result.topic}. Gaps: ${gaps}. Strengths: ${strengths}. Handwriting: ${handwriting}. Previous Signals: ${insights}. ${stabilityStr}`);
        }
      }
    });

    return contextLines.join('\n');
  } catch (e) {
    return "";
  }
};

export const saveUserProfile = (profile: UserProfile) => {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.error("Failed to save profile", e);
    }
};

export const getUserProfile = (): UserProfile | null => {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return null;
        
        const parsed = JSON.parse(raw);
        // Handle legacy format where it might just be { role: ... } without name
        if (parsed.role && !parsed.name) {
            return { role: parsed.role, name: '' };
        }
        return parsed;
    } catch (e) {
        return null;
    }
};

export const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SUBMISSIONS_KEY);
    localStorage.removeItem(PROFILE_KEY);
};