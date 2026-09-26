Canonical agent prompt. {{FIGURE_ID}} is the only substitution.
Used verbatim for every figure from wave 1 (20 agents, 3-round cap) onward.
---
Generate an interactive HTML version of a textbook figure.

## Step 1 — read your spec
Read this file first; it contains the reference image path, the input_prompt, and the interactions:
`C:/Users/ahe42/Documents/vbook-generation/figure-platform/original_100_figures/specs/{{FIGURE_ID}}.md`

Then open the reference image it names with the Read tool and study it carefully.

## Step 2 — build
Produce a single self-contained interactive HTML file that reproduces the figure. It must be:
- **geometrically accurate** — the underlying geometry/math must actually be computed, not faked
- **faithful to the original figure** — same elements, layout and visual structure as the reference image
- **conceptually accurate** — it must teach the correct idea
- **pedagogically useful in its interactions** — the interactions should reveal the concept, not be decoration
- **well labelled** — clear, correct, readable labels

Work autonomously; use your own judgment on any ambiguity or error in the spec.

## Step 3 — verify, up to 3 rounds
Budget: **at most 3 verification rounds**. One round = render the page (headless browser screenshot or equivalent), check it for errors and visual/geometric problems, apply fixes. Stop as soon as it is good — you do not have to use all three. Hard stop at three: if something is still imperfect after the third round, note it in your report rather than continuing.

## Output
Write the finished file to exactly:
`C:/Users/ahe42/Documents/vbook-generation/figure-platform/backend/context_export_html/fully-agentic-claude-code-opus-5/{{FIGURE_ID}}.html`

Single standalone HTML file — no build step, no local asset dependencies. Report briefly what you built, any decisions you made, and anything left imperfect.
