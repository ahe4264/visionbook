/* ─────────────────────────────────────────────────────────────────────
 *  activeReaderStateMachine.js
 *
 *  ActiveReader's event-driven tutor state machine — the *specialization*
 *  of the generic engine (lessonRuntime.js) for an interactive reading
 *  experience. Where the generic engine drives linear video/slides flows,
 *  this machine is reactive: every transition fires off a user action,
 *  not a Continue click.
 *
 *  Game-engine analogy:
 *
 *    LearnerState  ≈  player state  (the world's view of what the user
 *                                    is doing right now)
 *    StudentModel  ≈  save file     (long-term knowledge / mastery)
 *    Tutor         ≈  NPC behavior  (decides what to say/do next)
 *    Events        ≈  input events  (page turn, highlight, click, …)
 *
 *  Architecture (mirrors the slide diagram):
 *
 *  ┌──────────────────── INPUTS ─────────────────────────────────────┐
 *  │  user events  +  page text  +  concept graph  +  student model  │
 *  └──────────┬──────────────────────────────────────────────────────┘
 *             ▼
 *  ┌──────────────────── 1. LEARNER STATE  ──────────────────────────┐
 *  │  reading_idle        no signal, just turning pages              │
 *  │  reading_engaged     highlighting / annotating                  │
 *  │  on_known_concept    PDF region matches a concept node          │
 *  │  asked_question      typed in chat                              │
 *  │  struggling          wrong quiz, repeat Qs, backtracking        │
 *  │  mastered            concept passed N times                     │
 *  └──────────┬──────────────────────────────────────────────────────┘
 *             ▼
 *  ┌──────────────── 2. TUTOR DECISION LOOP ─────────────────────────┐
 *  │  (priority ladder — first matching rule wins)                   │
 *  │                                                                 │
 *  │  P0  struggling           →  REMEDIATE (figure + restated motiv)│
 *  │  P1  user asked Q         →  ANSWER (grounded in active concept)│
 *  │  P2  highlight on key qt  →  OFFER_ELABORATION (1-click probe)  │
 *  │  P3  dwell > 20s + concept→  ASK_COMPREHENSION (MCQ)            │
 *  │  P4  section just closed  →  RECAP_SECTION                      │
 *  │  --  otherwise            →  STAY_SILENT                        │
 *  └──────────┬──────────────────────────────────────────────────────┘
 *             ▼
 *  ┌──────────────── 3. TUTOR ACTIONS  ──────────────────────────────┐
 *  │  delivered as chat messages, MCQs, figure pops, recaps          │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 *  This file is pure logic. The React integration in App.js listens to
 *  the bus and renders actions as chat messages using existing UI.
 * ────────────────────────────────────────────────────────────────────── */

// ── 1. LEARNER STATES (the player state of the reader) ───────────────
export const LearnerState = Object.freeze({
  READING_IDLE:      'reading_idle',
  READING_ENGAGED:   'reading_engaged',
  ON_KNOWN_CONCEPT:  'on_known_concept',
  ASKED_QUESTION:    'asked_question',
  STRUGGLING:        'struggling',
  MASTERED:          'mastered',
});

// ── 2. TUTOR ACTION KINDS (what the tutor decides to do) ─────────────
export const TutorAction = Object.freeze({
  STAY_SILENT:        'stay_silent',
  ANSWER_QUESTION:    'answer_question',
  OFFER_ELABORATION:  'offer_elaboration',
  ASK_COMPREHENSION:  'ask_comprehension',
  REMEDIATE:          'remediate',
  RECAP_SECTION:      'recap_section',
});

// ── 3. EVENT KINDS (what flows in from the UI) ───────────────────────
export const Event = Object.freeze({
  PAGE_CHANGED:        'page_changed',         // {pageNum, pageText, activeConcepts}
  TEXT_HIGHLIGHTED:    'text_highlighted',     // {phrase, pageNum}
  ANNOTATION_MADE:     'annotation_made',      // {phrase, pageNum}
  FIGURE_CLICKED:      'figure_clicked',       // {figureId, conceptId?}
  QUESTION_ASKED:      'question_asked',       // {text}
  QUIZ_ANSWERED:       'quiz_answered',        // {conceptId, correct}
  DWELL_TICK:          'dwell_tick',           // {pageNum, secondsOnPage}
  BACKTRACK_DETECTED:  'backtrack_detected',   // {fromPage, toPage}
  SECTION_COMPLETED:   'section_completed',    // {sectionId, conceptIds}
});

