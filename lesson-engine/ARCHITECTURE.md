# Lesson Engine — General State Machine Architecture

**Renderer-agnostic lesson runtime for video, slides, and scripted tutoring.**

This folder is the **generic template**. It is intentionally **independent** of ActiveReader, PDF viewing, and concept-graph extraction. Those systems *consume* or *specialize* this engine; they are not part of it.

---

## 1. What this is (and is not)

| This engine **is** | This engine **is not** |
|---|---|
| A plan-driven finite state machine | An LLM tutor |
| Renderer-agnostic (video / slides / stdout / chat script) | Tied to React or a PDF viewer |
| Driven by compiled JSON (`LessonPlan`) | Generated at runtime from prompts |
| Host-controlled (`advance()`, `submitVerdict()`) | Event-driven reading (that's ActiveReader) |

**Lineage:** Generalized from `SocraticAI/engine/core.js` (video scrollytelling playback). Domain labels (`HOOK`, `EXPLAIN`, …) live in plan `kind` fields; the runtime treats them as opaque.

**Related but separate:**

| Project | Role |
|---|---|
| `lesson-engine/` (this folder) | Generic linear lesson SM |
| `active-reader-platform/…/activeReaderStateMachine.js` | Event-driven tutor specialization |
| `create_knowledge_graph/` | Stage 1 — concept graph extraction |
| `active-reader-demo/lesson_plans/` | Compiled example plans (Ch 5 Imaging) |
| `SocraticAI/` | Original video engine (gitignored) |

---

## 2. Folder layout

```
lesson-engine/
├── ARCHITECTURE.md          ← this document
├── README.md                ← quick start pointer
├── runtime.js               ← JavaScript port (LessonRuntime, complete)
├── lesson_engine/           ← Python package (source deleted; see §15)
│   ├── __pycache__/         ← recoverable bytecode (.pyc)
│   └── renderers/
│       └── __pycache__/     ← stdout renderer bytecode
├── examples/
│   └── reflectance_albedo.json   ← example LessonPlan (Ch 5 concept)
└── tests/
    ├── __init__.py          ← tracked in git
    └── __pycache__/         ← pytest bytecode (37 tests existed)
```

**Duplicate JS copy (legacy location):** `active-reader-platform/frontend/src/lessonRuntime.js` — same code; should eventually import from here.

---

## 3. Design principles

1. **Code decides WHAT and WHEN; LLM decides HOW to say it.**  
   Transitions, gates, and branches are lookup tables in the plan. The LLM only fills language at compile time or in renderer leaf nodes.

2. **No internal tick.**  
   The host (video player, slide deck, CLI) calls `advance()` when ready. Same machine serves chat (advance on message), book (advance on scroll), slides (advance on click), video (advance on timeline).

3. **Five primitives only.**  
   State, Marker, Gate, Branch (inline on Gate), Path. Everything else is `kind` + `payload`.

4. **Fail loudly on illegal phase transitions.**  
   Unlike the original SocraticAI engine (which logged warnings), invalid transitions raise `InvalidTransition`.

5. **Renderer is pluggable.**  
   The runtime emits bus events; renderers subscribe and display. `NullRenderer` for headless tests.

---

## 4. Architecture overview

```
                    ┌─────────────────────────┐
                    │   Concept graph node    │
                    │   (Stage 1 output)      │
                    └───────────┬─────────────┘
                                │ compile (deterministic)
                                ▼
                    ┌─────────────────────────┐
                    │   LessonPlan (JSON)     │
                    │   states, main_path,    │
                    │   markers, gates        │
                    └───────────┬─────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│  Orchestrator / LessonRuntime                                  │
│                                                                │
│  PlaybackState ── cursor on main_path OR branch overlay       │
│  Phase         ── idle | running | paused | gating | asking   │
│  EventBus      ── state:enter, gate:enter, branch:enter, …   │
│  InterruptStack── push/pop overlays (mid-lesson questions)    │
└───────────────────────────┬───────────────────────────────────┘
                            │ events
                            ▼
              ┌─────────────────────────────┐
              │  Renderer (pluggable)        │
              │  video | slides | stdout     │
              └─────────────────────────────┘
```

---

## 5. Five primitives

| Primitive | Purpose | User input? |
|---|---|---|
| **State** | One atomic lesson beat | Rendered by host |
| **Marker** | Passive label between states ("why this matters", "see it") | No |
| **Gate** | Interactive checkpoint (MCQ, confirm, etc.) | Yes — pass / fail / dismiss |
| **Branch** | Remediation overlay after fail | States with `is_branch: true` |
| **Path** | `main_path[]` — ordered state IDs when all gates pass | — |

Domain semantics (`HOOK`, `EXPLAIN`, `VISUAL`, …) are **only** in `state.kind` and `state.payload`. The runtime never interprets them.

---

## 6. Per-concept lesson flow

Default compiled sequence for one concept:

```
HOOK → MOTIVATE → EXPLAIN → VISUAL → KEY_MOMENT → EXAMPLE → PRACTICE → RECAP → COMPLETE
```

**Practice** is a compound sub-machine (nested states in the plan, not a separate runtime):

```
practice/
  attempt  ──CORRECT──► recap
  attempt  ──WRONG───► feedback
  feedback ──RETRY───► attempt
  feedback ──HINT────► hint
  hint     ──GIVE_UP► explain (via branch)
```

**Gate fail** enters a branch overlay; main-path index is frozen until the branch queue drains, then rejoins at `rejoin_to`:

```
main:  … → PRACTICE ──gate fail──► hint → retry ──rejoin──► RECAP → …
              │                        ▲
              └── branch overlay ──────┘
```

**Interrupt stack** (mid-lesson question dialog):

```
running ──push_interrupt("asking")──► asking ──pop_interrupt──► running (resume)
```

---

## 7. Runtime phases

Six phases. Legal transitions are enforced by a single table:

```
idle ──start()──► running
running ──advance()──► gating (if gate ahead)
running ──advance()──► done (end of path)
running ◄──► paused
running ──push_interrupt()──► asking
gating ──submit_verdict()──► running (or branch)
asking ──pop_interrupt()──► running | gating
done ──reset()──► idle
```

Python: `lesson_engine.phase.Phase`, `can_transition()`, `InvalidTransition`  
JavaScript: `TRANSITIONS` object in `runtime.js`

---

## 8. Orchestrator API

Python class: `lesson_engine.orchestrator.Orchestrator`  
JavaScript class: `LessonRuntime` in `runtime.js`

| Method | When host calls it | Effect |
|---|---|---|
| `start()` | Begin lesson | Enter first `main_path` state; phase → `running` |
| `advance()` | Continue / next slide / next beat | Exit current state; fire marker; enter gate or next state |
| `submit_verdict(gate_id, verdict)` | User answers MCQ | `"pass"` \| `"fail"` \| `"dismiss"`; may enter branch |
| `push_interrupt(state_id)` | User asks mid-lesson question | Push overlay; phase → `asking`; returns token |
| `pop_interrupt(token)` | Question answered / dismissed | Restore previous phase |
| `pause()` / `resume()` | User pauses playback | Phase toggle |
| `reset()` | Abandon lesson | phase → `idle`; clear cursor |

There is **no** `tick()` or internal loop.

---

## 9. Event bus catalog

Handler signature: `fn(payload: dict) -> None`. Handlers run synchronously on `emit()`.

| Event | Payload (key fields) | When |
|---|---|---|
| `phase:change` | `frm`, `to` | Any phase transition |
| `state:enter` | `state` / `id`, `state` | Cursor lands on a state |
| `state:exit` | `state` / `id`, `state` | Leaving a state |
| `marker:fire` | `marker`, `after_state` | Passive transition label (main path only) |
| `gate:enter` | `gate` | Paused at interactive checkpoint |
| `gate:resolve` | `gate`, `verdict`, `branch_entered` | Gate resolved |
| `branch:enter` | `gate`, `branch_ids`, `return_to` | Fail → remediation overlay |
| `branch:exit` | `rejoin_to` / `gate`, `rejoin_to` | Branch done; rejoin main path |
| `interrupt:enter` | `state_id`, `return_to`, `token` | Question overlay opened |
| `interrupt:exit` | `state_id`, `return_to`, `token` | Question overlay closed |
| `lesson:complete` | `{}` | Reached end of path |

Modules: `lesson_engine.event_bus.EventBus`

---

## 10. PlaybackState (cursor model)

Two cursor modes:

| Mode | Field | Meaning |
|---|---|---|
| **main** | `mainIndex` | Position in `main_path[]` |
| **branch** | `_branchQueue`, `_branchReturnMainIndex` | Remediation overlay; main index frozen |

Rules:
- Branch states have `is_branch: true` and must **not** appear in `main_path`.
- While on branch, gates on the main path do not re-fire on rejoin.
- `pathHistory` records the full traversal for debugging / student model.

Module: `lesson_engine.playback_state.PlaybackState`

---

## 11. Renderer protocol

Anything that implements the renderer interface can drive output. The runtime calls renderer hooks; the renderer calls `advance()` / `submitVerdict()` when the user acts.

Python: `lesson_engine.renderer.Renderer`, `NullRenderer`  
Planned renderers: stdout (exists in bytecode), video timeline, slide deck, tutor chat script

The renderer is the **only** component that differs between output modalities.

---

## 12. LessonPlan JSON schema

Top-level shape:

```json
{
  "meta": { "id", "title", "concept_kind", "chapter", "section", … },
  "states": {
    "<state_id>": {
      "kind": "HOOK | MOTIVATE | EXPLAIN | VISUAL | KEY_MOMENT | EXAMPLE | PRACTICE | RECAP | COMPLETE | …",
      "payload": { … opaque to runtime … },
      "is_branch": false
    }
  },
  "markers": [
    { "id", "after_state", "label" }
  ],
  "gates": [
    {
      "id", "after_state", "kind": "mcq",
      "payload": { "prompt", "correct_index", … },
      "branch_on_fail": ["hint_1", "retry_1"],
      "rejoin_to": "recap"
    }
  ],
  "main_path": ["hook", "motivate", "explain", …, "complete"]
}
```

**Validation rules** (from `tests/test_schema.py`):
- Every `main_path` entry must exist in `states` and must not be a branch state.
- Every `marker.after_state` and `gate.after_state` must reference a known state.
- Every `gate.branch_on_fail` entry must reference a state with `is_branch: true`.

**Full example:** `examples/reflectance_albedo.json` (Ch 5 — reflectance/albedo, 10 states, 1 gate, 6 markers).

---

## 13. Compiling concept graph → LessonPlan

Stage 1 produces concept nodes. A **compiler** (not yet in this folder) maps fields deterministically:

| Concept field | Lesson segment |
|---|---|
| `question.text` | HOOK |
| `motivation.text` | MOTIVATE |
| `content` | EXPLAIN |
| `item_ids.figures[]` | VISUAL (one state per figure) |
| `key_passage.text` | KEY_MOMENT |
| `item_ids.examples[]` | EXAMPLE |
| `item_ids.exercises[]` | PRACTICE (+ gate) |
| `recap_md` | RECAP |

Missing fields may be filled by a single cheap LLM pass at **compile time only** (`gpt-4.1-mini`). Runtime execution uses zero LLM calls.

Compiled plans for the vision book live in `../active-reader-demo/lesson_plans/` (14 concepts for Ch 5 Imaging).

---

## 14. Hierarchical scope (game-engine HSM)

Lessons nest inside a larger compound structure:

```
BOOK  (compound)
└── CHAPTER  (compound)
    └── CONCEPT  (compound)
        └── LESSON  (this engine — one LessonPlan per concept)
            ├── HOOK / MOTIVATE / EXPLAIN / …
            └── PRACTICE (compound: attempt → hint → retry)
```

Parent levels own global transitions (save on exit, restore cursor, prerequisite checks). This engine handles the **LESSON** level only.

Patterns borrowed from game engines:
- **HSM** — compound states with enter/update/exit
- **Interrupt stack** — overlay states (pause menu, question dialog)
- **Behavior tree** — used in ActiveReader specialization, not in this linear engine
- **Save file** — student model (external; written on `COMPLETE` states)

---

## 15. Python package (`lesson_engine/`)

**Status:** `.py` source files were deleted. Bytecode in `lesson_engine/__pycache__/` confirms the full implementation existed and is recoverable.

| Module | Classes / symbols | Role |
|---|---|---|
| `schema.py` | `State`, `Marker`, `Gate`, `LessonPlan` | Plan data model + validation |
| `orchestrator.py` | `Orchestrator` | Runtime driver (API in §8) |
| `phase.py` | `Phase`, `InvalidTransition`, `can_transition` | Phase transition table |
| `playback_state.py` | `PlaybackState` | Main/branch cursor |
| `event_bus.py` | `EventBus` | Pub/sub (§9) |
| `interrupt_stack.py` | `InterruptStack`, `Frame` | Tokenized overlay stack |
| `renderer.py` | `Renderer`, `NullRenderer` | Output protocol |
| `renderers/stdout.py` | (stdout renderer) | CLI / test output |

---

## 16. JavaScript port (`runtime.js`)

Complete, runnable ES module. Class name: `LessonRuntime` (Python name: `Orchestrator`).

```javascript
import { LessonRuntime } from './runtime.js';
import plan from './examples/reflectance_albedo.json' assert { type: 'json' };

const rt = new LessonRuntime(plan);
rt.bus.on('state:enter', ({ id, state }) => console.log('→', id, state.kind));
rt.start();
rt.advance();  // host drives each step
```

No DOM, no React, no PDF — headless only.

---

## 17. Tests

37 pytest tests existed (bytecode in `tests/__pycache__/`). Source `.py` files were deleted with the package.

| File | Coverage |
|---|---|
| `test_schema.py` | Plan validation, branch rules, main_path integrity |
| `test_phase.py` | Legal / illegal phase transitions |
| `test_event_bus.py` | Subscribe, unsubscribe, error isolation |
| `test_interrupt_stack.py` | Push/pop, stale token, cancel |
| `test_orchestrator.py` | Linear walk, gates, branches, interrupts, markers |
| `test_complex_plan.py` | Multi-gate plans, mixed verdicts, branch lengths |

Restore Python source from bytecode to re-run: `pytest lesson-engine/tests/`

---

## 18. Comparison: generic engine vs ActiveReader tutor

Both share *ideas* (event bus, phases, student model logging). They are **separate runtimes**.

| | **Lesson engine (this folder)** | **ActiveReader tutor** |
|---|---|---|
| Scheduling | Plan-scheduled | Event-scheduled |
| Advance | `advance()` / Continue | `PAGE_CHANGED`, `HIGHLIGHT`, `QUESTION_ASKED`, … |
| Input | `LessonPlan` JSON | Concept graph + PDF + student model |
| Output | Renderer events | Chat messages, MCQs, figure pops |
| Location | `lesson-engine/` | `active-reader-platform/…/activeReaderStateMachine.js` |
| Imports other? | No | No (self-contained today) |

```
Concept graph ──compile──► LessonPlan ──► lesson-engine (generic)
                │
                └──grounding──► ActiveReaderTutor (event-driven)
```

---

## 19. Recovery checklist

To make this folder fully operational again:

- [ ] Restore `lesson_engine/*.py` from `__pycache__` bytecode (or re-port from `runtime.js`)
- [ ] Restore `tests/test_*.py` from bytecode
- [ ] Add `compile_lesson_plan.py` (concept node → JSON)
- [ ] Point `active-reader-platform/frontend/src/lessonRuntime.js` at `lesson-engine/runtime.js`
- [ ] Add `examples/minimal_linear.json` for smoke tests

---

## 20. Quick reference — one concept walkthrough

Using `examples/reflectance_albedo.json`:

```
start()           → state:enter hook
advance()         → marker:fire "why does this matter"
                  → state:enter motivate
advance()         → … explain → visual_1 → visual_2 → key_moment → example
advance()         → state:enter practice_1
                  → gate:enter g_practice_1   (phase → gating)
submitVerdict(fail) → branch:enter [hint_1, retry_1]
                    → state:enter hint_1 … retry_1
advance() …       → branch:exit → state:enter recap
advance()         → state:enter complete
                  → lesson:complete
```

---

*Last updated: 2026-06-01. This document is the canonical architecture reference for the generic lesson state machine.*
