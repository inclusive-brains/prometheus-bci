#!/usr/bin/env python3
"""Prometheus BCI — .env Setup UI
Serves a local web interface to configure environment variables before launch.
No external dependencies — uses only Python stdlib.
"""

import http.server
import json
import os
import re
import signal
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs

PORT = 8888
ENV_PATH = Path(__file__).parent.parent / ".env"

# ── .env schema ──────────────────────────────────────────────────────────────
# Each entry: (key, label, type, default, description, options/extra)
# Types: select, text, number, bool, path
SCHEMA = [
    {
        "section": "Devices",
        "icon": "cpu",
        "fields": [
            {"key": "PPG_DEVICE", "label": "PPG Device", "type": "select", "default": "fake",
             "description": "Photoplethysmography sensor",
             "options": ["fake", "emotibit"]},
            {"key": "ECG", "label": "ECG Serial Port", "type": "text", "default": "",
             "description": "BITalino serial port (leave empty to disable)",
             "placeholder": "/dev/tty.BITalino-XX-XX"},
            {"key": "CAMERA_ENABLE", "label": "Camera", "type": "bool", "default": "false",
             "description": "Enable facial expression detection via camera"},
        ],
    },
    {
        "section": "Training — Baseline",
        "icon": "activity",
        "fields": [
            {"key": "BASELINE_ENABLE", "label": "Baseline Recording", "type": "bool", "default": "false",
             "description": "Record a resting-state baseline before training"},
            {"key": "BASELINE_DURATION", "label": "Duration", "type": "number", "default": "45000",
             "description": "Baseline duration in milliseconds", "unit": "ms"},
        ],
    },
    {
        "section": "Training — Motor Imagery",
        "icon": "zap",
        "fields": [
            {"key": "MOTOR_ENABLE", "label": "Motor Training", "type": "bool", "default": "true",
             "description": "Enable motor imagery training paradigm"},
            {"key": "MOTOR_IMAGERY", "label": "Imagery Type", "type": "select", "default": "generic",
             "description": "Type of motor imagery task",
             "options": ["generic", "rotation", "extension", "flexion"]},
            {"key": "MOTOR_BLOCKS", "label": "Blocks", "type": "number", "default": "20",
             "description": "Number of blocks per session"},
            {"key": "MOTOR_TRIALS", "label": "Trials", "type": "number", "default": "10",
             "description": "Number of trials per block"},
        ],
    },
    {
        "section": "Training — Blink Detection",
        "icon": "eye",
        "fields": [
            {"key": "BLINK_ENABLE", "label": "Blink Training", "type": "bool", "default": "true",
             "description": "Enable blink detection training"},
            {"key": "BLINK_TRIALS", "label": "Trials", "type": "number", "default": "12",
             "description": "Total number of blink trials"},
        ],
    },
    {
        "section": "OSC Output",
        "icon": "radio",
        "fields": [
            {"key": "OSC_ENABLE", "label": "OSC Streaming", "type": "bool", "default": "false",
             "description": "Stream data via Open Sound Control protocol"},
            {"key": "OSC_IP", "label": "IP Address", "type": "text", "default": "127.0.0.1",
             "description": "Target OSC server IP"},
            {"key": "OSC_PORT", "label": "Port", "type": "number", "default": "5005",
             "description": "Target OSC server port"},
        ],
    },
    {
        "section": "Paths & Models",
        "icon": "folder",
        "fields": [
            {"key": "WARMUP_BLINK", "label": "Warmup — Blink", "type": "text", "default": "",
             "description": "Path to warmup data for blink detection (optional)",
             "placeholder": "./data/warmup_blink.hdf5"},
            {"key": "WARMUP_MOTOR", "label": "Warmup — Motor", "type": "text", "default": "",
             "description": "Path to warmup data for motor imagery (optional)",
             "placeholder": "./data/warmup_motor.hdf5"},
            {"key": "MODEL_BLINK", "label": "Model — Blink", "type": "text", "default": "",
             "description": "Pre-computed blink model (skips training if set)",
             "placeholder": "./models/blink.pkl"},
            {"key": "MODEL_MOTOR", "label": "Model — Motor", "type": "text", "default": "",
             "description": "Pre-computed motor model (skips training if set)",
             "placeholder": "./models/motor.pkl"},
            {"key": "TIMEFLUX_LOG_FILE", "label": "Log File", "type": "text",
             "default": "./logs/%Y%m%d-%H%M%S.log", "description": "Log file path pattern"},
            {"key": "TIMEFLUX_DATA_PATH", "label": "Data Directory", "type": "text",
             "default": "./data", "description": "Directory for recorded data"},
        ],
    },
]


