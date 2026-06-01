"""
Append presentation slides to the existing Google Slides deck.
Detects font family + sizes from the first styled text slide, then
creates section dividers + content slides to match the existing style.

Usage:
    python slides/build_presentation.py

Never deletes existing slides: only appends.
"""
import os, sys
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# ── Auth ──────────────────────────────────────────────────────────────────────
SCOPES      = ['https://www.googleapis.com/auth/presentations']
CREDS_DIR   = Path('/Users/su/Documents/su/slides-generator')
TOKEN_FILE  = CREDS_DIR / 'token.json'

creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

svc = build('slides', 'v1', credentials=creds)
PRES_ID = '10tZB26Gh-PBdv_rTaT_nUdc6AEr6QccbsRCwu3Dd8r0'

# ── Inspect current presentation ──────────────────────────────────────────────
prs    = svc.presentations().get(presentationId=PRES_ID).execute()
slides = prs['slides']
print(f"Current deck: {len(slides)} slides")

# Auto-detect font family and sizes from existing slides.
# Only consider sizes >= 12pt to ignore ghost/placeholder elements.
detected_font     = 'Helvetica Neue'
detected_title_pt = 38.0
detected_body_pt  = 34.0

for sl in slides:
    sizes = []
    font_candidates = []
    for el in sl.get('pageElements', []):
        shape = el.get('shape', {})
        for te in shape.get('text', {}).get('textElements', []):
            ts  = te.get('textRun', {}).get('style', {})
            fs  = ts.get('fontSize', {}).get('magnitude')
            ff  = ts.get('fontFamily')
            txt = te.get('textRun', {}).get('content', '').strip()
            if fs and fs >= 12 and txt:          # ignore sub-12pt ghost elements
                sizes.append(fs)
            if ff and ff != 'None':
                font_candidates.append(ff)
    if len(set(sizes)) >= 2:                     # need at least title + body size
        detected_font     = font_candidates[0] if font_candidates else detected_font
        detected_title_pt = max(sizes)
        detected_body_pt  = sorted(set(sizes))[-2]   # second-largest = body
        break
    elif sizes:
        # Only one size found: treat as body; title gets 20% larger
        detected_font     = font_candidates[0] if font_candidates else detected_font
        detected_body_pt  = max(sizes)
        detected_title_pt = round(max(sizes) * 1.20)

print(f"Detected style: {detected_font}, title={detected_title_pt:.0f}pt, body={detected_body_pt:.0f}pt")

# ── Layout constants (exact EMU values from state_machine_slides.py) ──────────
PAGE_W, PAGE_H = 9144000, 5143500
PAD_X = 1439175
T_Y, T_W, T_H = 977100,  19426500, 1530300
B_Y, B_W, B_H = 3512000, 20000100, 9999900

# Section slide: full-width box vertically centered
S_H = 2000000
S_Y = (PAGE_H - S_H) // 2
S_W = T_W

BG_WHITE = {'red': 1.0,  'green': 1.0,  'blue': 1.0 }
TXT_DARK = {'red': 0.08, 'green': 0.08, 'blue': 0.08}
ACCENT   = {'red': 0.13, 'green': 0.40, 'blue': 0.74}
def rgb(d): return {'opaqueColor': {'rgbColor': d}}

