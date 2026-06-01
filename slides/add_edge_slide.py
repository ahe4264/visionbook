"""
Create the edge-extraction slide (s1_edges) at index 6 and insert its diagram.

Run once:
    python slides/add_edge_slide.py

After creating the slide you can regenerate just its diagram with:
    python slides/add_diagrams.py s1_edges
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
CREDS_DIR  = Path('/Users/su/Documents/su/slides-generator')
TOKEN_FILE = CREDS_DIR / 'token.json'
CONFIG_FILE = CREDS_DIR / 'config.json'

creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

svc      = build('slides', 'v1', credentials=creds)
drv      = build('drive',  'v3', credentials=creds)
PRES_ID  = '10tZB26Gh-PBdv_rTaT_nUdc6AEr6QccbsRCwu3Dd8r0'
FOLDER_ID = json.loads(CONFIG_FILE.read_text())['drive_folder_id']

# ── Layout constants (match existing slides) ──────────────────────────────────
PAD_X = 1439175
T_Y, T_W, T_H = 977100, 19426500, 1530300
B_Y, B_W, B_H = 3512000, 20000100, 9999900
IMG_X, IMG_Y, IMG_W, IMG_H = 13200000, 1800000, 10800000, 11200000

BG_WHITE = {'red': 1.0,  'green': 1.0, 'blue': 1.0}
TXT_DARK = {'red': 0.08, 'green': 0.08, 'blue': 0.08}
def rgb(d): return {'opaqueColor': {'rgbColor': d}}

# ── Detect font from existing deck ────────────────────────────────────────────
prs = svc.presentations().get(presentationId=PRES_ID).execute()
slides = prs['slides']
print(f"Current deck: {len(slides)} slides")

font, title_pt, body_pt = 'Helvetica Neue', 38.0, 34.0
for sl in slides:
    sizes, fonts = [], []
    for el in sl.get('pageElements', []):
        for te in el.get('shape', {}).get('text', {}).get('textElements', []):
            ts = te.get('textRun', {}).get('style', {})
            fs = ts.get('fontSize', {}).get('magnitude')
            ff = ts.get('fontFamily')
            t  = te.get('textRun', {}).get('content', '').strip()
            if fs and fs >= 12 and t: sizes.append(fs)
            if ff and ff != 'None': fonts.append(ff)
    if len(set(sizes)) >= 2:
        font     = fonts[0] if fonts else font
        title_pt = max(sizes)
        body_pt  = sorted(set(sizes))[-2]
        break
print(f"Style: {font}, title={title_pt:.0f}pt, body={body_pt:.0f}pt")

# ── Slide content ─────────────────────────────────────────────────────────────
SID   = 's1_edges'
TITLE = 'Edge Extraction'
BODY  = (
    'Prerequisite:\n'
    '  requires  ·  special_case_of  ·  generalizes  ·  formalizes\n'
    '\n'
    'Overlay:\n'
    '  see_also  ·  illustrates  ·  contrast_with  ·  used_to_prove\n'
    '\n'
    'Each edge carries:\n'
    '  kind  ·  strength (0.0 – 1.0)\n'
    '  rationale: verbatim evidence sentence from book\n'
    '\n'
    'Extracted by GPT-4.1-mini:\n'
    '  given concept pair + source text, identify\n'
    '  directed prerequisite or overlay relationship'
)

# ── Check if slide already exists ─────────────────────────────────────────────
existing = {sl['objectId'] for sl in slides}
if SID in existing:
    print(f"Slide '{SID}' already exists — skipping creation.")
else:
    INSERT_IDX = 6   # after s1_extraction (index 5)
    t_id, b_id = f'{SID}_t', f'{SID}_b'
    reqs = [
        {'createSlide': {
            'objectId': SID,
            'insertionIndex': INSERT_IDX,
            'slideLayoutReference': {'predefinedLayout': 'BLANK'},
        }},
        {'updatePageProperties': {
            'objectId': SID,
            'pageProperties': {'pageBackgroundFill': {'solidFill': {'color': {'rgbColor': BG_WHITE}}}},
            'fields': 'pageBackgroundFill',
        }},
        # Title
        {'createShape': {'objectId': t_id, 'shapeType': 'TEXT_BOX', 'elementProperties': {
            'pageObjectId': SID,
            'size': {'width': {'magnitude': T_W, 'unit': 'EMU'}, 'height': {'magnitude': T_H, 'unit': 'EMU'}},
            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': PAD_X, 'translateY': T_Y, 'unit': 'EMU'},
        }}},
        {'updateShapeProperties': {'objectId': t_id, 'shapeProperties': {'contentAlignment': 'BOTTOM'}, 'fields': 'contentAlignment'}},
        {'insertText': {'objectId': t_id, 'insertionIndex': 0, 'text': TITLE}},
        {'updateTextStyle': {'objectId': t_id, 'textRange': {'type': 'ALL'}, 'style': {
            'fontFamily': font, 'fontSize': {'magnitude': title_pt, 'unit': 'PT'},
            'bold': True, 'foregroundColor': rgb(TXT_DARK),
        }, 'fields': 'fontFamily,fontSize,bold,foregroundColor'}},
        {'updateParagraphStyle': {'objectId': t_id, 'textRange': {'type': 'ALL'},
            'style': {'lineSpacing': 100, 'alignment': 'START'}, 'fields': 'lineSpacing,alignment'}},
        # Body
        {'createShape': {'objectId': b_id, 'shapeType': 'TEXT_BOX', 'elementProperties': {
            'pageObjectId': SID,
            'size': {'width': {'magnitude': B_W, 'unit': 'EMU'}, 'height': {'magnitude': B_H, 'unit': 'EMU'}},
            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': PAD_X, 'translateY': B_Y, 'unit': 'EMU'},
        }}},
        {'updateShapeProperties': {'objectId': b_id, 'shapeProperties': {'contentAlignment': 'TOP'}, 'fields': 'contentAlignment'}},
        {'insertText': {'objectId': b_id, 'insertionIndex': 0, 'text': BODY}},
        {'updateTextStyle': {'objectId': b_id, 'textRange': {'type': 'ALL'}, 'style': {
            'fontFamily': font, 'fontSize': {'magnitude': body_pt, 'unit': 'PT'},
            'bold': False, 'foregroundColor': rgb(TXT_DARK),
        }, 'fields': 'fontFamily,fontSize,bold,foregroundColor'}},
        {'updateParagraphStyle': {'objectId': b_id, 'textRange': {'type': 'ALL'},
            'style': {'lineSpacing': 100, 'alignment': 'START'}, 'fields': 'lineSpacing,alignment'}},
    ]
    svc.presentations().batchUpdate(presentationId=PRES_ID, body={'requests': reqs}).execute()
    print(f"Slide '{SID}' created at index {INSERT_IDX}.")

# ── Generate diagram ──────────────────────────────────────────────────────────
def diagram_edges():
    fig, ax = plt.subplots(figsize=(7, 9))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.axis('off')
    ax.set_xlim(0, 7); ax.set_ylim(0, 9)

    def circ(cx, cy, r, text, fontsize=14, bold=False):
        c = Circle((cx, cy), r, linewidth=1.8, edgecolor='black', facecolor='white')
        ax.add_patch(c)
        ax.text(cx, cy, text, ha='center', va='center',
                fontsize=fontsize, fontweight='bold' if bold else 'normal',
                fontfamily='sans-serif')

    # ── Main C1 → C2 diagram ─────────────────────────────────────────────────
    R = 0.85
    C1X, C2X, NODE_Y = 1.4, 5.6, 7.9
    circ(C1X, NODE_Y, R, 'C1', fontsize=30, bold=True)
    circ(C2X, NODE_Y, R, 'C2', fontsize=30, bold=True)

    # Arrow from right edge of C1 to left edge of C2
    ax.annotate('', xy=(C2X - R, NODE_Y), xytext=(C1X + R, NODE_Y),
                arrowprops=dict(arrowstyle='->', color='black', lw=2.5, mutation_scale=22))
    mid_x = (C1X + C2X) / 2
    ax.text(mid_x, NODE_Y + 0.35, 'requires', ha='center', va='bottom',
            fontsize=15, fontweight='bold', color='#111111')

    ax.axhline(6.85, xmin=0.04, xmax=0.96, color='#bbbbbb', lw=1.2)

    # ── Edge fields ───────────────────────────────────────────────────────────
    ax.text(0.4, 6.6, 'Edge schema:', fontsize=15, fontweight='bold')
    schema = [
        ('kind',      'requires  |  generalizes  |  see_also  |  ...'),
        ('strength',  '0.0 – 1.0   (LLM confidence)'),
        ('rationale', '"C1 is needed to understand C2..." (verbatim)'),
    ]
    y = 6.1
    for k, v in schema:
        ax.text(0.45, y, k, fontsize=12.5, fontweight='bold', fontfamily='monospace')
        ax.text(2.05, y, v, fontsize=11.5, color='#333333', va='center')
        y -= 0.62

    ax.axhline(3.9, xmin=0.04, xmax=0.96, color='#bbbbbb', lw=1.2)

    # ── Edge type categories ──────────────────────────────────────────────────
    ax.text(0.4, 3.65, 'Prerequisite', fontsize=14, fontweight='bold')
    ax.text(0.4, 3.2,  'requires  ·  generalizes  ·  special_case_of  ·  formalizes',
            fontsize=12, color='#222222')

    ax.text(0.4, 2.65, 'Overlay', fontsize=14, fontweight='bold')
    ax.text(0.4, 2.2, 'see_also  ·  illustrates  ·  contrast_with  ·  used_to_prove',
            fontsize=12, color='#222222')

    plt.tight_layout(pad=0.3)
    return fig

# ── Upload diagram ────────────────────────────────────────────────────────────
print("Generating edge diagram...")
fig = diagram_edges()
tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
fig.savefig(tmp.name, dpi=200, bbox_inches='tight', facecolor='white')
plt.close(fig)

print("Uploading...")
meta  = {'name': 'edge_schema.png', 'parents': [FOLDER_ID]}
media = MediaFileUpload(tmp.name, mimetype='image/png')
f = drv.files().create(body=meta, media_body=media, fields='id').execute()
fid = f['id']
drv.permissions().create(fileId=fid, body={'type': 'anyone', 'role': 'reader'}).execute()
url = f'https://drive.google.com/uc?id={fid}'
print(f"  URL: {url[:60]}")

# ── Delete old diagram if exists ──────────────────────────────────────────────
prs2 = svc.presentations().get(presentationId=PRES_ID).execute()
all_ids = {el['objectId'] for sl in prs2['slides'] for el in sl.get('pageElements', [])}
img_oid = f'{SID}_diagram'
reqs2 = []
if img_oid in all_ids:
    reqs2.append({'deleteObject': {'objectId': img_oid}})

reqs2.append({'createImage': {
    'objectId': img_oid,
    'url': url,
    'elementProperties': {
        'pageObjectId': SID,
        'size': {'width': {'magnitude': IMG_W, 'unit': 'EMU'}, 'height': {'magnitude': IMG_H, 'unit': 'EMU'}},
        'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': IMG_X, 'translateY': IMG_Y, 'unit': 'EMU'},
    },
}})

svc.presentations().batchUpdate(presentationId=PRES_ID, body={'requests': reqs2}).execute()
os.unlink(tmp.name)
print(f"Done. https://docs.google.com/presentation/d/{PRES_ID}/edit")