HEADSETS = [
    {
        "id": "dummy",
        "name": "Dummy",
        "brand": "Simulated",
        "description": "Fake signal generator for testing and development",
        "channels": "5 ch",
        "rate": "128 Hz",
        "color": "#63636e",
        "tag": "Dev",
    },
    {
        "id": "emotiv_insight",
        "name": "INSIGHT",
        "brand": "EMOTIV",
        "description": "5-channel lightweight EEG for everyday brain monitoring",
        "channels": "5 ch",
        "rate": "128 Hz",
        "color": "#a78bfa",
        "tag": "Wellness",
    },
    {
        "id": "emotiv_epochX",
        "name": "EPOCH X",
        "brand": "EMOTIV",
        "description": "14-channel high-resolution research-grade headset",
        "channels": "14 ch",
        "rate": "256 Hz",
        "color": "#22d3ee",
        "tag": "Research",
    },
    {
        "id": "emotiv_epoch+",
        "name": "EPOCH+",
        "brand": "EMOTIV",
        "description": "14-channel wireless headset with saline sensors",
        "channels": "14 ch",
        "rate": "256 Hz",
        "color": "#06b6d4",
        "tag": "Research",
    },
    {
        "id": "emotiv_mn8",
        "name": "MN8",
        "brand": "EMOTIV",
        "description": "2-channel in-ear EEG for workplace focus tracking",
        "channels": "2 ch",
        "rate": "128 Hz",
        "color": "#f59e0b",
        "tag": "Wellness",
    },
    {
        "id": "emotiv_mw20",
        "name": "MW20",
        "brand": "EMOTIV",
        "description": "2-channel in-ear EEG headset for brain activity monitoring",
        "channels": "2 ch",
        "rate": "128 Hz",
        "color": "#ec4899",
        "tag": "Wellness",
    },
    {
        "id": "brainflow_synthetic",
        "name": "Synthetic",
        "brand": "BrainFlow",
        "description": "Realistic synthetic EEG signals for testing and development",
        "channels": "16 ch",
        "rate": "250 Hz",
        "color": "#64748b",
        "tag": "Dev",
        "status": "to_test",
    },
    {
        "id": "brainflow_muse2",
        "name": "Muse 2",
        "brand": "Muse",
        "description": "4-channel consumer EEG headband for meditation and focus",
        "channels": "4 ch",
        "rate": "256 Hz",
        "color": "#10b981",
        "tag": "Wellness",
        "status": "to_test",
    },
    {
        "id": "brainflow_muse_s",
        "name": "Muse S",
        "brand": "Muse",
        "description": "4-channel sleep and meditation EEG with soft headband",
        "channels": "4 ch",
        "rate": "256 Hz",
        "color": "#34d399",
        "tag": "Wellness",
        "status": "to_test",
    },
    {
        "id": "brainflow_ganglion",
        "name": "Ganglion",
        "brand": "OpenBCI",
        "description": "4-channel open-source biosensing board via BrainFlow",
        "channels": "4 ch",
        "rate": "200 Hz",
        "color": "#3b82f6",
        "tag": "Research",
        "status": "to_test",
    },
    {
        "id": "brainflow_unicorn",
        "name": "Unicorn",
        "brand": "g.tec",
        "description": "8-channel hybrid EEG for BCI research and neurofeedback",
        "channels": "8 ch",
        "rate": "250 Hz",
        "color": "#8b5cf6",
        "tag": "Research",
        "status": "to_test",
    },
    {
        "id": "brainflow_crown",
        "name": "Crown",
        "brand": "Neurosity",
        "description": "8-channel EEG for focus tracking and productivity",
        "channels": "8 ch",
        "rate": "256 Hz",
        "color": "#e879f9",
        "tag": "Wellness",
        "status": "to_test",
    },
]


def parse_env(path: Path) -> dict:
    """Parse .env file into dict, preserving commented-out keys."""
    values = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        # Active variable
        m = re.match(r'^([A-Z_]+)\s*=\s*(.*?)(?:\s*#.*)?$', line)
        if m:
            values[m.group(1)] = m.group(2).strip()
    return values


def write_env(path: Path, values: dict):
    """Write .env from schema + values, preserving section comments."""
    lines = []
    for si, section in enumerate(SCHEMA):
        lines.append("")
        title = section["section"].upper().replace(" — ", " - ")
        pad = max(0, (40 - len(title) - 4) // 2)
        lines.append("#" * (pad + 1) + " " + title + " " + "#" * (pad + 1))
        lines.append("")
        # Insert EEG_DEVICE at top of first section (Devices)
        if si == 0:
            eeg = values.get("EEG_DEVICE", "dummy")
            eeg_pad = " " * max(0, 36 - len("EEG_DEVICE") - len(eeg))
            lines.append(f"EEG_DEVICE={eeg}{eeg_pad}# Electroencephalography headset")
        for field in section["fields"]:
            key = field["key"]
            val = values.get(key, field["default"])
            desc = field.get("description", "")
            if val == "" or val is None:
                # Write as commented-out
                lines.append(f"#{key}={' ' * max(0, 36 - len(key))}# {desc}")
            else:
                pad_val = " " * max(0, 36 - len(key) - len(str(val)))
                lines.append(f"{key}={val}{pad_val}# {desc}")
    lines.append("")
    path.write_text("\n".join(lines) + "\n")


def get_html():
    """Generate the full setup UI HTML."""
    env = parse_env(ENV_PATH)
    schema_json = json.dumps(SCHEMA)
    env_json = json.dumps(env)
    headsets_json = json.dumps(HEADSETS)
    current_eeg = env.get("EEG_DEVICE", "dummy")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Setup — Prometheus BCI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"></script>
<style>
:root {{
    /* Surfaces — Liquid Glass (translucent) */
    --bg-root: #050508;
    --bg-surface: rgba(255, 255, 255, 0.04);
    --bg-raised: rgba(255, 255, 255, 0.06);
    --bg-hover: rgba(255, 255, 255, 0.10);
    --bg-active: rgba(255, 255, 255, 0.14);

    /* Borders */
    --border-subtle: rgba(255, 255, 255, 0.08);
    --border-default: rgba(255, 255, 255, 0.12);
    --border-strong: rgba(255, 255, 255, 0.22);

    /* Glass */
    --glass-blur: 6px;
    --glass-saturate: 1.05;
    --glass-backdrop: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    --glass-specular: inset 0 1px 0 rgba(255, 255, 255, 0.08);

    --text-primary: #fafafa;
    --text-secondary: #a0a0ab;
    --text-tertiary: #63636e;
    --text-disabled: #3f3f46;
    --accent: #22d3ee;
    --accent-dim: rgba(34, 211, 238, 0.15);
    --accent-glow: rgba(34, 211, 238, 0.08);
    --red: #ef4444;
    --red-dim: rgba(239, 68, 68, 0.15);
    --green: #22c55e;
    --green-dim: rgba(34, 197, 94, 0.15);
    --amber: #f59e0b;
    --amber-dim: rgba(245, 158, 11, 0.15);
    --font-sans: 'DM Sans', -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
}}

*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
html {{ font-size: 14px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }}
body {{
    font-family: var(--font-sans);
    background: var(--bg-root);
    color: var(--text-primary);
    line-height: 1.5;
    min-height: 100vh;
    overflow-x: hidden;
    background-image:
        radial-gradient(ellipse 900px 700px at 8% 12%, rgba(34, 211, 238, 0.38) 0%, transparent 65%),
        radial-gradient(ellipse 700px 650px at 88% 78%, rgba(6, 182, 212, 0.32) 0%, transparent 60%),
        radial-gradient(ellipse 800px 550px at 50% 35%, rgba(167, 139, 250, 0.26) 0%, transparent 60%),
        radial-gradient(ellipse 600px 450px at 72% 8%, rgba(34, 211, 238, 0.28) 0%, transparent 50%),
        radial-gradient(ellipse 500px 400px at 22% 82%, rgba(139, 125, 181, 0.26) 0%, transparent 55%),
        radial-gradient(ellipse 650px 500px at 92% 28%, rgba(92, 168, 181, 0.22) 0%, transparent 55%);
    background-attachment: fixed;
}}

/* Liquid Glass — Noise grain overlay */
body::after {{
    content: '';
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    opacity: 0.42;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 150 150' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 150px 150px;
}}

/* ── Layout ── */
.setup-container {{
    max-width: 780px;
    margin: 0 auto;
    padding: 40px 24px 80px;
}}

/* ── Header ── */
.setup-header {{
    text-align: center;
    margin-bottom: 48px;
    animation: fade-in 0.5s ease both;
}}
.setup-header .logo-mark {{
    width: 48px; height: 48px;
    background: linear-gradient(135deg, var(--accent), #06b6d4);
    border-radius: var(--radius-md);
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-weight: 600; font-size: 22px;
    color: var(--bg-root);
    margin-bottom: 16px;
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.35), 0 0 40px rgba(34, 211, 238, 0.15);
}}
.setup-header h1 {{
    font-size: 24px; font-weight: 600; letter-spacing: -0.03em;
    color: var(--text-primary); margin-bottom: 6px;
}}
.setup-header p {{
    font-size: 14px; color: var(--text-tertiary);
}}

/* ── Section ── */
.config-section {{
    margin-bottom: 32px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    backdrop-filter: var(--glass-backdrop);
    -webkit-backdrop-filter: var(--glass-backdrop);
    overflow: hidden;
    animation: glass-appear 0.5s ease both;
    box-shadow: var(--glass-shadow);
    position: relative;
}}
.config-section::after {{
    content: '';
    position: absolute;
    top: -1px; left: -1px; right: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.2) 30%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.2) 70%, transparent 90%);
    z-index: 1;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}}
