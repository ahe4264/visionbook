---
name: figure-generation-presentation
description: Slide structure design for a 15-minute academic opening presentation on the figure generation platform
metadata:
  type: project
---

# Figure Generation — Opening Presentation Design

**Venue:** Academic audience (lab meeting / committee / conference)
**Length:** 15 minutes, no demo
**Tone:** Progress update — "here's what I've built so far"
**Central claim:** The system works end-to-end; the evaluation infrastructure is in place and benchmarking is underway

---

## Structure

### Section 1: Problem (~2–3 min, 3 slides)

**Slide 1 — Title**
Title, name, date. Nothing else.

**Slide 2 — Motivation**
One punchy claim: textbook figures are static, but the concepts they illustrate are spatial and dynamic. Brief on what's lost — students can't rotate a 3D projection, can't explore parameter changes in a plot. Close with: *what if figures could be interactive?*

**Slide 3 — Problem Statement**
Formalize the task: given a 2D textbook figure image + surrounding text context → generate an interactive HTML visualization. Show input/output clearly (figure image left, rendered HTML right). Define "good" briefly: faithful to the original, interactive, renderable.

---

### Section 2: System (~6–7 min, 5 slides)

**Slide 4 — Pipeline Overview**
One diagram showing the full arc: image + context → plan → scaffold-based generation (routed by figure type) → critique loop → output. Clean diagram with brief callouts. Audience gets the shape of the system without a deep dive on any single stage.

**Slide 5 — Why Pairwise Evaluation?**
Motivate the evaluation design before showing it. Absolute scoring is noisy and figure-dependent — a hard figure at 3/5 isn't comparable to an easy figure at 3/5. Pairwise comparison controls for this. Frame as a deliberate methodological choice.

**Slide 6 — Evaluation Dimensions**
The 5 rubrics: geometry, interactivity, faithfulness, labels, concept. Brief description of each. Note which use HTML source vs. screenshots vs. the original image — shows evaluation is grounded in multiple evidence types.

**Slide 7 — Ranking & Aggregation**
Dimension agents run in parallel, aggregator synthesizes a winner per figure. Bradley-Terry across all pairwise results yields a ranked leaderboard. Mention position randomization as a bias control. Small placeholder leaderboard table works well.

**Slide 8 — Human Evals**
Human judgments collected separately, never overwritten by machine re-runs. Explain the separation: machine eval is fast and scalable, human eval is the ground truth anchor.

---

### Section 3: Results & Future Work (~4–5 min, 4 slides)

**Slide 9 — Benchmarking**
Three things: (1) corpus — which chapters and how many figures; (2) setups compared — configurations being evaluated (experiment/model pairs); (3) status — what's been run vs. what's planned. A progress grid (rows = figure types, columns = setups, cells = done / in progress / —) works well. Frame as: *infrastructure is in place, here's where benchmarking stands.*

**Slide 10 — Qualitative Examples**
Side-by-side: original textbook figure left, generated HTML output right. A few examples showing range (3D projection, 2D diagram). No numbers needed — the goal is to show the system produces something plausible.

**Slide 11 — Current State**
Honest snapshot: what's working (pipeline end-to-end, pairwise eval framework, multi-provider routing), what's still open (reliability across figure types, evaluation at scale). Frame as "the foundation is in place."

**Slide 12 — Future Work & Close**
Two or three concrete next steps: running pairwise benchmarks at scale, improving faithfulness on complex figures, human eval correlation study. Close with one sentence restating the goal.

---

## Summary Table

| # | Slide | Section | Time |
|---|-------|---------|------|
| 1 | Title | — | — |
| 2 | Motivation | Problem | ~1 min |
| 3 | Problem Statement | Problem | ~1.5 min |
| 4 | Pipeline Overview | System | ~1.5 min |
| 5 | Why Pairwise? | Evaluation | ~1 min |
| 6 | Evaluation Dimensions | Evaluation | ~1.5 min |
| 7 | Ranking & Aggregation | Evaluation | ~1 min |
| 8 | Human Evals | Evaluation | ~1 min |
| 9 | Benchmarking | Results | ~1.5 min |
| 10 | Qualitative Examples | Results | ~1.5 min |
| 11 | Current State | Results | ~1 min |
| 12 | Future Work & Close | Results | ~1 min |