# ── Slide content ─────────────────────────────────────────────────────────────
# Each entry: ('section', title) or ('content', title, body_text)
SLIDES = [
    # ── MOTIVATION ─────────────────────────────────────────────────────────
    ('content', 'The Problem', (
        'Textbooks are static: no awareness of what you already know\n'
        '\n'
        '·  No personalization to learning goals or pace\n'
        '·  No prerequisite-aware navigation\n'
        '·  Expert knowledge locked in a linear, one-size-fits-all form\n'
        '\n'
        'Goal: transform any textbook into an adaptive, interactive\n'
        'learning experience: automatically, at scale'
    )),

    ('content', 'Two-Stage Pipeline', (
        'Stage 1  (Complete)              Stage 2  (Architecture)\n'
        '─────────────────────            ───────────────────────\n'
        'Raw textbook                →    Concept Graph    →    Adaptive Tutor\n'
        'PDF / MD / QMD                    1,267 nodes           State Machine\n'
        '                                  ~2,400 edges          Student Model\n'
        '\n'
        'Built on:  Foundations of Computer Vision  (55 chapters)\n'
        'Next:      200 – 400 STEM textbooks'
    )),

    # ── STAGE 1 ────────────────────────────────────────────────────────────
    ('content', 'What the Pipeline Does', (
        'Input formats:   .qmd  ·  .md  ·  .pdf\n'
        '\n'
        'Three extracted elements:\n'
        '\n'
        '  Concepts     atomic knowledge units\n'
        '               e.g. phong_reflection_model,  backpropagation\n'
        '\n'
        '  Edges        prerequisite relationships\n'
        '               lambertian_surface  →  phong_reflection_model\n'
        '\n'
        '  Items        linked content per concept\n'
        '               figures · exercises · examples · theorems'
    )),

    ('content', 'Concept Node Contents', (
        'id:           phong_reflection_model\n'
        'kind:         definition | theorem | technique | idea\n'
        'title:        "Phong Reflection Model"\n'
        '\n'
        'content:      paraphrased book text\n'
        'key_passage:  verbatim sentence from the book\n'
        'motivation:   why this concept matters\n'
        '\n'
        'item_ids:     → linked figures, exercises, examples\n'
        'prereqs:      [lambertian_surface, surface_albedo]'
    )),

    ('content', 'The 21-Stage Pipeline', (
        'INGESTION        parse structure, download images, enrich text\n'
        '     ↓\n'
        'CHUNKING         segment into ~2,000-token chunks\n'
        '     ↓\n'
        'EXTRACTION       extract concepts + items per chunk    ← Gemini 2.5 Flash\n'
        '     ↓\n'
        'NORMALIZATION    deduplicate, format, link items       ← GPT-4.1-mini\n'
        '     ↓\n'
        'EDGE EXTRACTION  prereq + overlay relationships        ← GPT-4.1-mini\n'
        '     ↓\n'
        'SLOT FILLING     fill key_passage, motivation          ← GPT-4.1-mini'
    )),

    ('content', 'Results: Foundations of Computer Vision', (
        '  1,267   concepts extracted\n'
        '     55   chapters covered\n'
        '  ~2,400  prerequisite edges\n'
        '\n'
        '    98%   concepts with verbatim key passage\n'
        '    10%   concepts with grounded study question\n'
        '    871   linked figures\n'
        '\n'
        'Comparison:\n'
        '  Metacademy: hand-curated, does not scale\n'
        '  DeepTutor : dialogue-focused, no graph structure\n'
        '  This pipeline: automated, full book, prerequisite-grounded'
    )),

    ('content', 'Edge Types + Challenges', (
        'Prerequisite edges\n'
        '  requires · special_case_of · generalizes · formalizes\n'
        '  → concept A must be understood before concept B\n'
        '\n'
        'Overlay edges\n'
        '  illustrates · used_to_prove · see_also · contrast_with\n'
        '  → conceptual connections without strict ordering\n'
        '\n'
        'Where extraction works well:  dense math chapters, explicit theorems\n'
        'Where it is harder:  qualitative chapters, narratively described concepts'
    )),

    # ── LIVE DEMO ──────────────────────────────────────────────────────────
    ('content', 'Three Visualizations', (
        'Full Book Graph  (concept-graph-vision.html)\n'
        '  1,267 nodes clustered by chapter  ·  cross-chapter edges\n'
        '  Click any node → key passage · motivation · figures · exercises\n'
        '\n'
        'Chapter View  (concept-graph.html)\n'
        '  Per-chapter DAG  ·  nodes colored by kind\n'
        '  Arrows show prerequisite direction\n'
        '\n'
        'Concept Panel walkthrough  (e.g. Phong Reflection Model)\n'
        '  Verbatim key passage  ·  motivation  ·  linked figure  ·  exercise  ·  prereqs'
    )),

    # ── STAGE 2 ────────────────────────────────────────────────────────────
    ('content', 'Inspiration from Game Architecture', (
        'Hierarchical State Machine  (HSM)\n'
        '  BOOK → CHAPTER → CONCEPT → LESSON STATES\n'
        '  Exiting any depth saves progress cleanly\n'
        '\n'
        'Behavior Tree  (Socratic Decision Logic)\n'
        '  Code decides:  when to give a hint · when to ask MCQ · when to advance\n'
        '  LLM generates:  the actual sentence: nothing more\n'
        '\n'
        'Lookup Table + Timer  (Spaced Repetition)\n'
        '  Per-concept cooldown timer: exactly like ability cooldowns in games'
    )),

    ('content', 'Lesson State Machine', (
        'Concept Node  →  Lesson Plan  →  State Machine  (runs at session time)\n'
        '\n'
        'HOOK       ← concept.question\n'
        'MOTIVATE   ← concept.motivation\n'
        'EXPLAIN    ← concept.content\n'
        'VISUAL     ← concept.item_ids.figures\n'
        'KEY MOMENT ← concept.key_passage\n'
        'EXAMPLE    ← concept.item_ids.examples\n'
        'PRACTICE   ← concept.item_ids.exercises\n'
        '  ├── ATTEMPT\n'
        '  ├── HINT  (after 3 wrong)\n'
        '  └── RETRY\n'
        'RECAP      ← concept.recap_md'
    )),

    ('content', 'Behavior Tree vs Prompt Rules', (
        'Current approach:\n'
        '  Socratic rules written in English inside the system prompt\n'
        '  "If clearly stuck, give ONE short hint"  →  LLM interprets "stuck"\n'
        '\n'
        'Proposed approach:\n'
        '  if attempts >= 3  →  call LLM("give_hint", concept.key_passage)\n'
        '  if score == "correct"  →  call LLM("praise_briefly")\n'
        '  if chapter_complete   →  call LLM("chapter_recap", concepts)\n'
        '\n'
        'Split principle:\n'
        '  Structured code  =  WHAT to do / WHEN to do it\n'
        '  LLM              =  HOW to say it'
    )),

    ('content', 'Student Model', (
        'Per-concept record  (persists across sessions):\n'
        '  status           not_started | in_progress | mastered | needs_review\n'
        '  attempts         count of practice attempts\n'
        '  retention_score  0.0 – 1.0  (decays over time)\n'
        '  next_due         datetime  (spaced repetition scheduler)\n'
        '\n'
        'Struggle profile:\n'
        '  weak_concept_tags  ·  stuck_concepts  ·  interaction_log\n'
        '\n'
        'Session scheduler reads next_due\n'
        '  → implements spaced repetition as a per-concept cooldown'
    )),

    # ── FULL VISION ────────────────────────────────────────────────────────
    ('content', 'Complete System Map', (
        'Offline pipelines  (batch, pre-runtime):\n'
        '  FiguresLLM             →  augmented figures  (2D, 3D, animated)\n'
        '  Concept graph pipeline →  knowledge atoms  (1,267 concepts)\n'
        '\n'
        'User intake:  Learner + Educator  →  onboarding  →  profile\n'
        '\n'
        'State machine hub:  tracks position · selects next concept · routes to modality\n'
        '\n'
        'Modalities:\n'
        '  Active Reader      learner  · active   · inline figures, learner-driven\n'
        '  Video Explainer    learner  · passive  · interactive playback\n'
        '  Figure Explainer   educator · active   · figure-based exercises\n'
        '  SlidesLLM          educator · passive  · lecture slide authoring'
    )),

    ('content', "What's Built vs Planned", (
        'Built:\n'
        '  ✓  Concept graph pipeline  (21 stages)\n'
        '  ✓  Concept graph visualizations  (3 views, running locally)\n'
        '  ✓  Active Reader  /api/chat\n'
        '  ·  FiguresLLM  (in progress)\n'
        '\n'
        'Next steps:\n'
        '  1  Lesson plan compiler  (concept node → lesson_plan.json)\n'
        '  2  Lesson state machine  (XState or custom)\n'
        '  3  Student model persistence layer\n'
        '  4  Behavior tree replacing prompt rules in /api/chat\n'
        '  5  Session scheduler  (spaced repetition)\n'
        '  6  Slides + video script renderers\n'
        '\n'
        'Scale:  1 textbook now  →  200–400 STEM textbooks'
    )),
]