.config-section:nth-child(2) {{ animation-delay: 0.05s; }}
.config-section:nth-child(3) {{ animation-delay: 0.10s; }}
.config-section:nth-child(4) {{ animation-delay: 0.15s; }}
.config-section:nth-child(5) {{ animation-delay: 0.20s; }}
.config-section:nth-child(6) {{ animation-delay: 0.25s; }}
.config-section:nth-child(7) {{ animation-delay: 0.30s; }}

.section-header {{
    padding: 16px 20px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
}}
.section-header:hover {{ background: var(--bg-hover); }}
.section-header .icon {{
    width: 18px; height: 18px; color: var(--accent); flex-shrink: 0;
}}
.section-header h2 {{
    font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
    color: var(--text-primary); flex: 1;
}}
.section-header .chevron {{
    width: 16px; height: 16px; color: var(--text-tertiary);
    transition: transform 0.2s ease;
}}
.section-header.collapsed .chevron {{ transform: rotate(-90deg); }}
.section-body {{ padding: 8px 0; }}
.section-body.hidden {{ display: none; }}

/* ── Field ── */
.field-row {{
    display: grid;
    grid-template-columns: 180px 1fr;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    transition: background 0.1s;
}}
.field-row:hover {{ background: var(--bg-hover); }}

.field-label {{
    font-size: 13px; font-weight: 500;
    color: var(--text-secondary);
    display: flex; flex-direction: column; gap: 2px;
}}
.field-desc {{
    font-size: 11px; color: var(--text-tertiary); font-weight: 400;
    line-height: 1.4;
}}

.field-input {{
    display: flex; align-items: center; gap: 8px;
}}

/* ── Inputs ── */
input[type="text"], input[type="number"], select {{
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-raised);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-shadow: var(--glass-specular), 0 2px 6px rgba(0, 0, 0, 0.15);
}}
input:focus, select:focus {{
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-dim), var(--glass-specular);
}}
input::placeholder {{ color: var(--text-disabled); }}
input[type="number"] {{ max-width: 140px; }}
select {{
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2363636e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 32px;
}}
select option {{ background: var(--bg-raised); color: var(--text-primary); }}
.unit {{ font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono); white-space: nowrap; }}

/* ── Toggle ── */
.toggle {{
    position: relative; width: 40px; height: 22px;
    background: var(--bg-active); border-radius: 11px;
    cursor: pointer; transition: background 0.2s; flex-shrink: 0;
    border: 1px solid var(--border-default);
}}
.toggle.on {{
    background: var(--accent-dim);
    border-color: var(--accent);
}}
.toggle .knob {{
    position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px;
    background: var(--text-tertiary);
    border-radius: 50%;
    transition: all 0.2s ease;
}}
.toggle.on .knob {{
    left: 20px;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
}}
.toggle-label {{
    font-family: var(--font-mono); font-size: 11px;
    color: var(--text-tertiary);
    min-width: 28px;
}}
.toggle.on + .toggle-label {{ color: var(--accent); }}

/* ── Buttons ── */
.actions {{
    display: flex; gap: 12px; justify-content: center;
    margin-top: 40px;
    animation: fade-in 0.4s ease both;
    animation-delay: 0.35s;
}}
.btn {{
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 28px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-raised);
    backdrop-filter: blur(12px) saturate(1.6);
    -webkit-backdrop-filter: blur(12px) saturate(1.6);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.15s ease; outline: none;
    box-shadow: var(--glass-specular), 0 2px 8px rgba(0, 0, 0, 0.2);
}}
.btn:hover {{ background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-strong); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); }}
.btn:active {{ transform: scale(0.97); }}
.btn-primary {{
    background: linear-gradient(135deg, var(--accent), #06b6d4);
    border-color: transparent;
    color: var(--bg-root); font-weight: 600;
}}
.btn-primary:hover {{
    filter: brightness(1.1);
    color: var(--bg-root);
    border-color: transparent;
    box-shadow: 0 0 20px var(--accent-dim);
}}

/* ── Toast ── */
.toast {{
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(80px);
    padding: 10px 24px; border-radius: var(--radius-md);
    background: var(--green-dim); border: 1px solid var(--green);
    color: var(--green); font-size: 13px; font-weight: 500;
    font-family: var(--font-mono);
    opacity: 0; transition: all 0.3s ease; pointer-events: none; z-index: 100;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}}
.toast.show {{ opacity: 1; transform: translateX(-50%) translateY(0); }}

/* ── Headset Picker ── */
.headset-picker {{
    margin-bottom: 40px;
    animation: fade-in 0.5s ease both;
    animation-delay: 0.05s;
}}
.headset-picker h2 {{
    font-size: 13px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-tertiary);
    margin-bottom: 16px;
    padding-left: 4px;
}}
.headset-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
}}
.headset-card {{
    position: relative;
    background: var(--bg-surface);
    backdrop-filter: var(--glass-backdrop);
    -webkit-backdrop-filter: var(--glass-backdrop);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 20px 18px 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: var(--glass-specular), 0 2px 8px rgba(0, 0, 0, 0.2);
}}
.headset-card::before {{
    content: '';
    position: absolute; top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--card-color);
    opacity: 0;
    transition: opacity 0.2s;
}}
.headset-card:hover {{
    border-color: var(--border-strong);
    background: var(--bg-raised);
    transform: translateY(-2px);
    box-shadow: var(--glass-shadow);
}}
.headset-card:hover::before {{ opacity: 0.5; }}
.headset-card.selected {{
    border-color: var(--card-color);
    background: var(--bg-raised);
    box-shadow: 0 0 24px -4px color-mix(in srgb, var(--card-color) 25%, transparent);
}}
.headset-card.selected::before {{ opacity: 1; }}

