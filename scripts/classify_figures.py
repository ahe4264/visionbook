#!/usr/bin/env python3
"""
Generalized figure classifier using Gemini vision (default) or CLIP (--clip-only).
Classifies into: 3d_projection, 2d_diagram, photograph, other.
By default only classifies figures referenced in the chapter's .qmd file.

Usage:
    python scripts/classify_figures.py imaging
    python scripts/classify_figures.py --all
    python scripts/classify_figures.py imaging --clip-only
    python scripts/classify_figures.py imaging --all-figures
    python scripts/classify_figures.py imaging --retry-uncertain
    python scripts/classify_figures.py imaging --output results.json
"""

import argparse
import base64
import concurrent.futures
import json
import os
import re
import shutil
import sys
import threading
import time
from pathlib import Path

from tqdm import tqdm

from dotenv import load_dotenv

ENV_FILE = Path("figure-platform/backend/.env")

import numpy as np
from PIL import Image

# Multiple prompts per category — embeddings are averaged (ensembling, used by CLIP)
CATEGORY_PROMPTS = {
    "3d_projection": [
        "a 3D geometric diagram showing perspective, depth, and spatial relationships",
        "a technical drawing with 3D axes and vanishing points",
        "a diagram illustrating three-dimensional space or geometry",
        "a 3D scene with objects arranged in space",
    ],
    "2d_diagram": [
        "a flat 2D diagram with arrows, shapes, and labels",
        "a conceptual illustration or schematic drawing",
        "a technical diagram explaining a concept with 2D shapes",
        "a diagram with labeled components and connecting arrows",
    ],
    "other": [
        "a photograph of a real-world scene or object",
        "text, a table, or mathematical equations on a page",
        "a figure containing real-world imagery or complex mixed content",
        "a chart, plot, or data visualization",
    ],
}

CATEGORIES = list(CATEGORY_PROMPTS.keys())

# Short descriptions used in LLM prompts
CATEGORY_DESCRIPTIONS = {
    "3d_projection": "a clean schematic explaining a 3D concept (projection, coordinate systems, camera geometry) with labeled axes and simple shapes — recreatable with basic 3D primitives; no photos or equations",
    "2d_diagram":    "a clean 2D schematic, flowchart, or conceptual illustration with simple shapes and arrows — recreatable with basic 2D primitives; no photos or equations",
    "other":         "anything hard to recreate interactively: photos or real-world imagery (even partially), equations, data plots, tables, densely detailed or complex figures with many fine-grained shapes or lines",
}

GEMINI_MODEL = "gemini-3.1-pro-preview"

FIGURES_ROOT = Path("figures")

# Files to skip
SKIP_SUFFIXES = {".pdf", ".eps", ".tex", ".bib", ".svg"}
_SKIP_STEM_RE = re.compile(r"(_[a-z]|-\d+)$")


def load_clip():
    try:
        import open_clip
    except ImportError:
        print("ERROR: open_clip not installed. Run: pip install open-clip-torch")
        sys.exit(1)

    model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14", pretrained="openai")
    tokenizer = open_clip.get_tokenizer("ViT-L-14")
    model.eval()

    import torch
    # Encode all prompts per category and average (ensembling)
    category_features = []
    for prompts in CATEGORY_PROMPTS.values():
        tokens = tokenizer(prompts)
        with torch.no_grad():
            feats = model.encode_text(tokens)
            feats /= feats.norm(dim=-1, keepdim=True)
            avg_feat = feats.mean(dim=0)
            avg_feat /= avg_feat.norm()
        category_features.append(avg_feat)
    text_features = torch.stack(category_features)

    return model, preprocess, text_features


def clip_classify(img_path: Path, model, preprocess, text_features, threshold: float, debug: bool = False):
    import torch

    try:
        img = Image.open(img_path).convert("RGB")
    except Exception as e:
        return {"category": "other", "confidence": 0.0, "method": "clip", "low_confidence": True, "error": str(e)}

    tensor = preprocess(img).unsqueeze(0)
    with torch.no_grad():
        img_features = model.encode_image(tensor)
        img_features /= img_features.norm(dim=-1, keepdim=True)
        similarities = (img_features @ text_features.T).squeeze(0).numpy()

    probs = (similarities / similarities.sum()) if similarities.sum() > 0 else similarities
    import torch as _torch
    probs = _torch.tensor(similarities).softmax(dim=0).numpy()

    best_idx = int(np.argmax(probs))
    confidence = float(probs[best_idx])
    category = CATEGORIES[best_idx]
    low_confidence = confidence < threshold

    if debug:
        scores = {CATEGORIES[i]: round(float(probs[i]), 4) for i in range(len(CATEGORIES))}
        print(f"  probs: {scores}")

    return {
        "category": category,
        "confidence": round(confidence, 4),
        "method": "clip",
        "low_confidence": low_confidence,
    }