// ── 4. Configurable thresholds — the "tuning knobs" ──────────────────
const DEFAULTS = {
  dwellThresholdSec:        20,   // P3: ask comprehension after this dwell
  struggleAfterNFails:       2,   // P0: enter STRUGGLING after this many fails
  masteryAfterNPasses:       2,   // mark concept mastered after N correct
  comprehensionCooldownSec: 90,   // don't ask twice within this window
  elaborationCooldownSec:   60,
  remediationCooldownSec:   30,
};

// ── 5. Minimal event bus (mirrors lessonRuntime.js for symmetry) ─────
class EventBus {
  constructor() { this._h = {}; }
  on(e, fn)   { (this._h[e] = this._h[e] || []).push(fn); return () => this.off(e, fn); }
  off(e, fn)  { const a = this._h[e]; if (a) { const i = a.indexOf(fn); if (i>=0) a.splice(i,1); } }
  emit(e, p)  { for (const fn of (this._h[e] || []).slice()) {
                  try { fn(p); } catch (err) { console.error(`[ar-tutor ${e}]`, err); } } }
}

// ── 6. The state machine ─────────────────────────────────────────────
export class ActiveReaderTutor {
  /**
   * @param {object} opts
   * @param {object} opts.thresholds      — overrides for DEFAULTS
   * @param {function} opts.onLogEvent    — (concept_id, event, payload) => void
   *                                        for persistent student-model logging
   */
  constructor(opts = {}) {
    this.thresholds   = { ...DEFAULTS, ...(opts.thresholds || {}) };
    this.onLogEvent   = opts.onLogEvent || (() => {});
    this.bus          = new EventBus();
    this.learnerState = LearnerState.READING_IDLE;
    this.activeConcepts = [];      // [{id, title, key_passage, content, ...}]
    this.currentPage  = null;
    this.dwellStart   = null;
    this.studentModel = new Map(); // conceptId → { attempts, passes, fails, mastered, lastProbedAt }
    this.lastActions  = new Map(); // actionKind → timestampMs (for cooldowns)
    this.recentQuestionsByConcept = new Map(); // conceptId → count
  }

  /** Subscribe to tutor actions. Returns unsubscribe fn. */
  onAction(fn) { return this.bus.on('action', fn); }

  /** Subscribe to learner-state transitions (for UI indicators). */
  onStateChange(fn) { return this.bus.on('learner_state', fn); }

  // ── per-concept book-keeping ────────────────────────────────────────
  _conceptSlot(conceptId) {
    if (!this.studentModel.has(conceptId)) {
      this.studentModel.set(conceptId, {
        attempts: 0, passes: 0, fails: 0, mastered: false,
        lastProbedAt: 0, struggling: false, elaboratedAt: 0,
      });
    }
    return this.studentModel.get(conceptId);
  }
  getStudentModel() {
    return Object.fromEntries(this.studentModel);
  }

  // ── cooldowns ───────────────────────────────────────────────────────
  _onCooldown(actionKind, seconds) {
    const last = this.lastActions.get(actionKind) || 0;
    return (Date.now() - last) < seconds * 1000;
  }
  _markAction(actionKind) {
    this.lastActions.set(actionKind, Date.now());
  }

  // ── learner-state computation ───────────────────────────────────────
  _setLearnerState(s, reason) {
    if (this.learnerState === s) return;
    const from = this.learnerState;
    this.learnerState = s;
    this.bus.emit('learner_state', { from, to: s, reason });
  }
  _recomputeLearnerState() {
    // Priority: STRUGGLING > ASKED_QUESTION > ON_KNOWN_CONCEPT
    //          > READING_ENGAGED > READING_IDLE
    const anyStruggling = this.activeConcepts.some(c =>
      this._conceptSlot(c.id).struggling);
    if (anyStruggling) return this._setLearnerState(LearnerState.STRUGGLING, 'wrong_or_repeat');
    if (this.activeConcepts.length) return this._setLearnerState(
      LearnerState.ON_KNOWN_CONCEPT, 'page_matches_concept');
    this._setLearnerState(LearnerState.READING_IDLE, 'no_active_concept');
  }

  // ── core event dispatch ─────────────────────────────────────────────
  dispatch(event, payload = {}) {
    switch (event) {
      case Event.PAGE_CHANGED:        return this._onPageChanged(payload);
      case Event.TEXT_HIGHLIGHTED:    return this._onHighlighted(payload);
      case Event.ANNOTATION_MADE:     return this._onAnnotated(payload);
      case Event.FIGURE_CLICKED:      return this._onFigureClicked(payload);
      case Event.QUESTION_ASKED:      return this._onQuestionAsked(payload);
      case Event.QUIZ_ANSWERED:       return this._onQuizAnswered(payload);
      case Event.DWELL_TICK:          return this._onDwellTick(payload);
      case Event.BACKTRACK_DETECTED:  return this._onBacktrack(payload);
      case Event.SECTION_COMPLETED:   return this._onSectionCompleted(payload);
      default: console.warn('[ar-tutor] unknown event:', event);
    }
  }

