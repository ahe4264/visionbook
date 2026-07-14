"""
Map figure folders to their corresponding chapter QMD files.
Uses exact then fuzzy matching; writes results to figures/chapter_qmd_map.json.
"""

import os
import json
import difflib

REPO = os.path.join(os.path.dirname(__file__), "..")
FIGURES_DIR = os.path.join(REPO, "figures")
QMD_DIR = REPO

# Manual overrides for cases that can't be resolved by fuzzy matching
MANUAL_MAP = {
    "3d_scene_understanding": None,          # ambiguous — covers single_view + stereo
    "Image_processing_fourier": "image_processing_fourier.qmd",
    "Image_processing_sampling": "sampling_and_aliasing.qmd",
    "blur_filters": "blurring_2.qmd",
    "generative_modeling_and_representation_learning": "generative_modeling_and_rep_learning.qmd",
    "heeger_bergen": "spatial_filter_sets.qmd",
    "intelligent_agents": None,              # no matching QMD found
    "learning_3d": "3d_learning.qmd",
    "nerfs": "nerf.qmd",
    "neural_nets_as_data_transformations": "neural_nets_as_distribution_transformers.qmd",
    "object_recognition": "object_recognition_v3.qmd",
    "papers": None,                          # not a chapter
    "preface": None,                         # no matching QMD
    "pyramids": "pyramids_new_notation.qmd",
    "sfm": "multiview.qmd",
    "simplesystem_revisited": "simplesystem_final.qmd",
    "single_view_3d": "3d_scene_understanding_single_view.qmd",
    "spatial_filters": "spatial_filter_sets.qmd",
    "statistical_image_models": "stat_image_models_revised.qmd",
    "stereo": "3d_scene_understanding_stereo.qmd",
    "temporal_filters": "temporal_filters_v2.qmd",
    "upsamplig_downsampling": "upsamplig_downsampling_2.qmd",
    "vision_and_language": "VLMs.qmd",
}

def get_figure_folders():
    entries = os.listdir(FIGURES_DIR)
    return sorted(
        e for e in entries
        if os.path.isdir(os.path.join(FIGURES_DIR, e))
    )

def get_qmd_files():
    return sorted(
        f for f in os.listdir(QMD_DIR)
        if f.endswith(".qmd") and not f.startswith("part_") and f not in (
            "index.qmd", "references.qmd", "copyright.qmd", "series.qmd",
            "notations.qmd", "how_to_write_papers.qmd",
        )
    )

def fuzzy_match(folder, qmd_names):
    """Return best fuzzy match from qmd_names for folder, or None."""
    folder_lower = folder.lower()
    # Strip .qmd for comparison
    stems = [q[:-4] for q in qmd_names]
    matches = difflib.get_close_matches(folder_lower, stems, n=1, cutoff=0.6)
    if matches:
        return matches[0] + ".qmd"
    return None

def build_map():
    folders = get_figure_folders()
    qmds = get_qmd_files()
    qmd_set = set(qmds)

    result = {}
    for folder in folders:
        if folder in MANUAL_MAP:
            result[folder] = MANUAL_MAP[folder]
            continue

        # Exact match (case-insensitive)
        exact = folder.lower() + ".qmd"
        if exact in {q.lower() for q in qmd_set}:
            # Find the real-case version
            match = next(q for q in qmd_set if q.lower() == exact)
            result[folder] = match
            continue

        # Fuzzy match
        fuzzy = fuzzy_match(folder, qmds)
        result[folder] = fuzzy

    return result

if __name__ == "__main__":
    mapping = build_map()
    out_path = os.path.join(FIGURES_DIR, "chapter_qmd_map.json")
    with open(out_path, "w") as f:
        json.dump(mapping, f, indent=2)
    print(f"Wrote {len(mapping)} entries to {out_path}")
    unmatched = [k for k, v in mapping.items() if v is None]
    if unmatched:
        print(f"Unmatched folders ({len(unmatched)}): {unmatched}")