.headset-icon {{
    width: 48px; height: 48px;
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 14px;
    background: color-mix(in srgb, var(--card-color) 12%, transparent);
    transition: all 0.2s;
}}
.headset-card.selected .headset-icon {{
    background: color-mix(in srgb, var(--card-color) 20%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--card-color) 15%, transparent);
}}
.headset-icon svg {{
    width: 24px; height: 24px;
    stroke: var(--card-color);
    fill: none; stroke-width: 1.5;
}}

.headset-tag {{
    position: absolute; top: 12px; right: 12px;
    font-size: 9.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 2px 8px; border-radius: 10px;
    background: color-mix(in srgb, var(--card-color) 12%, transparent);
    color: var(--card-color);
    font-family: var(--font-mono);
}}

.headset-brand {{
    font-size: 10px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--card-color);
    font-family: var(--font-mono);
    margin-bottom: 2px;
}}
.headset-name {{
    font-size: 17px; font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    margin-bottom: 6px;
}}
.headset-desc {{
    font-size: 12px;
    color: var(--text-tertiary);
    line-height: 1.4;
    margin-bottom: 14px;
    flex: 1;
}}
.headset-specs {{
    display: flex; gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
}}
.headset-spec {{
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    display: flex; align-items: center; gap: 4px;
}}
.headset-spec svg {{ width: 12px; height: 12px; stroke: var(--text-tertiary); fill: none; stroke-width: 1.5; }}

.headset-check {{
    position: absolute; top: 12px; left: 12px;
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--border-default);
    background: var(--bg-root);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
    opacity: 0;
}}
.headset-card.selected .headset-check {{
    opacity: 1;
    border-color: var(--card-color);
    background: var(--card-color);
}}
.headset-check svg {{ width: 12px; height: 12px; stroke: var(--bg-root); stroke-width: 2.5; fill: none; }}

/* ── Experimental Headsets Dropdown ── */
.headset-expander {{
    margin-top: 20px;
    animation: fade-in 0.4s ease both;
    animation-delay: 0.3s;
}}
.headset-expander-toggle {{
    display: flex; align-items: center; gap: 10px;
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
}}
.headset-expander-toggle:hover {{
    background: var(--bg-raised);
    border-color: var(--border-default);
}}
.headset-expander-toggle .exp-icon {{
    width: 18px; height: 18px;
    color: var(--amber);
    flex-shrink: 0;
}}
.headset-expander-toggle .exp-label {{
    font-size: 13px; font-weight: 600;
    color: var(--text-secondary);
    flex: 1; text-align: left;
    letter-spacing: -0.01em;
}}
.headset-expander-toggle .exp-badge {{
    font-family: var(--font-mono);
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 3px 10px; border-radius: 10px;
    background: var(--amber-dim);
    color: var(--amber);
}}
.headset-expander-toggle .exp-chevron {{
    width: 16px; height: 16px;
    color: var(--text-tertiary);
    transition: transform 0.25s ease;
}}
.headset-expander-toggle.open .exp-chevron {{
    transform: rotate(180deg);
}}
.headset-expander-body {{
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                padding 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0;
}}
.headset-expander-body.open {{
    max-height: 800px;
    padding: 16px 0 0;
}}
.headset-card.experimental {{
    border-style: dashed;
}}
.headset-card.experimental .headset-status {{
    font-family: var(--font-mono);
    font-size: 9px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 2px 8px; border-radius: 10px;
    background: var(--amber-dim);
    color: var(--amber);
    display: inline-block;
    margin-top: 6px;
}}

@media (max-width: 700px) {{
    .headset-grid {{ grid-template-columns: repeat(2, 1fr); }}
}}

/* ── Landing Overlay ── */
.landing-overlay {{
    position: fixed; inset: 0; z-index: 1000;
    background: var(--bg-root);
    display: flex; align-items: center; justify-content: center;
    transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}}
