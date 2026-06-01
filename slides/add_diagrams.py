"""
Generate B&W matplotlib diagrams and insert them on the right half of key slides.

Usage:
    python slides/add_diagrams.py
"""
import os, json, tempfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = [
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/drive',
]
CREDS_DIR   = Path('/Users/su/Documents/su/slides-generator')
TOKEN_FILE  = CREDS_DIR / 'token.json'
CONFIG_FILE = CREDS_DIR / 'config.json'

creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

slides_svc = build('slides', 'v1', credentials=creds)
drive_svc  = build('drive',  'v3', credentials=creds)
PRES_ID    = '10tZB26Gh-PBdv_rTaT_nUdc6AEr6QccbsRCwu3Dd8r0'
FOLDER_ID  = json.loads(CONFIG_FILE.read_text())['drive_folder_id']

# ── Image placement on right half ────────────────────────────────────────────
IMG_X = 13200000
IMG_Y = 1800000
IMG_W = 10800000
IMG_H = 11200000


# ── Drive helpers ─────────────────────────────────────────────────────────────
def upload_image(path: str, name: str) -> str:
    meta  = {'name': name, 'parents': [FOLDER_ID]}
    media = MediaFileUpload(path, mimetype='image/png')
    f = drive_svc.files().create(body=meta, media_body=media, fields='id').execute()
    fid = f['id']
    drive_svc.permissions().create(fileId=fid, body={'type': 'anyone', 'role': 'reader'}).execute()
    return f'https://drive.google.com/uc?id={fid}'


def make_create_request(slide_id: str, img_url: str) -> dict:
    img_id = f'{slide_id}_diagram'
    return {'createImage': {
        'objectId': img_id,
        'url': img_url,
        'elementProperties': {
            'pageObjectId': slide_id,
            'size': {
                'width':  {'magnitude': IMG_W, 'unit': 'EMU'},
                'height': {'magnitude': IMG_H, 'unit': 'EMU'},
            },
            'transform': {
                'scaleX': 1, 'scaleY': 1,
                'translateX': IMG_X, 'translateY': IMG_Y, 'unit': 'EMU',
            },
        },
    }}


# ── Drawing helpers ───────────────────────────────────────────────────────────
def box(ax, x, y, w, h, text, fontsize=14, bold=False, radius=0.03,
        facecolor='white', edgecolor='black', textcolor='black'):
    rect = FancyBboxPatch((x, y), w, h, boxstyle=f'round,pad={radius}',
                          linewidth=1.5, edgecolor=edgecolor, facecolor=facecolor)
    ax.add_patch(rect)
    ax.text(x + w/2, y + h/2, text, ha='center', va='center',
            fontsize=fontsize, fontweight='bold' if bold else 'normal',
            color=textcolor, fontfamily='sans-serif')

def circ(ax, cx, cy, r, text, fontsize=14, bold=False):
    c = Circle((cx, cy), r, linewidth=1.8, edgecolor='black', facecolor='white')
    ax.add_patch(c)
    ax.text(cx, cy, text, ha='center', va='center',
            fontsize=fontsize, fontweight='bold' if bold else 'normal',
            fontfamily='sans-serif')

def arrow(ax, x1, y1, x2, y2):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color='black', lw=1.8))