  // ── individual event handlers ──────────────────────────────────────
  _onPageChanged({ pageNum, activeConcepts }) {
    this.currentPage = pageNum;
    this.activeConcepts = activeConcepts || [];
    this.dwellStart = Date.now();
    this._recomputeLearnerState();
    this._tickDecisionLoop({ trigger: 'page' });
  }

  _onHighlighted({ phrase, pageNum }) {
    this._setLearnerState(LearnerState.READING_ENGAGED, 'highlight');
    // Match the highlight against any active concept's key_passage.
    const hit = this._matchHighlightToConcept(phrase);
    if (hit) {
      this.onLogEvent(hit.id, 'highlight_on_key_passage', { phrase: phrase.slice(0, 80) });
    }
    this._tickDecisionLoop({ trigger: 'highlight', highlightedConcept: hit, phrase });
  }

  _onAnnotated({ phrase, pageNum }) {
    this._setLearnerState(LearnerState.READING_ENGAGED, 'annotation');
    const hit = this._matchHighlightToConcept(phrase);
    if (hit) this.onLogEvent(hit.id, 'annotation_on_key_passage', { phrase: phrase.slice(0, 80) });
    this._tickDecisionLoop({ trigger: 'annotation', highlightedConcept: hit });
  }

  _onFigureClicked({ conceptId }) {
    if (conceptId) this.onLogEvent(conceptId, 'figure_opened');
    this._tickDecisionLoop({ trigger: 'figure_click' });
  }

  _onQuestionAsked({ text }) {
    this._setLearnerState(LearnerState.ASKED_QUESTION, 'user_question');
    // Track if this is the Nth question on the same concept → may indicate struggle.
    const guess = this._guessConceptForQuestion(text);
    if (guess) {
      const n = (this.recentQuestionsByConcept.get(guess.id) || 0) + 1;
      this.recentQuestionsByConcept.set(guess.id, n);
      if (n >= 3) {
        this._conceptSlot(guess.id).struggling = true;
        this.onLogEvent(guess.id, 'struggle_signal', { reason: 'repeated_questions', n });
      }
    }
    this._tickDecisionLoop({ trigger: 'question', question: text, conceptGuess: guess });
  }

  _onQuizAnswered({ conceptId, correct }) {
    const slot = this._conceptSlot(conceptId);
    slot.attempts++;
    if (correct) {
      slot.passes++;
      slot.struggling = false;
      if (slot.passes >= this.thresholds.masteryAfterNPasses) slot.mastered = true;
    } else {
      slot.fails++;
      if (slot.fails >= this.thresholds.struggleAfterNFails) slot.struggling = true;
    }
    this.onLogEvent(conceptId, correct ? 'quiz_pass' : 'quiz_fail',
      { attempts: slot.attempts, passes: slot.passes, fails: slot.fails });
    this._recomputeLearnerState();
    this._tickDecisionLoop({ trigger: 'quiz', conceptId, correct });
  }

  _onDwellTick({ secondsOnPage }) {
    this._tickDecisionLoop({ trigger: 'dwell', secondsOnPage });
  }

  _onBacktrack({ fromPage, toPage }) {
    // Backtracking >2 pages is a struggle signal on whatever concept was active
    // when the user left.
    if (Math.abs(fromPage - toPage) >= 2 && this.activeConcepts.length) {
      for (const c of this.activeConcepts) {
        this._conceptSlot(c.id).struggling = true;
        this.onLogEvent(c.id, 'struggle_signal', { reason: 'backtrack', fromPage, toPage });
      }
      this._recomputeLearnerState();
    }
    this._tickDecisionLoop({ trigger: 'backtrack' });
  }

  _onSectionCompleted({ sectionId, conceptIds }) {
    this._tickDecisionLoop({ trigger: 'section_done', sectionId, conceptIds });
  }

  // ── helpers ────────────────────────────────────────────────────────
  _matchHighlightToConcept(phrase) {
    if (!phrase) return null;
    const lower = phrase.toLowerCase();
    for (const c of this.activeConcepts) {
      const kp = (c.key_passage?.quote || '').toLowerCase();
      if (kp && (kp.includes(lower.slice(0, 30)) || lower.includes(kp.slice(0, 30)))) return c;
      if ((c.title || '').toLowerCase() && lower.includes(c.title.toLowerCase())) return c;
    }
    return null;
  }