/* Subtle radial glows behind the 3D scene */
.landing-overlay::before {{
    content: '';
    position: absolute; inset: 0; z-index: 1;
    pointer-events: none;
    background:
        radial-gradient(ellipse 800px 600px at 20% 30%, rgba(34, 211, 238, 0.12) 0%, transparent 70%),
        radial-gradient(ellipse 600px 500px at 80% 70%, rgba(167, 139, 250, 0.10) 0%, transparent 70%),
        radial-gradient(ellipse 500px 400px at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%);
}}
.landing-overlay.exiting {{
    opacity: 0;
    transform: scale(1.05);
    pointer-events: none;
}}
#brainCanvas {{
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    z-index: 2;
}}
.landing-content {{
    position: relative; z-index: 10;
    text-align: center;
    display: flex; flex-direction: column;
    align-items: center; gap: 24px;
    pointer-events: none;
}}
.landing-content > * {{ pointer-events: auto; }}
.landing-logo {{
    width: 60px; height: 60px;
    background: linear-gradient(135deg, var(--accent), #06b6d4);
    border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-weight: 700; font-size: 26px;
    color: var(--bg-root);
    opacity: 0;
    animation: landing-fade-in 1.2s ease 0.5s both;
    box-shadow: 0 0 60px rgba(34, 211, 238, 0.35), 0 0 120px rgba(34, 211, 238, 0.15), var(--glass-specular);
}}
.landing-title {{
    font-family: var(--font-sans);
    font-size: 64px; font-weight: 700;
    letter-spacing: -0.04em;
    color: #fafafa;
    opacity: 0;
    animation: landing-fade-in 1.2s ease 0.8s both;
    text-shadow: 0 0 80px rgba(34, 211, 238, 0.2), 0 0 160px rgba(167, 139, 250, 0.08);
}}
.landing-subtitle {{
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    opacity: 0;
    animation: landing-fade-in 1s ease 1.1s both;
}}
.landing-enter {{
    margin-top: 28px;
    padding: 14px 52px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(34, 211, 238, 0.25);
    border-radius: var(--radius-md);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.5s ease;
    opacity: 0;
    animation: landing-fade-in 1s ease 1.6s both;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
    box-shadow: var(--glass-specular), 0 4px 24px rgba(0, 0, 0, 0.3);
}}
.landing-enter::before {{
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(34,211,238,0.1), rgba(167,139,250,0.05));
    opacity: 0;
    transition: opacity 0.3s;
}}
.landing-enter:hover {{
    border-color: var(--accent);
    box-shadow: 0 0 50px rgba(34, 211, 238, 0.25), inset 0 0 40px rgba(34, 211, 238, 0.06), var(--glass-specular);
    letter-spacing: 0.3em;
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
}}
.landing-enter:hover::before {{ opacity: 1; }}
.landing-enter:active {{ transform: scale(0.97); }}

/* ── Landing Metric Badges ── */
.landing-metrics {{
    position: absolute; inset: 0; z-index: 5;
    pointer-events: none;
}}
.landing-metric {{
    position: absolute;
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.5);
    opacity: 0;
    animation: landing-fade-in 1.2s ease 2.2s both;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px) saturate(1.4);
    -webkit-backdrop-filter: blur(12px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    box-shadow: var(--glass-specular), 0 4px 16px rgba(0, 0, 0, 0.2);
}}
.landing-metric-dot {{
    width: 6px; height: 6px;
    border-radius: 50%;
    animation: metric-pulse 2.5s ease-in-out infinite;
}}
.landing-metric-value {{
    font-weight: 500;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}}
.landing-metric.m-stress    {{ top: 22%; left: 8%; }}
.landing-metric.m-cognitive {{ top: 22%; right: 8%; }}
.landing-metric.m-attention {{ bottom: 22%; left: 8%; }}
.landing-metric.m-arousal   {{ bottom: 22%; right: 8%; }}

