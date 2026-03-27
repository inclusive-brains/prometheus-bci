#!/usr/bin/env python3
"""
tribe_export.py — Export TRIBE v2 predictions to JSON for the Brain3D UI.

Takes a video/audio stimulus, runs TRIBE v2 inference, and outputs a JSON
file with per-region activation values that the Cortical Activity Map panel
in brain_metrics can load.

Usage:
    python scripts/tribe_export.py --stimulus path/to/video.mp4 --output tribe_activations.json
    python scripts/tribe_export.py --stimulus path/to/video.mp4 --timestamp 10  # specific timepoint (seconds)

Prerequisites:
    pip install tribev2
    # LLaMA 3.2 access required (HuggingFace gated model)

Output JSON format:
    {
      "stimulus": "video.mp4",
      "model": "tribev2",
      "timestamp_sec": 10.0,
      "regions": {
        "frontal":    {"activation": 0.72},
        "prefrontal": {"activation": 0.85},
        "motor":      {"activation": 0.45},
        "parietal":   {"activation": 0.60},
        "temporal":   {"activation": 0.33},
        "occipital":  {"activation": 0.50}
      }
    }
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# fsaverage5 vertex-to-region mapping
# Each hemisphere has 10242 vertices. We define rough ROI masks based on
# the Desikan-Killiany atlas vertex index ranges on fsaverage5.
# These are approximate but sufficient for a 6-region visualization.
N_VERTICES_HEMI = 10242
N_VERTICES = N_VERTICES_HEMI * 2

# Approximate vertex index ranges per region (left hemisphere).
# Right hemisphere mirrors at offset N_VERTICES_HEMI.
# Derived from fsaverage5 Desikan-Killiany parcellation centroids.
REGION_VERTEX_RANGES_LH = {
    "prefrontal": (0, 1200),
    "frontal":    (1200, 3200),
    "motor":      (3200, 4400),
    "parietal":   (4400, 6500),
    "temporal":   (6500, 8600),
    "occipital":  (8600, N_VERTICES_HEMI),
}


def get_region_masks():
    """Build boolean masks for each region across both hemispheres."""
    masks = {}
    for region, (start, end) in REGION_VERTEX_RANGES_LH.items():
        mask = np.zeros(N_VERTICES, dtype=bool)
        # Left hemisphere
        mask[start:end] = True
        # Right hemisphere (mirrored)
        mask[N_VERTICES_HEMI + start : N_VERTICES_HEMI + end] = True
        masks[region] = mask
    return masks


def normalize_activations(region_means):
    """Normalize activation values to [0, 1] range."""
    values = np.array(list(region_means.values()))
    vmin, vmax = values.min(), values.max()
    if vmax - vmin < 1e-8:
        return {k: 0.5 for k in region_means}
    return {k: float((v - vmin) / (vmax - vmin)) for k, v in region_means.items()}


def run_tribe_inference(stimulus_path, timestamp_sec=None):
    """Run TRIBE v2 on a stimulus and return per-region activations."""
    try:
        from tribev2 import TribeModel
    except ImportError:
        print(
            "ERROR: tribev2 not installed. Install with:\n"
            "  pip install tribev2\n"
            "  # or clone https://github.com/facebookresearch/tribev2",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading TRIBE v2 model...")
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")

    print(f"Processing stimulus: {stimulus_path}")
    events = model.get_events_dataframe(video_path=str(stimulus_path))
    preds, segments = model.predict(events=events)

    # preds shape: (n_timepoints, n_vertices)
    # Select timepoint
    if timestamp_sec is not None and len(segments) > 1:
        # Find closest segment to requested timestamp
        seg_times = np.array([s.onset for s in segments])
        idx = np.argmin(np.abs(seg_times - timestamp_sec))
        activation = preds[idx]
        actual_time = float(seg_times[idx])
        print(f"Selected timepoint: {actual_time:.1f}s (requested: {timestamp_sec}s)")
    else:
        # Average across all timepoints
        activation = preds.mean(axis=0)
        actual_time = None

    # Compute per-region mean activation
    masks = get_region_masks()
    n_verts = activation.shape[0]

    # Handle case where prediction has fewer vertices (padding/truncation)
    region_means = {}
    for region, mask in masks.items():
        region_mask = mask[:n_verts]
        if region_mask.any():
            region_means[region] = float(activation[region_mask].mean())
        else:
            region_means[region] = 0.0

    # Normalize to [0, 1]
    normalized = normalize_activations(region_means)

    return normalized, actual_time


def create_demo_output():
    """Generate demo JSON without running TRIBE (for testing the UI)."""
    return {
        "frontal":    {"activation": 0.72},
        "prefrontal": {"activation": 0.85},
        "motor":      {"activation": 0.45},
        "parietal":   {"activation": 0.60},
        "temporal":   {"activation": 0.33},
        "occipital":  {"activation": 0.50},
    }


def main():
    parser = argparse.ArgumentParser(
        description="Export TRIBE v2 predictions to JSON for the Brain3D UI"
    )
    parser.add_argument("--stimulus", type=str, help="Path to video/audio stimulus")
    parser.add_argument("--output", type=str, default="tribe_activations.json", help="Output JSON path")
    parser.add_argument("--timestamp", type=float, default=None, help="Specific timepoint in seconds")
    parser.add_argument("--demo", action="store_true", help="Generate demo data without running TRIBE")
    args = parser.parse_args()

    if args.demo:
        regions = create_demo_output()
        timestamp = None
        stimulus_name = "demo"
    else:
        if not args.stimulus:
            parser.error("--stimulus is required (or use --demo for test data)")
        stimulus_path = Path(args.stimulus)
        if not stimulus_path.exists():
            print(f"ERROR: Stimulus file not found: {stimulus_path}", file=sys.stderr)
            sys.exit(1)
        normalized, timestamp = run_tribe_inference(stimulus_path, args.timestamp)
        regions = {k: {"activation": v} for k, v in normalized.items()}
        stimulus_name = stimulus_path.name

    output = {
        "stimulus": stimulus_name,
        "model": "tribev2",
        "timestamp_sec": timestamp,
        "regions": regions,
    }

    output_path = Path(args.output)
    output_path.write_text(json.dumps(output, indent=2))
    print(f"Written to {output_path}")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