  _guessConceptForQuestion(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    // Cheap lexical match — the backend tutor will do the real grounding.
    for (const c of this.activeConcepts) {
      const t = (c.title || '').toLowerCase();
      if (t && lower.includes(t.split(/[\s,]/)[0])) return c;
    }
    return this.activeConcepts[0] || null;
  }

  // ── 7. THE DECISION LOOP — priority-ordered behavior tree ──────────
  _tickDecisionLoop(ctx = {}) {
    const { trigger } = ctx;

    // P0 — struggling on a concept that's currently active → remediate
    const struggleConcept = this.activeConcepts.find(c => this._conceptSlot(c.id).struggling);
    if (struggleConcept && !this._onCooldown(TutorAction.REMEDIATE, this.thresholds.remediationCooldownSec)) {
      this._markAction(TutorAction.REMEDIATE);
      return this._emit({
        kind: TutorAction.REMEDIATE,
        concept: struggleConcept,
        reason: 'detected struggle (wrong quiz / repeat Qs / backtrack)',
        trigger,
      });
    }

    // P1 — user just asked a question → grounded answer (existing chat path).
    // We don't emit here; the chat path handles it. But we annotate the trigger
    // so the integration can pass active-concept context.
    if (trigger === 'question') {
      return this._emit({
        kind: TutorAction.ANSWER_QUESTION,
        concept: ctx.conceptGuess,
        question: ctx.question,
        reason: 'user typed a question — answer grounded in active concept',
        trigger,
      });
    }

    // P2 — highlight on a key passage → unobtrusive offer
    if (trigger === 'highlight' && ctx.highlightedConcept
        && !this._onCooldown(TutorAction.OFFER_ELABORATION, this.thresholds.elaborationCooldownSec)) {
      this._markAction(TutorAction.OFFER_ELABORATION);
      return this._emit({
        kind: TutorAction.OFFER_ELABORATION,
        concept: ctx.highlightedConcept,
        phrase: ctx.phrase,
        reason: 'user underlined a phrase matching a known concept key passage',
        trigger,
      });
    }

    // P3 — dwell exceeded threshold AND there's an active concept we haven't
    // probed in this session → comprehension MCQ
    if (trigger === 'dwell'
        && ctx.secondsOnPage >= this.thresholds.dwellThresholdSec
        && this.activeConcepts.length) {
      const c = this.activeConcepts.find(c => {
        const s = this._conceptSlot(c.id);
        return !s.mastered
            && Date.now() - s.lastProbedAt > this.thresholds.comprehensionCooldownSec * 1000;
      });
      if (c) {
        this._conceptSlot(c.id).lastProbedAt = Date.now();
        return this._emit({
          kind: TutorAction.ASK_COMPREHENSION,
          concept: c,
          reason: `dwell > ${this.thresholds.dwellThresholdSec}s on active concept`,
          trigger,
        });
      }
    }

    // P4 — section just completed → recap
    if (trigger === 'section_done') {
      return this._emit({
        kind: TutorAction.RECAP_SECTION,
        sectionId: ctx.sectionId,
        conceptIds: ctx.conceptIds || [],
        reason: 'finished a section — recap and check mastery',
        trigger,
      });
    }

    // Default → silent
    this._emit({ kind: TutorAction.STAY_SILENT, reason: 'no rule matched', trigger });
  }

  _emit(action) {
    this.bus.emit('action', action);
  }
}

// ── 8. Tiny self-test (run with `node activeReaderStateMachine.js`) ──
//
// node --input-type=module -e "
//   import('./activeReaderStateMachine.js').then(({ActiveReaderTutor,Event}) => {
//     const t = new ActiveReaderTutor();
//     t.onAction(a => console.log('→', a.kind, a.reason));
//     t.dispatch(Event.PAGE_CHANGED, { pageNum: 47, activeConcepts: [
//       { id: 'reflectance_albedo', title: 'reflectance, or albedo',
//         key_passage: { quote: 'a is the surface reflectance, or albedo' } } ] });
//     t.dispatch(Event.TEXT_HIGHLIGHTED, { phrase: 'a is the surface reflectance' });
//     t.dispatch(Event.QUESTION_ASKED, { text: 'what is reflectance?' });
//     t.dispatch(Event.QUIZ_ANSWERED, { conceptId: 'reflectance_albedo', correct: false });
//     t.dispatch(Event.QUIZ_ANSWERED, { conceptId: 'reflectance_albedo', correct: false });
//     t.dispatch(Event.PAGE_CHANGED, { pageNum: 48, activeConcepts: [
//       { id: 'reflectance_albedo', title: 'reflectance, or albedo',
//         key_passage: { quote: 'a is the surface reflectance, or albedo' } } ] });
//   });
// "