def fig_setup(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.axis('off')
    return fig, ax


# ── Diagram 1: Pipeline flow ──────────────────────────────────────────────────
def diagram_pipeline():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    BX, BW = 0.4, 6.2          # same x and width for ALL boxes
    BOX_H, GAP = 0.85, 0.18    # taller boxes, visible gap between each

    # Input box — same width as stages
    box(ax, BX, 7.8, BW, 0.75, '.qmd  /  .md  /  .pdf', fontsize=15, bold=True)
    arrow(ax, 3.5, 7.8, 3.5, 7.25)

    stages = [
        ('Chunking',        '~2,000-token segments'),
        ('LLM Extraction',  'concepts + items per chunk'),
        ('Dedup + Format',  'merge, normalise, link'),
        ('Edge Extraction', 'prerequisite relationships'),
        ('Slot Filling',    'key_passage, motivation, recap'),
    ]
    y = 7.1
    for label, sub in stages:
        box(ax, BX, y - BOX_H, BW, BOX_H, '', fontsize=14, radius=0.03)
        ax.text(3.5, y - BOX_H * 0.40, label, ha='center', va='center',
                fontsize=14, fontweight='bold')
        ax.text(3.5, y - BOX_H * 0.75, sub, ha='center', va='center',
                fontsize=11, color='#444444')
        y -= BOX_H + GAP

    # Output  (y is now GAP below the bottom of the last box)
    bot = y + GAP          # actual bottom edge of last stage box
    arrow(ax, 3.5, bot, 3.5, bot - 0.28)
    out_y = bot - 0.42
    for i, label in enumerate(['concepts.jsonl', 'edges.jsonl', 'items.jsonl']):
        ax.text(3.5, out_y - i * 0.46, label, ha='center', va='center',
                fontsize=12.5, fontfamily='monospace', color='#222222')

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 2: Three extraction types ─────────────────────────────────────────
def diagram_extraction():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    # 1. Concepts
    ax.text(0.4, 8.55, '1.  Concepts', fontsize=16, fontweight='bold')
    circ(ax, 1.2, 7.9, 0.52, 'C', fontsize=22, bold=True)
    for i, line in enumerate(['id, kind, title', 'content, key_passage', 'motivation, prereqs']):
        ax.text(2.2, 8.15 - i*0.32, line, fontsize=12)

    ax.axhline(7.25, xmin=0.05, xmax=0.95, color='#bbbbbb', lw=1)

    # 2. Edges
    ax.text(0.4, 7.0, '2.  Edges', fontsize=16, fontweight='bold')
    circ(ax, 1.0, 6.25, 0.48, 'C1', fontsize=14, bold=True)
    ax.annotate('', xy=(3.0, 6.25), xytext=(1.48, 6.25),
                arrowprops=dict(arrowstyle='->', color='black', lw=2.0))
    ax.text(2.25, 6.55, 'requires', fontsize=11, ha='center')
    circ(ax, 3.52, 6.25, 0.48, 'C2', fontsize=14, bold=True)
    ax.axhline(5.6, xmin=0.05, xmax=0.95, color='#bbbbbb', lw=1)

    # 3. Items
    ax.text(0.4, 5.35, '3.  Items', fontsize=16, fontweight='bold')
    items = [('[fig]', 'Figure'), ('[ex]', 'Exercise'), ('[eg]', 'Example')]
    for i, (sym, label) in enumerate(items):
        bx = 0.5 + i * 2.1
        box(ax, bx, 3.95, 1.6, 1.0, sym, fontsize=16)
        ax.text(bx + 0.8, 3.72, label, ha='center', fontsize=12)

    ax.text(3.5, 3.3, 'linked to source concept node', ha='center',
            fontsize=12, style='italic', color='#555555')

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 2b: Edge schema (C1 → C2) ────────────────────────────────────────
def diagram_edges():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    R = 0.85
    C1X, C2X, NODE_Y = 1.4, 5.6, 7.9
    ax.text(C1X, NODE_Y + R + 0.18, 'prerequisite', ha='center', va='bottom',
            fontsize=13, color='#555555', style='italic')
    ax.text(C2X, NODE_Y + R + 0.18, 'dependent', ha='center', va='bottom',
            fontsize=13, color='#555555', style='italic')
    circ(ax, C1X, NODE_Y, R, 'C1', fontsize=30, bold=True)
    circ(ax, C2X, NODE_Y, R, 'C2', fontsize=30, bold=True)

    # Arrow from right edge of C1 to left edge of C2
    ax.annotate('', xy=(C2X - R, NODE_Y), xytext=(C1X + R, NODE_Y),
                arrowprops=dict(arrowstyle='->', color='black', lw=2.5, mutation_scale=22))
    mid_x = (C1X + C2X) / 2
    ax.text(mid_x, NODE_Y + 0.35, 'requires', ha='center', va='bottom',
            fontsize=15, fontweight='bold', color='#111111')

    ax.axhline(6.85, xmin=0.04, xmax=0.96, color='#bbbbbb', lw=1.2)

    # Edge schema
    ax.text(0.4, 6.6, 'Edge schema:', fontsize=15, fontweight='bold')
    schema = [
        ('kind',      'requires  |  generalizes  |  see_also  |  ...'),
        ('strength',  '0.0 – 1.0   (LLM confidence)'),
        ('rationale', '"C1 is needed to understand C2..."  (verbatim)'),
    ]
    y = 6.1
    for k, v in schema:
        ax.text(0.45, y, k, fontsize=12.5, fontweight='bold', fontfamily='monospace')
        ax.text(2.1, y, v, fontsize=11.5, color='#333333', va='center')
        y -= 0.62

    ax.axhline(3.9, xmin=0.04, xmax=0.96, color='#bbbbbb', lw=1.2)

    ax.text(0.4, 3.65, 'Prerequisite', fontsize=14, fontweight='bold')
    ax.text(0.4, 3.2,  'requires  ·  generalizes  ·  special_case_of  ·  formalizes',
            fontsize=12, color='#222222')

    ax.text(0.4, 2.65, 'Overlay', fontsize=14, fontweight='bold')
    ax.text(0.4, 2.2, 'see_also  ·  illustrates  ·  contrast_with  ·  used_to_prove',
            fontsize=12, color='#222222')

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 3: Concept node card ──────────────────────────────────────────────
def diagram_concept_node():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    # Outer card
    rect = FancyBboxPatch((0.15, 0.2), 6.7, 8.4, boxstyle='round,pad=0.06',
                          linewidth=2, edgecolor='black', facecolor='white')
    ax.add_patch(rect)

    # Header bar
    hdr = FancyBboxPatch((0.15, 8.0), 6.7, 0.6, boxstyle='square,pad=0',
                         linewidth=0, facecolor='#111111')
    ax.add_patch(hdr)
    ax.text(3.5, 8.3, 'phong_reflection_model', ha='center', va='center',
            fontsize=12, fontweight='bold', color='white', fontfamily='monospace')

    # Column headers
    ax.text(0.55, 7.72, 'Field', fontsize=13, fontweight='bold', color='#000000')
    ax.text(3.3,  7.72, 'What it is', fontsize=13, fontweight='bold', color='#000000')
    ax.axhline(7.55, xmin=0.04, xmax=0.96, color='#aaaaaa', lw=1.2)

    fields = [
        ('title, kind, aliases, tags', 'identity'),
        ('one_liner',                  'one-sentence summary'),
        ('content',                    'paraphrased book text'),
        ('key_passage',                'verbatim sentence from book'),
        ('motivation',                 'why this concept matters'),
        ('example',                    'worked example from the book'),
        ('recap_md',                   'bullet summary'),
        ('item_ids',                   'linked figures, exercises, theorems'),
        ('position',                   'chapter, section, line number'),
        ('source',                     'file + line spans (provenance)'),
    ]
    y = 7.3
    ROW_H = 0.69
    for i, (key, val) in enumerate(fields):
        if i % 2 == 0:
            bg = FancyBboxPatch((0.18, y - ROW_H*0.75), 6.64, ROW_H*0.85,
                                boxstyle='square,pad=0', linewidth=0, facecolor='#f7f7f7')
            ax.add_patch(bg)
        ax.text(0.38, y - ROW_H*0.3, key, fontsize=12, fontweight='bold',
                fontfamily='monospace', va='center', color='#111111')
        ax.text(3.3,  y - ROW_H*0.3, val, fontsize=12, va='center', color='#333333')
        y -= ROW_H

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 4: Concept → State Machine bridge ─────────────────────────────────
def diagram_sm_bridge():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    steps = [
        (8.3, 'Concept Node',  'content · key_passage\nmotivation · item_ids'),
        (6.2, 'Lesson Plan',   'HOOK → EXPLAIN\nPRACTICE → RECAP'),
        (4.1, 'State Machine', 'compiled, ready to execute'),
        (2.0, 'Output',        'Active Reader  /  Slides  /  Video'),
    ]
    BOX_H = 1.3
    for (y, title, sub) in steps:
        box(ax, 0.8, y - BOX_H, 5.4, BOX_H, '', fontsize=14, radius=0.04)
        ax.text(3.5, y - BOX_H * 0.38, title, ha='center', va='center',
                fontsize=15, fontweight='bold')
        ax.text(3.5, y - BOX_H * 0.72, sub, ha='center', va='center',
                fontsize=12, color='#444444')

    labels = ['compile', 'execute', 'render']
    ys     = [7.0, 4.9, 2.8]
    for label, y in zip(labels, ys):
        arrow(ax, 3.5, y, 3.5, y - 0.65)
        ax.text(4.0, y - 0.32, label, fontsize=12, color='#666666',
                style='italic', va='center')

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 5: Lesson state machine ──────────────────────────────────────────
def diagram_lesson_sm():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    states = ['HOOK', 'MOTIVATE', 'EXPLAIN', 'VISUAL', 'KEY MOMENT', 'PRACTICE', 'RECAP']
    BOX_H, GAP = 0.72, 0.18
    y = 8.6
    for i, s in enumerate(states):
        filled = s == 'PRACTICE'
        fc = '#111111' if filled else 'white'
        tc = 'white'  if filled else 'black'
        r = FancyBboxPatch((1.8, y - BOX_H), 3.4, BOX_H,
                           boxstyle='round,pad=0.04', lw=1.8,
                           edgecolor='black', facecolor=fc)
        ax.add_patch(r)
        ax.text(3.5, y - BOX_H/2, s, ha='center', va='center',
                fontsize=14, fontweight='bold', color=tc)
        if i < len(states) - 1:
            arrow(ax, 3.5, y - BOX_H, 3.5, y - BOX_H - GAP + 0.02)
        y -= BOX_H + GAP

    # HINT branch off PRACTICE
    practice_y = 8.6 - 5 * (BOX_H + GAP)
    hy = practice_y - BOX_H / 2
    ax.annotate('', xy=(5.5, hy),
                xytext=(5.2, hy),
                arrowprops=dict(arrowstyle='->', color='black', lw=1.4))
    box(ax, 5.5, hy - 0.38, 1.1, 0.76, 'HINT', fontsize=12)
    ax.text(6.05, hy - 0.55, '3+ wrong', ha='center', fontsize=9,
            style='italic', color='#555555')

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram 6: Multiple SM levels (vertical hierarchy) ───────────────────────
def diagram_sm_levels():
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    levels = [
        ('Session Scheduler',   'spaced repetition · next_due per concept'),
        ('Book Level',          'LOCKED  /  AVAILABLE  /  COMPLETE'),
        ('Chapter Level',       'unlock order via prereq graph'),
        ('Lesson Level',        'HOOK  →  EXPLAIN  →  PRACTICE  →  RECAP'),
        ('Behavior Tree',       'hint / MCQ / praise / Socratic question'),
    ]

    y = 8.6
    BOX_H, GAP = 1.05, 0.28
    for i, (title, sub) in enumerate(levels):
        box(ax, 0.5, y - BOX_H, 6.0, BOX_H, '', radius=0.04)
        ax.text(3.5, y - BOX_H * 0.37, title, ha='center', va='center',
                fontsize=15, fontweight='bold')
        ax.text(3.5, y - BOX_H * 0.73, sub, ha='center', va='center',
                fontsize=11.5, color='#444444')
        if i < len(levels) - 1:
            arrow(ax, 3.5, y - BOX_H, 3.5, y - BOX_H - GAP + 0.03)
        y -= BOX_H + GAP

    plt.tight_layout(pad=0.3)
    return fig


# ── Diagram: HSM nested ovals ────────────────────────────────────────────────
def diagram_hsm():
    from matplotlib.patches import Ellipse
    fig, ax = fig_setup(7, 9)
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    levels = [
        ('Book',          3.2, 4.2, '#95d44a'),
        ('Chapter',       2.5, 3.3, '#c5ec6e'),
        ('Concept',       1.75, 2.35, '#dff5a0'),
        ('Lesson States', 0.95, 1.35, '#f2fdd4'),
    ]
    cx, cy = 3.5, 4.5
    for i, (label, rx, ry, color) in enumerate(levels):
        e = Ellipse((cx, cy), width=rx*2, height=ry*2,
                    linewidth=2.0, edgecolor='#2d6a4f', facecolor=color, zorder=i+1)
        ax.add_patch(e)
        if i < len(levels) - 1:
            ax.text(cx - rx + 0.18, cy - ry + 0.22, label, ha='left', va='bottom',
                    fontsize=13, fontweight='bold', color='#1b4332', zorder=i+10)
        else:
            ax.text(cx, cy + 0.18, label, ha='center', va='center',
                    fontsize=13, fontweight='bold', color='#1b4332', zorder=i+10)
            ax.text(cx, cy - 0.32, 'HOOK · EXPLAIN · PRACTICE · RECAP',
                    ha='center', va='center', fontsize=9, color='#2d6a4f', zorder=i+10)

    plt.tight_layout(pad=0.3)
    return fig


# ── Main ──────────────────────────────────────────────────────────────────────
DIAGRAMS = [
    ('txt_pipe',       'txt_pipe_b',       diagram_pipeline,     'pipeline_flow.png'),
    ('s1_extraction',  's1_extraction_b',  diagram_extraction,   'extraction_types.png'),
    ('s1_edges',       's1_edges_b',       diagram_edges,        'edge_schema.png'),
    ('alex_slide_029', 'alex_slide_029_b', diagram_concept_node, 'concept_node.png'),
    ('s2_bridge',      's2_bridge_b',      diagram_sm_bridge,    'sm_bridge.png'),
    ('alex_slide_037', 'alex_slide_037_b', diagram_lesson_sm,    'lesson_sm.png'),
    ('s2_levels',      's2_levels_b',      diagram_sm_levels,    'sm_levels.png'),
    ('s2_game_patterns', 's2_game_patterns_b', diagram_hsm,       'hsm_nested.png'),
]


def run(targets=None):
    """Regenerate diagrams. Pass targets=['txt_pipe'] to update only one slide."""
    to_run = [(sid, bod, fn, fname)
              for sid, bod, fn, fname in DIAGRAMS
              if targets is None or sid in targets]

    prs = slides_svc.presentations().get(presentationId=PRES_ID).execute()
    existing_ids = {el['objectId']
                    for sl in prs['slides']
                    for el in sl.get('pageElements', [])}

    del_reqs = [{'deleteObject': {'objectId': f'{sid}_diagram'}}
                for sid, _, _, _ in to_run
                if f'{sid}_diagram' in existing_ids]
    if del_reqs:
        slides_svc.presentations().batchUpdate(
            presentationId=PRES_ID, body={'requests': del_reqs}
        ).execute()
        print(f"Deleted {len(del_reqs)} existing diagram(s).")

    create_reqs = []
    tmp_files = []
    for slide_id, body_oid, gen_fn, fname in to_run:
        print(f'  Generating {fname}...')
        fig = gen_fn()
        tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        fig.savefig(tmp.name, dpi=200, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        tmp_files.append(tmp.name)

        print(f'  Uploading {fname}...')
        url = upload_image(tmp.name, fname)
        create_reqs.append(make_create_request(slide_id, url))
        print(f'  OK -> {url[:60]}')

    print(f'\nInserting {len(create_reqs)} diagrams...')
    resp = slides_svc.presentations().batchUpdate(
        presentationId=PRES_ID, body={'requests': create_reqs}
    ).execute()
    print(f'Done: {len(resp.get("replies", []))} replies')
    print(f'\nhttps://docs.google.com/presentation/d/{PRES_ID}/edit')

    for f in tmp_files:
        os.unlink(f)


if __name__ == '__main__':
    import sys
    targets = sys.argv[1:] or None   # e.g. python add_diagrams.py txt_pipe
    run(targets)
