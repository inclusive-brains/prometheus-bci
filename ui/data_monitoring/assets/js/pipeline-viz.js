"use strict";

/**
 * Pipeline Visualization — Animated Beam
 * Shows connected modalities → Prometheus hub → active metrics
 * Pure vanilla JS/SVG, no dependencies.
 */

const PipelineViz = (() => {

    // ── Config ──────────────────────────────────────────────────────────
    const MODALITIES = [
        { id: 'eeg',    label: 'EEG',    icon: 'brain',  topics: ['eeg_raw', 'eeg_filtered'] },
        { id: 'ppg',    label: 'PPG',    icon: 'heart',  topics: ['ppg_raw', 'ppg_filtered'] },
        { id: 'camera', label: 'Camera', icon: 'eye',    topics: ['facial_metrics', 'facial_blendshapes'] },
    ];

    const METRICS = [
        { id: 'attention',      label: 'Attention',      color: '#22d3ee', topics: ['eeg_attention_metric', 'ppg_attention_metric', 'multimodal_attention'] },
        { id: 'arousal',        label: 'Arousal',        color: '#f59e0b', topics: ['eeg_arousal_metric', 'ppg_arousal_metric', 'multimodal_arousal'] },
        { id: 'cognitive_load', label: 'Cognitive Load', color: '#a78bfa', topics: ['eeg_cognitiveload_metric', 'ppg_cognitive_load_metric', 'multimodal_cognitive_load'] },
        { id: 'stress',         label: 'Stress',         color: '#ef4444', topics: ['eeg_stress_metric', 'ppg_stress_metric', 'multimodal_stress'] },
    ];

    const ICONS = {
        brain: '<path d="M12 18V5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M18 18a4 4 0 0 0 2-7.464" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 18a4 4 0 0 1-2-7.464" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        prometheus: '<path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    };

    let _container = null;
    let _svg = null;
    let _activeModalities = new Set();
    let _activeMetrics = new Set();
    let _beamId = 0;
    let _resizeObserver = null;

    // ── SVG Beam Rendering ──────────────────────────────────────────────

    function createBeamGradient(svg, id, startColor, stopColor, reverse) {
        const defs = svg.querySelector('defs') || svg.appendChild(svgEl('defs'));
        const grad = svgEl('linearGradient');
        grad.setAttribute('id', id);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');

        const stop1 = svgEl('stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', startColor);
        stop1.setAttribute('stop-opacity', '0');

        const stop2 = svgEl('stop');
        stop2.setAttribute('offset', '30%');
        stop2.setAttribute('stop-color', startColor);

        const stop3 = svgEl('stop');
        stop3.setAttribute('offset', '70%');
        stop3.setAttribute('stop-color', stopColor);

        const stop4 = svgEl('stop');
        stop4.setAttribute('offset', '100%');
        stop4.setAttribute('stop-color', stopColor);
        stop4.setAttribute('stop-opacity', '0');

        grad.append(stop1, stop2, stop3, stop4);
        defs.appendChild(grad);
        return grad;
    }

    function svgEl(tag) {
        return document.createElementNS('http://www.w3.org/2000/svg', tag);
    }

    function computePath(fromEl, toEl, container, curvature) {
        const cr = container.getBoundingClientRect();
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();

        const sx = fr.left - cr.left + fr.width / 2;
        const sy = fr.top - cr.top + fr.height / 2;
        const ex = tr.left - cr.left + tr.width / 2;
        const ey = tr.top - cr.top + tr.height / 2;
        const cy = (sy + ey) / 2 - curvature;

        return `M ${sx},${sy} Q ${(sx + ex) / 2},${cy} ${ex},${ey}`;
    }

    function addBeam(fromEl, toEl, container, svg, color, reverse, curvature) {
        const id = `beam-grad-${_beamId++}`;
        const gradStart = reverse ? color : '#22d3ee';
        const gradStop = reverse ? '#22d3ee' : color;
        createBeamGradient(svg, id, gradStart, gradStop, reverse);

        const pathD = computePath(fromEl, toEl, container, curvature);

        // Background path
        const bgPath = svgEl('path');
        bgPath.setAttribute('d', pathD);
        bgPath.setAttribute('stroke', 'rgba(255,255,255,0.06)');
        bgPath.setAttribute('stroke-width', '2');
        bgPath.setAttribute('fill', 'none');
        bgPath.setAttribute('stroke-linecap', 'round');
        bgPath.classList.add('beam-bg');
        svg.appendChild(bgPath);

        // Animated beam path
        const beamPath = svgEl('path');
        beamPath.setAttribute('d', pathD);
        beamPath.setAttribute('stroke', `url(#${id})`);
        beamPath.setAttribute('stroke-width', '2');
        beamPath.setAttribute('fill', 'none');
        beamPath.setAttribute('stroke-linecap', 'round');
        beamPath.classList.add('beam-active');

        // Calculate path length for animation
        svg.appendChild(beamPath);
        const len = beamPath.getTotalLength();
        beamPath.style.strokeDasharray = `${len * 0.3} ${len * 0.7}`;
        beamPath.style.strokeDashoffset = '0';
        const duration = 2 + Math.random() * 2;
        const delay = Math.random() * 2;
        beamPath.style.animation = `beam-flow ${duration}s ${delay}s linear infinite${reverse ? ' reverse' : ''}`;

        return { bgPath, beamPath, fromEl, toEl, curvature };
    }

    // ── Layout & Rendering ──────────────────────────────────────────────

    function render(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        _container.innerHTML = '';
        _container.classList.add('pipeline-viz');

        // Left column — Modalities
        const leftCol = el('div', 'pv-column pv-modalities');
        MODALITIES.forEach(m => {
            const node = el('div', `pv-node pv-modality`);
            node.id = `pv-mod-${m.id}`;
            node.dataset.id = m.id;
            node.innerHTML = `
                <div class="pv-node-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20">${ICONS[m.icon]}</svg>
                </div>
                <span class="pv-node-label">${m.label}</span>
                <span class="pv-status-dot" id="pv-dot-${m.id}"></span>
            `;
            leftCol.appendChild(node);
        });

        // Center — Hub
        const centerCol = el('div', 'pv-column pv-center');
        const hub = el('div', 'pv-hub');
        hub.id = 'pv-hub';
        hub.innerHTML = `
            <div class="pv-hub-ring"></div>
            <div class="pv-hub-core">
                <svg viewBox="0 0 24 24" width="24" height="24">${ICONS.prometheus}</svg>
            </div>
            <span class="pv-hub-label">Prometheus</span>
        `;
        centerCol.appendChild(hub);

        // Right column — Metrics
        const rightCol = el('div', 'pv-column pv-metrics');
        METRICS.forEach(m => {
            const node = el('div', `pv-node pv-metric`);
            node.id = `pv-met-${m.id}`;
            node.dataset.id = m.id;
            node.innerHTML = `
                <span class="pv-status-dot" id="pv-mdot-${m.id}"></span>
                <span class="pv-node-label">${m.label}</span>
                <div class="pv-node-icon" style="--node-color: ${m.color}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${m.color}" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                </div>
            `;
            rightCol.appendChild(node);
        });

        // SVG overlay for beams
        _svg = svgEl('svg');
        _svg.classList.add('pv-beams');
        _svg.setAttribute('fill', 'none');

        const defs = svgEl('defs');
        _svg.appendChild(defs);

        _container.append(leftCol, centerCol, rightCol, _svg);

        // Draw beams after layout settles
        requestAnimationFrame(() => requestAnimationFrame(() => drawAllBeams()));

        // Observe resizes
        if (_resizeObserver) _resizeObserver.disconnect();
        _resizeObserver = new ResizeObserver(() => drawAllBeams());
        _resizeObserver.observe(_container);
    }

    function drawAllBeams() {
        if (!_svg || !_container) return;

        // Clear existing beams
        _svg.querySelectorAll('path').forEach(p => p.remove());

        const cr = _container.getBoundingClientRect();
        _svg.setAttribute('width', cr.width);
        _svg.setAttribute('height', cr.height);
        _svg.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);

        const hubEl = document.getElementById('pv-hub');

        // Modality → Hub beams
        MODALITIES.forEach((m, i) => {
            const fromEl = document.getElementById(`pv-mod-${m.id}`);
            if (!fromEl || !hubEl) return;
            const n = MODALITIES.length;
            const curvature = (i - (n - 1) / 2) * 40;
            const beam = addBeam(fromEl, hubEl, _container, _svg, '#22d3ee', false, curvature);
            beam.bgPath.dataset.modality = m.id;
            beam.beamPath.dataset.modality = m.id;

            if (!_activeModalities.has(m.id)) {
                beam.beamPath.style.opacity = '0';
                beam.bgPath.style.opacity = '0.3';
            }
        });

        // Hub → Metric beams
        METRICS.forEach((m, i) => {
            const toEl = document.getElementById(`pv-met-${m.id}`);
            if (!toEl || !hubEl) return;
            const n = METRICS.length;
            const curvature = (i - (n - 1) / 2) * 40;
            const beam = addBeam(hubEl, toEl, _container, _svg, m.color, false, curvature);
            beam.bgPath.dataset.metric = m.id;
            beam.beamPath.dataset.metric = m.id;

            if (!_activeMetrics.has(m.id)) {
                beam.beamPath.style.opacity = '0';
                beam.bgPath.style.opacity = '0.3';
            }
        });
    }

    // ── State Updates ───────────────────────────────────────────────────

    function activateModality(id) {
        if (_activeModalities.has(id)) return;
        _activeModalities.add(id);

        const dot = document.getElementById(`pv-dot-${id}`);
        if (dot) dot.classList.add('active');

        const node = document.getElementById(`pv-mod-${id}`);
        if (node) node.classList.add('active');

        // Activate beams
        _svg?.querySelectorAll(`path[data-modality="${id}"]`).forEach(p => {
            if (p.classList.contains('beam-active')) {
                p.style.opacity = '1';
            }
            if (p.classList.contains('beam-bg')) {
                p.style.opacity = '1';
            }
        });
    }

    function activateMetric(id) {
        if (_activeMetrics.has(id)) return;
        _activeMetrics.add(id);

        const dot = document.getElementById(`pv-mdot-${id}`);
        if (dot) dot.classList.add('active');

        const node = document.getElementById(`pv-met-${id}`);
        if (node) node.classList.add('active');

        _svg?.querySelectorAll(`path[data-metric="${id}"]`).forEach(p => {
            if (p.classList.contains('beam-active')) {
                p.style.opacity = '1';
            }
            if (p.classList.contains('beam-bg')) {
                p.style.opacity = '1';
            }
        });
    }

    // ── Wire to IO topics ───────────────────────────────────────────────

    function bindToIO(io) {
        // Subscribe to all modality and metric topics
        const allTopics = [
            ...MODALITIES.flatMap(m => m.topics),
            ...METRICS.flatMap(m => m.topics),
        ];
        allTopics.forEach(t => io.subscribe(t));

        // Activate modalities when data arrives
        MODALITIES.forEach(m => {
            m.topics.forEach(topic => {
                io.on(topic, () => activateModality(m.id));
            });
        });

        // Activate metrics when data arrives
        METRICS.forEach(m => {
            m.topics.forEach(topic => {
                io.on(topic, () => activateMetric(m.id));
            });
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function el(tag, className) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        return e;
    }

    // ── Public API ──────────────────────────────────────────────────────

    return { render, bindToIO, activateModality, activateMetric };
})();
