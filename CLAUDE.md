# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prometheus BCI is a brain-computer interface platform built on **Timeflux** for real-time EEG signal processing, cognitive metric computation, and multimodal data collection. It was used to control exoskeleton arms using brain and facial signals.

## Build & Run Commands

```bash
make setup      # Create conda env (timeflux, python 3.10) + install deps
make config     # Interactive .env editor in browser
make run        # Launch setup_ui then timeflux daemon
make sync-ui    # Propagate shared UI assets (CSS/JS) to all routes
make logs       # Tail latest log file
make clean      # Destroy conda env
make update     # Upgrade dependencies
```

**Manual setup**: `conda create --name timeflux python=3.10 pytables && pip install -r requirements.txt`

**Run without hardware**: Set `EEG_DEVICE=dummy` and `PPG_DEVICE=fake` in `.env` — all UIs and classifiers work with synthetic data.

**Tests**: `python -m pytest tests/ -v` (test infra in `tests/`, mocks for timeflux/neurokit2 in `tests/conftest.py`)

### Docker

```bash
make docker-build    # Build the production image (multi-stage, python:3.10-slim)
make docker-run      # Simulation mode — dummy EEG + fake PPG, no hardware needed
make docker-run-hw   # Hardware mode — USB/Bluetooth devices (Linux only)
make docker-stop     # Stop containers
make docker-test     # Run unit tests inside a container
make docker-logs     # Follow container logs
```

**Docker files** (all in `deploy/`): `Dockerfile` (prod, multi-stage), `Dockerfile.test` (test runner), `docker-compose.yml` (3 services: `prometheus`, `prometheus-hw`, `tests`), `.dockerignore`. The Makefile uses `docker compose -f deploy/docker-compose.yml` so all `make docker-*` commands work from the project root.

**Hardware in Docker (Linux only)**: The `prometheus-hw` service uses `privileged: true`, `network_mode: host`, and device mounts (`/dev/video0`, `/var/run/dbus`). USB serial devices (OpenBCI, BITalino) must be uncommented in `deploy/docker-compose.yml` under `devices:`. macOS/Windows cannot forward USB/Bluetooth to Docker — use native install instead.

## Important: UI Structure

Do not modify the directory structure of `ui/`. Each UI folder follows a convention imposed by Timeflux (`index.html` + `assets/`), and routes are registered in `app.yaml`. Renaming, moving, or restructuring UI folders will break Timeflux's static file serving and routing.

### Shared UI Assets

The navigation sidebar and design system are centralized in `ui/common/` and **copied** into each route's `assets/` folder:

- `ui/common/assets/css/prometheus.css` → copied as `assets/css/shared.css` in each route
- `ui/common/assets/js/nav-sidebar.js` → copied as `assets/js/nav-sidebar.js` in each route

**Why copies instead of symlinks or absolute paths?** Timeflux UI uses aiohttp's `add_static()` which serves each route's `assets/` directory independently. It does not follow symlinks (`follow_symlinks=False` by default) and the `/common/assets/` absolute path is reserved for Timeflux's own built-in assets (like `timeflux.js`). Copies are the only reliable approach.

**After modifying shared files**, run `make sync-ui` to propagate changes to all routes.

The `<nav-sidebar>` Web Component handles the navigation sidebar. Each page only needs:
```html
<link rel="stylesheet" href="assets/css/shared.css">
<script src="assets/js/nav-sidebar.js"></script>
<nav-sidebar active="/route_name"></nav-sidebar>
```

## Architecture

### Timeflux Graph-Based Processing

The system is a **dataflow pipeline** defined in YAML:

- **Nodes** (`nodes/`): Python processing units (filters, classifiers, feature extractors)
- **Graphs** (`graphs/`): DAGs connecting nodes via ports, composed into the main pipeline
- **`app.yaml`**: Main orchestration config using **Jinja2 templating** — imports graphs conditionally based on `.env` variables
- **ZMQ broker**: Coordinates data flow between graphs; UI subscribes via WebSocket

**Launch flow**: `make run` → `setup_ui.py` → `timeflux -d app.yaml` → graphs loaded per `.env` config → ZMQ pub/sub → UI via WebSocket

### Data Flow

```
EEG Device → Raw Signal (250Hz) → Bandpass (0.1-40Hz) → Filter Bank
  ├→ Bandpower → EEG Quality UI / Cognitive Metrics
  ├→ Motor Imagery Classifier (Riemannian geometry → Tangent Space → LogReg)
  ├→ Blink Detector (SVM, frontal channels)
  ├→ HDF5 Recording
  └→ ZMQ Publish → WebSocket → Browser Dashboards
```

### Key Processing Pipelines

**Motor Imagery**: 900ms windows → covariance matrices → Riemannian tangent space projection → Logistic Regression → probability accumulation (75% threshold, 2s refractory)

**Blink Detection**: 1500ms windows → frontal channel normalization → SVM (RBF, >80% confidence) → double/triple blink recognition (1200ms window, 800ms refractory)

### Configuration System

All runtime behavior is controlled via `.env` with Jinja2 substitution into `app.yaml`. Key sections: `[DEVICES]` (EEG/PPG/ECG/camera selection), `[TRAINING]` (baseline, motor imagery, blink parameters), `[OUTPUT]` (OSC, logging, data paths). Pre-trained models can be loaded from `models/` to skip training.

### UI Layer

Vanilla JS frontends served by Timeflux UI (port 8002). Communication via WebSocket through `timeflux.js` (IO class). Shared design system and navigation are centralized in `ui/common/` using a `<nav-sidebar>` Web Component (no Shadow DOM, renders directly into the page DOM). Key UIs:

- `/eeg_quality` — Smoothie Charts + SVG 10-20 head map
- `/brain_metrics` — Frequency band powers, attention/arousal
- `/mind_control_training` — Motor imagery training with stimuli
- `/robotic_arm` — Three.js 3D arm visualization

### Robotics Subproject

`robotics-pick-and-place/` is a **separate React 19 + Vite + TypeScript** project with Three.js and MuJoCo WebAssembly for physics simulation. Has its own `package.json` — run `npm install && npm run dev` from that directory.

## Supported EEG Devices

Emotiv Insight/Epoch X+, OpenBCI Cyton, Conscious Labs, generic LSL, and dummy (random 16-channel data for development).

## Key Files

- `app.yaml` — Main pipeline config with Jinja2 conditionals
- `nodes/classification/accumulator.py` — Probability-based prediction with recovery logic
- `nodes/eeg/metrics.py` — Cognitive load (alpha/theta ratio)
- `graphs/classification/motor_and_blink.yaml` — Full ML pipeline definition
- `scripts/setup_ui.py` — Interactive .env configuration UI
- `ui/common/assets/js/timeflux.js` — WebSocket client library shared across all UIs
- `deploy/Dockerfile` — Multi-stage production image (builder + runtime)
- `deploy/Dockerfile.test` — Lightweight image for running pytest
- `deploy/docker-compose.yml` — Services: `prometheus` (simulation), `prometheus-hw` (hardware), `tests`
- `tests/conftest.py` — Mocks for timeflux, neurokit2 and other heavy deps so tests run without them
- `tests/test_regression.py` — Non-regression: locks default values, known outputs, schema stability