.landing-metric.m-stress .landing-metric-dot    {{ background: #ef4444; box-shadow: 0 0 12px rgba(239,68,68,0.6); }}
.landing-metric.m-cognitive .landing-metric-dot  {{ background: #a78bfa; box-shadow: 0 0 12px rgba(167,139,250,0.6); }}
.landing-metric.m-attention .landing-metric-dot  {{ background: #22d3ee; box-shadow: 0 0 12px rgba(34,211,238,0.6); }}
.landing-metric.m-arousal .landing-metric-dot    {{ background: #f59e0b; box-shadow: 0 0 12px rgba(245,158,11,0.6); }}

.landing-metric.m-stress .landing-metric-value    {{ color: #ef4444; }}
.landing-metric.m-cognitive .landing-metric-value  {{ color: #a78bfa; }}
.landing-metric.m-attention .landing-metric-value  {{ color: #22d3ee; }}
.landing-metric.m-arousal .landing-metric-value    {{ color: #f59e0b; }}

@keyframes metric-pulse {{
    0%, 100% {{ opacity: 0.6; transform: scale(1); }}
    50% {{ opacity: 1; transform: scale(1.4); }}
}}

/* Hide setup while landing is visible */
.setup-container {{ opacity: 0; transition: opacity 0.6s ease 0.3s; }}
.setup-container.visible {{ opacity: 1; }}

@keyframes landing-fade-in {{
    from {{ opacity: 0; transform: translateY(16px); }}
    to {{ opacity: 1; transform: translateY(0); }}
}}

/* ── Animations ── */
@keyframes fade-in {{
    from {{ opacity: 0; transform: translateY(8px); }}
    to {{ opacity: 1; transform: translateY(0); }}
}}
@keyframes glass-appear {{
    from {{ opacity: 0; transform: translateY(10px) scale(0.98); }}
    to {{ opacity: 1; transform: translateY(0) scale(1); }}
}}
</style>
</head>
<body>

<!-- ── Landing Page ── -->
<div class="landing-overlay" id="landingOverlay">
    <canvas id="brainCanvas"></canvas>
    <div class="landing-metrics">
        <div class="landing-metric m-stress"><span class="landing-metric-dot"></span><span>Stress</span><span class="landing-metric-value" id="lm-stress">—</span></div>
        <div class="landing-metric m-cognitive"><span class="landing-metric-dot"></span><span>Cognitive Load</span><span class="landing-metric-value" id="lm-cognitive">—</span></div>
        <div class="landing-metric m-attention"><span class="landing-metric-dot"></span><span>Attention</span><span class="landing-metric-value" id="lm-attention">—</span></div>
        <div class="landing-metric m-arousal"><span class="landing-metric-dot"></span><span>Arousal</span><span class="landing-metric-value" id="lm-arousal">—</span></div>
    </div>
    <div class="landing-content">
        <div class="landing-logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg></div>
        <div class="landing-title">Prometheus BCI</div>
        <div class="landing-subtitle">Brain-Computer Interface Platform</div>
        <button class="landing-enter" id="enterBtn" onclick="enterLabs()">Enter Labs</button>
    </div>
</div>

<div class="setup-container" id="setupContainer">
    <div class="setup-header">
        <div class="logo-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg></div>
        <h1>Prometheus BCI</h1>
        <p>Configure your BCI session parameters</p>
    </div>
    <div class="headset-picker">
        <h2>Select your headset</h2>
        <div class="headset-grid" id="headsetGrid"></div>
        <div class="headset-expander" id="headsetExpander">
            <button class="headset-expander-toggle" id="expanderToggle" onclick="toggleExpander()">
                <span class="exp-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></span>
                <span class="exp-label">Integrated &mdash; to test</span>
                <span class="exp-badge" id="expanderCount"></span>
                <span class="exp-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>
            </button>
            <div class="headset-expander-body" id="expanderBody">
                <div class="headset-grid" id="headsetGridExp"></div>
            </div>
        </div>
    </div>
    <div id="sections"></div>
    <div class="actions">
        <button class="btn" onclick="resetDefaults()">Reset Defaults</button>
        <button class="btn btn-primary" onclick="saveAndLaunch()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Save &amp; Launch
        </button>
    </div>
</div>

<div class="toast" id="toast"></div>

<script>
const SCHEMA = {schema_json};
const ENV = {env_json};
const HEADSETS = {headsets_json};
let selectedHeadset = '{current_eeg}';

const HEADSET_SVGS = {{
    dummy: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h6"/></svg>',
    emotiv_insight: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 4.5 3 6v4h3v-2h8v2h3v-4c1.5-1.5 3-3.5 3-6 0-4-4.48-8-10-8z"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>',
    emotiv_epochX: '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><circle cx="7" cy="9" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15.5" cy="11" r="1"/></svg>',
    'emotiv_epoch+': '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><circle cx="7" cy="9" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15.5" cy="11" r="1"/><path d="M19 13h3M20.5 11.5v3"/></svg>',
    emotiv_mn8: '<svg viewBox="0 0 24 24"><ellipse cx="8" cy="12" rx="4" ry="6"/><ellipse cx="16" cy="12" rx="4" ry="6"/><path d="M12 8c0-2 1-4 3-4M12 8c0-2-1-4-3-4"/></svg>',
    emotiv_mw20: '<svg viewBox="0 0 24 24"><ellipse cx="8" cy="12" rx="4" ry="6"/><ellipse cx="16" cy="12" rx="4" ry="6"/><path d="M12 8c0-2 1-4 3-4M12 8c0-2-1-4-3-4"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>',
    brainflow_synthetic: '<svg viewBox="0 0 24 24"><path d="M2 12h4l3-9 4 18 3-9h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    brainflow_muse2: '<svg viewBox="0 0 24 24"><path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M6 12c0 2 1.5 4 3 5M18 12c0 2-1.5 4-3 5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>',
    brainflow_muse_s: '<svg viewBox="0 0 24 24"><path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M6 12c0 2 1.5 4 3 5M18 12c0 2-1.5 4-3 5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 17h8" stroke-dasharray="2 2"/></svg>',
    brainflow_ganglion: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg>',
    brainflow_unicorn: '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><path d="M12 2V0"/><circle cx="8" cy="10" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="14" cy="8" r="1"/><circle cx="16" cy="10" r="1"/></svg>',
    brainflow_crown: '<svg viewBox="0 0 24 24"><path d="M3 18L5 8l4 4 3-6 3 6 4-4 2 10z"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="14" r="1"/></svg>',

}};

function buildCard(h, i, experimental) {{
    const card = document.createElement('div');
    card.className = 'headset-card' + (h.id === selectedHeadset ? ' selected' : '') + (experimental ? ' experimental' : '');
    card.dataset.headsetId = h.id;
    card.style.setProperty('--card-color', h.color);
    card.style.animationDelay = (0.08 + i * 0.04) + 's';
    card.style.animation = 'fade-in 0.35s ease both';
    card.onclick = () => selectHeadset(h.id);
    card.innerHTML = `
        <div class="headset-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
        <span class="headset-tag">${{h.tag}}</span>
        <div class="headset-icon">${{HEADSET_SVGS[h.id] || HEADSET_SVGS.dummy}}</div>
        <div class="headset-brand">${{h.brand}}</div>
        <div class="headset-name">${{h.name}}</div>
        <div class="headset-desc">${{h.description}}</div>
        ${{experimental ? '<span class="headset-status">to test</span>' : ''}}
        <div class="headset-specs">
            <span class="headset-spec">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                ${{h.channels}}
            </span>
            <span class="headset-spec">
                <svg viewBox="0 0 24 24"><path d="M2 12h4l3-9 4 18 3-9h6"/></svg>
                ${{h.rate}}
            </span>
        </div>
    `;
    return card;
}}

function renderHeadsets() {{
    const grid = document.getElementById('headsetGrid');
    const gridExp = document.getElementById('headsetGridExp');
    grid.innerHTML = '';
    gridExp.innerHTML = '';

    const stable = HEADSETS.filter(h => !h.status);
    const experimental = HEADSETS.filter(h => h.status === 'to_test');

    stable.forEach((h, i) => grid.appendChild(buildCard(h, i, false)));
    experimental.forEach((h, i) => gridExp.appendChild(buildCard(h, i, true)));

    // Update badge count
    document.getElementById('expanderCount').textContent = experimental.length + ' devices';

    // If a "to_test" headset is currently selected, auto-open the expander
    if (experimental.some(h => h.id === selectedHeadset)) {{
        toggleExpander(true);
    }}
}}

function selectHeadset(id) {{
    selectedHeadset = id;
    document.querySelectorAll('.headset-card').forEach(c => {{
        c.classList.toggle('selected', c.dataset.headsetId === id);
    }});
}}

function toggleExpander(forceOpen) {{
    const toggle = document.getElementById('expanderToggle');
    const body = document.getElementById('expanderBody');
    const isOpen = body.classList.contains('open');
    if (forceOpen === true && isOpen) return;
    toggle.classList.toggle('open', forceOpen !== undefined ? forceOpen : !isOpen);
    body.classList.toggle('open', forceOpen !== undefined ? forceOpen : !isOpen);
}}

renderHeadsets();

const ICONS = {{
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h4l3-9 4 18 3-9h6"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
}};

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

function getValue(key, def) {{
    if (key in ENV) return ENV[key];
    return def;
}}

function renderSections() {{
    const container = document.getElementById('sections');
    container.innerHTML = '';
    SCHEMA.forEach((section, si) => {{
        const div = document.createElement('div');
        div.className = 'config-section';

        const header = document.createElement('div');
        header.className = 'section-header collapsed';
        header.innerHTML = `
            <span class="icon">${{ICONS[section.icon] || ICONS.cpu}}</span>
            <h2>${{section.section}}</h2>
            <span class="chevron">${{CHEVRON}}</span>
        `;

        const body = document.createElement('div');
        body.className = 'section-body hidden';

        header.addEventListener('click', () => {{
            header.classList.toggle('collapsed');
            body.classList.toggle('hidden');
        }});

        section.fields.forEach(field => {{
            const row = document.createElement('div');
            row.className = 'field-row';

            const val = getValue(field.key, field.default);

            let inputHtml = '';
            if (field.type === 'select') {{
                const opts = (field.options || []).map(o =>
                    `<option value="${{o}}" ${{val === o ? 'selected' : ''}}>${{o}}</option>`
                ).join('');
                inputHtml = `<select data-key="${{field.key}}">${{opts}}</select>`;
            }} else if (field.type === 'bool') {{
                const on = val === 'true';
                inputHtml = `
                    <div class="toggle ${{on ? 'on' : ''}}" data-key="${{field.key}}" onclick="toggleBool(this)">
                        <div class="knob"></div>
                    </div>
                    <span class="toggle-label">${{on ? 'On' : 'Off'}}</span>
                `;
            }} else if (field.type === 'number') {{
                inputHtml = `<input type="number" data-key="${{field.key}}" value="${{val}}" placeholder="${{field.default}}">`;
                if (field.unit) inputHtml += `<span class="unit">${{field.unit}}</span>`;
            }} else {{
                inputHtml = `<input type="text" data-key="${{field.key}}" value="${{val}}" placeholder="${{field.placeholder || field.default}}">`;
            }}

            row.innerHTML = `
                <label class="field-label">
                    ${{field.label}}
                    <span class="field-desc">${{field.description || ''}}</span>
                </label>
                <div class="field-input">${{inputHtml}}</div>
            `;
            body.appendChild(row);
        }});

        div.appendChild(header);
        div.appendChild(body);
        container.appendChild(div);
    }});
}}

function toggleBool(el) {{
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    const label = el.nextElementSibling;
    if (label) label.textContent = on ? 'On' : 'Off';
}}

function collectValues() {{
    const values = {{ EEG_DEVICE: selectedHeadset }};
    document.querySelectorAll('[data-key]').forEach(el => {{
        const key = el.dataset.key;
        if (el.classList.contains('toggle')) {{
            values[key] = el.classList.contains('on') ? 'true' : 'false';
        }} else {{
            values[key] = el.value;
        }}
    }});
    return values;
}}

function showToast(msg, color) {{
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.borderColor = color || 'var(--green)';
    t.style.background = color === 'var(--red)' ? 'var(--red-dim)' : 'var(--green-dim)';
    t.style.color = color || 'var(--green)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}}

function resetDefaults() {{
    selectHeadset('dummy');
    SCHEMA.forEach(section => {{
        section.fields.forEach(field => {{
            const el = document.querySelector(`[data-key="${{field.key}}"]`);
            if (!el) return;
            if (field.type === 'bool') {{
                const on = field.default === 'true';
                el.classList.toggle('on', on);
                const label = el.nextElementSibling;
                if (label) label.textContent = on ? 'On' : 'Off';
            }} else {{
                el.value = field.default;
            }}
        }});
    }});
    showToast('Reset to defaults', 'var(--amber)');
}}

async function saveAndLaunch() {{
    const values = collectValues();
    try {{
        const resp = await fetch('/save', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify(values),
        }});
        if (resp.ok) {{
            showToast('Configuration saved — starting Timeflux...');
            // Countdown before redirect so user knows it's loading
            let remaining = 15;
            const countdown = setInterval(() => {{
                remaining--;
                if (remaining > 0) {{
                    showToast(`Starting Timeflux... redirecting in ${{remaining}}s`);
                }} else {{
                    clearInterval(countdown);
                }}
            }}, 1000);
            // Fade out the config UI
            setTimeout(() => {{
                document.body.style.opacity = '0';
                document.body.style.transition = 'opacity 0.5s';
            }}, 13000);
            // Shut down the config server after fade
            setTimeout(() => {{
                fetch('/shutdown');
            }}, 14000);
            // Wait for Timeflux to start before redirecting to dashboard
            setTimeout(() => {{
                window.location.href = 'http://localhost:8002/dashboard';
            }}, 15000);
        }} else {{
            showToast('Error saving configuration', 'var(--red)');
        }}
    }} catch (e) {{
        showToast('Error: ' + e.message, 'var(--red)');
    }}
}}

renderSections();

// ══════════════════════════════════════════════════════════════
// 3D Brain — OBJ model + Three.js
// ══════════════════════════════════════════════════════════════
(function() {{
    const canvas = document.getElementById('brainCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050508, 0.0007);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 20, 200);
    camera.lookAt(0, 10, 0);

    const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true, alpha: true }});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050508, 0.85);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x0c1a2e, 0.8));

    const keyLight = new THREE.PointLight(0x22d3ee, 2.2, 600);
    keyLight.position.set(100, 120, 150);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x06b6d4, 1.2, 500);
    fillLight.position.set(-120, -40, -100);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xa78bfa, 0.9, 400);
    rimLight.position.set(0, 160, -80);
    scene.add(rimLight);

    const bottomLight = new THREE.PointLight(0x0e7490, 0.4, 300);
    bottomLight.position.set(0, -100, 50);
    scene.add(bottomLight);

    // Violet accent — matches the radial gradient glow
    const violetLight = new THREE.PointLight(0x8b7db5, 0.5, 350);
    violetLight.position.set(-80, 60, 120);
    scene.add(violetLight);

    // ── Brain group ──
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // ── Particles (synapse-like, around brain) ──
    const particleCount = 3000;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    const pSpeeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {{
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 50 + Math.random() * 120;
        pPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pPos[i * 3 + 2] = r * Math.cos(phi);
        pSpeeds[i] = 0.2 + Math.random() * 0.8;
    }}
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    // Round particle texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32; pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d');
    pCtx.beginPath();
    pCtx.arc(16, 16, 14, 0, Math.PI * 2);
    pCtx.fillStyle = '#ffffff';
    pCtx.fill();
    const pTex = new THREE.CanvasTexture(pCanvas);

    const pMat = new THREE.PointsMaterial({{
        color: 0x44d8ee,
        size: 1.4,
        map: pTex,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    }});
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── Load OBJ brain ──
    const loader = new THREE.OBJLoader();
    loader.load('/brain.obj', function(obj) {{
        // Center the model
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 100 / maxDim;

        obj.position.sub(center);
        obj.scale.multiplyScalar(scale);

        // Apply materials to all meshes
        obj.traverse(function(child) {{
            if (child.isMesh) {{
                child.geometry.computeVertexNormals();

                // Solid brain — translucent teal/violet with Fresnel-like glow
                const solidMat = new THREE.MeshPhongMaterial({{
                    color: 0x0e4a6e,
                    emissive: 0x0a3850,
                    specular: 0x22d3ee,
                    shininess: 40,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide,
                }});
                child.material = solidMat;

                // Add wireframe overlay as sibling — mix cyan & violet
                const wireMat = new THREE.MeshBasicMaterial({{
                    color: 0x3ecae8,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.06,
                }});
                const wireChild = new THREE.Mesh(child.geometry, wireMat);
                wireChild.position.copy(child.position);
                wireChild.rotation.copy(child.rotation);
                wireChild.scale.copy(child.scale);
                obj.add(wireChild);

                // Add point cloud on brain surface
                const pointsMat = new THREE.PointsMaterial({{
                    color: 0x22d3ee,
                    size: 0.6,
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    sizeAttenuation: true,
                }});
                const points = new THREE.Points(child.geometry, pointsMat);
                points.position.copy(child.position);
                points.rotation.copy(child.rotation);
                points.scale.copy(child.scale);
                obj.add(points);
            }}
        }});

        brainGroup.add(obj);
    }});

    // ── Mouse interaction (subtle tilt) ──
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', function(e) {{
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }});

    // ── Animation loop ──
    let rafId = null;
    const clock = new THREE.Clock();

    function animate() {{
        rafId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Brain rotation + mouse tilt
        brainGroup.rotation.y = t * 0.12 + mouseX * 0.3;
        brainGroup.rotation.x = Math.sin(t * 0.15) * 0.05 + mouseY * 0.15;

        // Breathing pulse
        const pulse = 1 + Math.sin(t * 1.0) * 0.01;
        brainGroup.scale.set(pulse, pulse, pulse);

        // Particle orbiting
        const pp = pGeo.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {{
            const idx = i * 3;
            const spd = pSpeeds[i] * 0.003;
            const x = pp[idx], z = pp[idx + 2];
            pp[idx]     = x * Math.cos(spd) - z * Math.sin(spd);
            pp[idx + 2] = x * Math.sin(spd) + z * Math.cos(spd);
            pp[idx + 1] += Math.sin(t * pSpeeds[i] * 0.5 + i) * 0.02;
        }}
        pGeo.attributes.position.needsUpdate = true;

        // Pulsing lights
        keyLight.intensity = 2.2 + Math.sin(t * 0.7) * 0.5;
        rimLight.intensity = 0.9 + Math.sin(t * 1.1 + 1) * 0.3;
        violetLight.intensity = 0.5 + Math.sin(t * 0.6 + 2) * 0.2;

        particles.rotation.y = t * 0.02;

        renderer.render(scene, camera);

        // Animated metric values (smooth sine-based simulation)
        const lmStress    = document.getElementById('lm-stress');
        const lmCognitive = document.getElementById('lm-cognitive');
        const lmAttention = document.getElementById('lm-attention');
        const lmArousal   = document.getElementById('lm-arousal');
        if (lmStress) {{
            const s = v => (v * 100).toFixed(0) + '%';
            lmStress.textContent    = s(0.25 + 0.15 * Math.sin(t * 0.4));
            lmCognitive.textContent = s(0.45 + 0.20 * Math.sin(t * 0.3 + 1));
            lmAttention.textContent = s(0.65 + 0.15 * Math.sin(t * 0.5 + 2));
            lmArousal.textContent   = s(0.40 + 0.18 * Math.sin(t * 0.35 + 3));
        }}
    }}
    animate();

    // ── Resize ──
    window.addEventListener('resize', function() {{
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }});

    // ── Cleanup ──
    window._brainCleanup = function() {{
        if (rafId) cancelAnimationFrame(rafId);
        renderer.dispose();
    }};
}})();

// ── Enter Labs transition ──
function enterLabs() {{
    const overlay = document.getElementById('landingOverlay');
    const setup = document.getElementById('setupContainer');
    overlay.classList.add('exiting');
    setTimeout(() => {{
        setup.classList.add('visible');
    }}, 400);
    setTimeout(() => {{
        if (window._brainCleanup) window._brainCleanup();
        overlay.style.display = 'none';
    }}, 1100);
}}
</script>
</body>
</html>"""


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


_server_ref = None


class SetupHandler(http.server.BaseHTTPRequestHandler):
    """Handle setup UI requests."""

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == "/shutdown":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
            threading.Thread(target=lambda: _server_ref.shutdown(), daemon=True).start()
            return

        if self.path == "/brain.obj":
            obj_path = Path(__file__).parent / "brain.obj"
            if obj_path.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(obj_path.read_bytes())
            else:
                self.send_response(404)
                self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(get_html().encode("utf-8"))

    def _cors_headers(self):
        """Add CORS headers for cross-origin requests from Timeflux UI."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path == "/save":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                values = json.loads(body)
                write_env(ENV_PATH, values)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self._cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        if self.path == "/restart":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "message": "restart requested"}).encode())
            # Signal the Timeflux process to restart
            # The parent process (make run) will handle the actual restart
            threading.Thread(
                target=lambda: os.kill(os.getpid(), signal.SIGUSR1),
                daemon=True,
            ).start()
            return

        self.send_response(404)
        self.end_headers()


def main():
    global _server_ref
    httpd = ReusableTCPServer(("", PORT), SetupHandler)
    _server_ref = httpd
    url = f"http://localhost:{PORT}"
    print(f"\n  Prometheus Setup UI → {url}\n")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Setup cancelled.\n")
        sys.exit(1)
    finally:
        httpd.server_close()
    print("  Configuration saved. Starting Timeflux...\n")


if __name__ == "__main__":
    main()