def gemini_classify(img_path: Path, detect_panels: bool = False) -> dict:
    try:
        from google import genai
    except ImportError:
        print("ERROR: google-genai not installed. Run: pip install google-genai")
        sys.exit(1)

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable not set.")
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    categories_desc = "\n".join(f'- "{k}": {v}' for k, v in CATEGORY_DESCRIPTIONS.items())

    if detect_panels:
        prompt = f"""Analyze this figure. Classify it into one of these categories:
{categories_desc}

Also determine if it contains multiple distinct panels (sub-figures labeled a, b, c... or arranged side-by-side/stacked with separate content) WHERE THE PANELS ARE 2D OR 3D DIAGRAMS (not photographs or non-diagram content). When panels are visually connected by arrows or transformation symbols (e.g. →), consider whether they may represent a single unified concept (such as a before/after or input/output relationship) rather than truly independent sub-figures.

Respond with JSON only, no other text.

If multi-panel with diagram panels, include a "panels" array with normalized bounding boxes [x1, y1, x2, y2] (each value 0.0–1.0, origin at top-left):
{{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>", "panels": [{{"label": "a", "bbox": [x1, y1, x2, y2]}}, ...]}}

If single panel (or panels are non-diagram):
{{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}}"""
    else:
        prompt = f"""Classify this figure into exactly one of these categories:

{categories_desc}

Respond with JSON only, no other text:
{{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}}"""

    img = Image.open(img_path).convert("RGB")
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[img, prompt],
            )
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            result = json.loads(text)
            category = result.get("category", "other")
            if category not in CATEGORIES:
                category = "other"
            record = {
                "category": category,
                "confidence": round(float(result.get("confidence", 0.9)), 4),
                "method": "gemini",
                "low_confidence": False,
                "reasoning": result.get("reasoning", ""),
            }
            if "panels" in result:
                record["panels"] = result["panels"]
            return record
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                tqdm.write(f"  ⚠ {img_path.name}: API error (attempt {attempt + 1}/{max_retries}), retrying in {wait}s — {e}")
                time.sleep(wait)
            else:
                tqdm.write(f"  ✗ {img_path.name}: failed after {max_retries} attempts — {e}")
                return {"category": "other", "confidence": 0.0, "method": "gemini", "low_confidence": True, "error": str(e)}


def split_and_save_panels(img_path: Path, panels: list) -> list[Path]:
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    saved = []
    for panel in panels:
        label = str(panel.get("label", len(saved)))
        bbox = panel["bbox"]  # [x1, y1, x2, y2] normalized
        x1 = max(0, int(bbox[0] * w))
        y1 = max(0, int(bbox[1] * h))
        x2 = min(w, int(bbox[2] * w))
        y2 = min(h, int(bbox[3] * h))
        if x2 <= x1 or y2 <= y1:
            continue
        crop = img.crop((x1, y1, x2, y2))
        out_path = img_path.parent / f"{img_path.stem}_{label}.png"
        crop.save(out_path)
        saved.append(out_path)
    return saved


def extract_figures_from_qmd(chapter: str, qmd_path: Path | None = None) -> set | None:
    qmd_file = qmd_path or Path(f"{chapter}.qmd")
    if not qmd_file.exists():
        print(f"Warning: {qmd_file} not found. Processing all figures.")
        return None

    content = qmd_file.read_text(encoding="utf-8")
    pattern = rf'!\[([^\]]*)\]\(figures/{chapter}/([a-zA-Z0-9_.-]+\.(?:png|jpg|JPG))\)([^\n]*)'
    matches = re.findall(pattern, content)
    used = {filename for _, filename, _ in matches}
    print(f"Found {len(used)} figures referenced in {qmd_file}")
    return used