# ── Build requests ─────────────────────────────────────────────────────────────
insert_idx = len(slides)
print(f"Adding {len(SLIDES)} slides starting at index {insert_idx}...")

requests = []

for i, slide_spec in enumerate(SLIDES):
    kind  = slide_spec[0]
    title = slide_spec[1]
    sid   = f'alex_slide_{insert_idx + i:03d}'

    # Create slide
    requests.append({'createSlide': {
        'objectId': sid,
        'insertionIndex': insert_idx + i,
        'slideLayoutReference': {'predefinedLayout': 'BLANK'},
    }})
    # White background
    requests.append({'updatePageProperties': {
        'objectId': sid,
        'pageProperties': {'pageBackgroundFill':
                           {'solidFill': {'color': {'rgbColor': BG_WHITE}}}},
        'fields': 'pageBackgroundFill',
    }})

    if kind == 'section':
        # ── Section divider: centered title in accent blue ─────────────────
        t_id = f'{sid}_t'
        requests += [
            {'createShape': {
                'objectId': t_id, 'shapeType': 'TEXT_BOX',
                'elementProperties': {
                    'pageObjectId': sid,
                    'size': {'width':  {'magnitude': S_W, 'unit': 'EMU'},
                             'height': {'magnitude': S_H, 'unit': 'EMU'}},
                    'transform': {'scaleX': 1, 'scaleY': 1,
                                   'translateX': PAD_X, 'translateY': S_Y, 'unit': 'EMU'},
                },
            }},
            {'updateShapeProperties': {
                'objectId': t_id,
                'shapeProperties': {'contentAlignment': 'MIDDLE'},
                'fields': 'contentAlignment',
            }},
            {'insertText': {'objectId': t_id, 'insertionIndex': 0, 'text': title}},
            {'updateTextStyle': {
                'objectId': t_id, 'textRange': {'type': 'ALL'},
                'style': {
                    'fontFamily': detected_font,
                    'fontSize': {'magnitude': detected_title_pt * 1.1, 'unit': 'PT'},
                    'bold': True,
                    'foregroundColor': rgb(ACCENT),
                },
                'fields': 'fontFamily,fontSize,bold,foregroundColor',
            }},
            {'updateParagraphStyle': {
                'objectId': t_id, 'textRange': {'type': 'ALL'},
                'style': {'lineSpacing': 100, 'alignment': 'CENTER'},
                'fields': 'lineSpacing,alignment',
            }},
        ]

    else:
        # ── Content slide: title + body ────────────────────────────────────
        body  = slide_spec[2]
        t_id  = f'{sid}_t'
        b_id  = f'{sid}_b'
        requests += [
            # Title
            {'createShape': {
                'objectId': t_id, 'shapeType': 'TEXT_BOX',
                'elementProperties': {
                    'pageObjectId': sid,
                    'size': {'width':  {'magnitude': T_W, 'unit': 'EMU'},
                             'height': {'magnitude': T_H, 'unit': 'EMU'}},
                    'transform': {'scaleX': 1, 'scaleY': 1,
                                   'translateX': PAD_X, 'translateY': T_Y, 'unit': 'EMU'},
                },
            }},
            {'updateShapeProperties': {
                'objectId': t_id,
                'shapeProperties': {'contentAlignment': 'BOTTOM'},
                'fields': 'contentAlignment',
            }},
            {'insertText': {'objectId': t_id, 'insertionIndex': 0, 'text': title}},
            {'updateTextStyle': {
                'objectId': t_id, 'textRange': {'type': 'ALL'},
                'style': {
                    'fontFamily': detected_font,
                    'fontSize': {'magnitude': detected_title_pt, 'unit': 'PT'},
                    'bold': True,
                    'foregroundColor': rgb(TXT_DARK),
                },
                'fields': 'fontFamily,fontSize,bold,foregroundColor',
            }},
            {'updateParagraphStyle': {
                'objectId': t_id, 'textRange': {'type': 'ALL'},
                'style': {'lineSpacing': 100, 'alignment': 'START'},
                'fields': 'lineSpacing,alignment',
            }},
            # Body
            {'createShape': {
                'objectId': b_id, 'shapeType': 'TEXT_BOX',
                'elementProperties': {
                    'pageObjectId': sid,
                    'size': {'width':  {'magnitude': B_W, 'unit': 'EMU'},
                             'height': {'magnitude': B_H, 'unit': 'EMU'}},
                    'transform': {'scaleX': 1, 'scaleY': 1,
                                   'translateX': PAD_X, 'translateY': B_Y, 'unit': 'EMU'},
                },
            }},
            {'updateShapeProperties': {
                'objectId': b_id,
                'shapeProperties': {'contentAlignment': 'TOP'},
                'fields': 'contentAlignment',
            }},
            {'insertText': {'objectId': b_id, 'insertionIndex': 0, 'text': body}},
            {'updateTextStyle': {
                'objectId': b_id, 'textRange': {'type': 'ALL'},
                'style': {
                    'fontFamily': detected_font,
                    'fontSize': {'magnitude': detected_body_pt, 'unit': 'PT'},
                    'bold': False,
                    'foregroundColor': rgb(TXT_DARK),
                },
                'fields': 'fontFamily,fontSize,bold,foregroundColor',
            }},
            {'updateParagraphStyle': {
                'objectId': b_id, 'textRange': {'type': 'ALL'},
                'style': {'lineSpacing': 115, 'alignment': 'START'},
                'fields': 'lineSpacing,alignment',
            }},
        ]

# ── Send ──────────────────────────────────────────────────────────────────────
print(f"Sending {len(requests)} API requests...")
resp = svc.presentations().batchUpdate(
    presentationId=PRES_ID,
    body={'requests': requests}
).execute()
print(f"Done: {len(resp.get('replies', []))} replies")
print(f"\nhttps://docs.google.com/presentation/d/{PRES_ID}/edit")
