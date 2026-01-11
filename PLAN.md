# Eduvane AI — Foundation & Implementation Plan

## A. Understanding Confirmation

**What Eduvane AI is:**
Eduvane AI is a supportive learning intelligence platform designed to analyze student work (handwritten or digital) and extract actionable insights. It serves as a diagnostic companion that surfaces patterns in understanding, misconceptions, and skill maturity. It is a tool for revelation and support, prioritizing clarity and equity.

**The Landing Page Strategy:**
The entry point must be calm, intelligent, and infrastructure-like. It prioritizes "Get Started" (Sign Up) to encourage persistence but offers a respectful "Guest Mode" for cautious users. It avoids marketing fluff and urgency.

## B. Implementation Plan

### 1. System Architecture (Revised)
*   **Router:** `App.tsx` manages high-level views (`LANDING`, `SIGN_UP`, `SIGN_IN`, `APP`).
*   **Auth State:** A simplified `userMode` (Guest vs. Authenticated) determines feature availability (specifically data persistence).
*   **Frontend:** React 18+ (SPA) with TypeScript.
*   **Styling:** Tailwind CSS using the strict "Academic & Insight" color palette.

### 2. View Breakdown
*   **`LandingPage`:** The calm, confident storefront.
    *   *Primary:* Sign Up (Confidence).
    *   *Tertiary:* Guest Access (Respect).
*   **`AuthViews`:** Minimalist forms for simulated authentication.
*   **`MainApp`:** The core analysis loop (Upload -> Perception -> Reasoning -> Result).
    *   *Logic update:* `persistenceService` is only called if the user is Authenticated.

### 3. Service/Module Breakdown
*   **`OrchestratorService` (GeminiService):** The central brain. It enforces the sequential flow.
*   **`PersistenceService`:** Handles reading/writing submission history to local storage (Disabled in Guest Mode).

### 4. Data Flow: Answer Upload & Analysis
1.  **Entry:** User chooses path (Auth or Guest).
2.  **Upload:** User provides Image/PDF.
3.  **State Change:** `status: 'perceiving'`.
4.  **Perception:** AI extracts raw text (OCR focus).
5.  **State Change:** `status: 'interpreting'`.
6.  **Interpretation:** AI determines subject/intent.
7.  **State Change:** `status: 'reasoning'`.
8.  **Reasoning:** AI generates Score, Feedback, Insights.
9.  **Output:** UI renders components.
10. **Persistence:** Saved *only* if Authenticated.

## C. Assumptions & Risks

**Assumptions:**
1.  The user has a valid API key for the GenAI service.
2.  The "Single User" scope implies all history is stored locally.

**Risks & Mitigation:**
*   **Risk:** Users confusing Guest mode with a "broken" account (data loss).
    *   *Mitigation:* Explicit, calm text on the Landing Page ("Try without signing in").
*   **Risk:** Tone Drift on Landing Page.
    *   *Mitigation:* Strict adherence to the "No Setup Required," "Instant Feedback" copy constraints. No animations.