def should_skip(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    return bool(_SKIP_STEM_RE.search(path.stem))


def classify_chapter(chapter: str, threshold: float, clip_only: bool, retry_uncertain: bool, output_path: Path, debug: bool = False, qmd_only: bool = False, qmd_path: Path | None = None, split: bool = True):
    figures_dir = FIGURES_ROOT / chapter
    if not figures_dir.exists():
        print(f"ERROR: figures/{chapter}/ does not exist.")
        return []

    # Collect image files — use a set to avoid duplicates on case-insensitive filesystems
    all_files: set = set()
    for ext in ("*.png", "*.jpg", "*.JPG"):
        all_files.update(figures_dir.glob(ext))
    files = sorted(f for f in all_files if not should_skip(f))

    if qmd_only:
        used = extract_figures_from_qmd(chapter, qmd_path)
        if used is not None:
            files = [f for f in files if f.name in used]

    if not files:
        print(f"No images found in figures/{chapter}/")
        return []

    # If retry-uncertain, load existing results and only reprocess low_confidence ones
    existing = {}
    if retry_uncertain and output_path.exists():
        with open(output_path) as f:
            for record in json.load(f):
                existing[record["filename"]] = record
        files = [f for f in files if existing.get(f.name, {}).get("low_confidence", True)]
        print(f"Retrying {len(files)} low-confidence figures from previous run.")

    clip_model = clip_preprocess = clip_text_features = None
    if clip_only:
        print(f"Loading CLIP model...")
        clip_model, clip_preprocess, clip_text_features = load_clip()



    results = dict(existing)  # start from existing if retry

    FOLDER_MAP = {"2d_diagram": "2d", "3d_projection": "3d"}
    lock = threading.Lock()

    def copy_to_subfolder(rec):
        folder = FOLDER_MAP.get(rec.get("category"), "other")
        dest_dir = figures_dir / folder
        dest_dir.mkdir(exist_ok=True)
        src = figures_dir / rec["filename"]
        if src.exists():
            shutil.copy2(src, dest_dir / rec["filename"])

    def process_one(args):
        i, img_path = args
        if clip_only:
            record = clip_classify(img_path, clip_model, clip_preprocess, clip_text_features, threshold, debug=debug)
        else:
            record = gemini_classify(img_path, detect_panels=split)
        record["filename"] = img_path.name

        if split and record.get("panels"):
            raw_panels = record.pop("panels")
            panel_paths = split_and_save_panels(img_path, raw_panels)
            kept_filenames = []
            for panel_path in panel_paths:
                panel_record = gemini_classify(panel_path, detect_panels=True)
                panel_record["filename"] = panel_path.name
                panel_record["parent"] = img_path.name
                panel_record["multipart"] = False
                copy_to_subfolder(panel_record)
                panel_path.unlink(missing_ok=True)
                kept_filenames.append(panel_path.name)
                with lock:
                    results[panel_path.name] = panel_record
            record["split"] = True
            record["multipart"] = True
            record["panels"] = kept_filenames
            with lock:
                results[img_path.name] = record
        else:
            record["multipart"] = False
            if record.get("error"):
                tqdm.write(f"  ✗ {img_path.name}: {record['error']}")
            elif record.get("low_confidence"):
                tqdm.write(f"  ⚠ {img_path.name}: {record['category']} ({record['confidence']:.0%})")
            copy_to_subfolder(record)
            with lock:
                results[img_path.name] = record
        pbar.update(1)

    with tqdm(total=len(files), unit="fig", desc=chapter) as pbar:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(process_one, enumerate(files, 1)))

    output = list(results.values())
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    total = len(output)
    low_conf = sum(1 for r in output if r.get("low_confidence"))
    print(f"\nDone. {total} figures → {output_path}")
    print(f"Low confidence: {low_conf}/{total} ({low_conf/total:.0%})")

    by_cat = {}
    for r in output:
        by_cat.setdefault(r["category"], 0)
        by_cat[r["category"]] += 1
    for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Classify figures using CLIP + optional LLM fallback")
    parser.add_argument("chapter", nargs="?", help="Chapter folder name under figures/")
    parser.add_argument("--all", action="store_true", help="Run on all chapters")
    parser.add_argument("--clip-only", action="store_true", help="Use CLIP instead of Gemini (faster, free, but less accurate)")
    parser.add_argument("--threshold", type=float, default=0.4, help="CLIP softmax confidence threshold (default 0.4; only used with --clip-only)")
    parser.add_argument("--retry-uncertain", action="store_true", help="Re-run only low-confidence figures from a prior run")
    parser.add_argument("--all-figures", action="store_true", help="Classify all images in the figures/ dir, not just those referenced in the .qmd")
    parser.add_argument("--debug", action="store_true", help="Print all category scores per figure for spot-checking")
    parser.add_argument("--no-split", action="store_true", help="Disable multi-panel detection and splitting")
    parser.add_argument("--qmd", type=str, default=None, help="Path to the .qmd file to use for figure filtering (default: <chapter>.qmd in project root)")
    parser.add_argument("--output", type=str, default=None, help="Output JSON path (default: figures/<chapter>/classification_results.json)")
    args = parser.parse_args()

    load_dotenv(ENV_FILE)

    if not args.chapter and not args.all:
        parser.print_help()
        sys.exit(1)

    chapters = []
    if args.all:
        if not FIGURES_ROOT.exists():
            print("ERROR: figures/ directory not found. Run from project root.")
            sys.exit(1)
        chapters = [d.name for d in sorted(FIGURES_ROOT.iterdir()) if d.is_dir()]
    else:
        chapters = [args.chapter]

    for chapter in chapters:
        print(f"\n{'='*60}")
        print(f"Chapter: {chapter}")
        print(f"{'='*60}")

        if args.output:
            output_path = Path(args.output)
        else:
            output_path = FIGURES_ROOT / chapter / "classification_results.json"

        classify_chapter(
            chapter=chapter,
            threshold=args.threshold,
            clip_only=args.clip_only,
            retry_uncertain=args.retry_uncertain,
            output_path=output_path,
            debug=args.debug,
            qmd_only=not args.all_figures,
            qmd_path=Path(args.qmd) if args.qmd else None,
            split=not args.no_split,
        )


if __name__ == "__main__":
    main()
