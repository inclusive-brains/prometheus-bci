'use strict';

let io = new IO();

io.on('connect', function () {
    console.log('Connected');
    document.getElementById('statusDot').classList.add('connected');
    document.getElementById('statusDot').classList.remove('disconnected');
    document.getElementById('statusText').textContent = 'Connected';
    document.getElementById('streamStatus').textContent = 'Streaming';
    document.querySelector('.header-badge').classList.add('recording');
});

io.on('disconnect', function () {
    document.getElementById('statusDot').classList.remove('connected');
    document.getElementById('statusDot').classList.add('disconnected');
    document.getElementById('statusText').textContent = 'Disconnected';
    document.getElementById('streamStatus').textContent = 'Offline';
    document.querySelector('.header-badge').classList.remove('recording');
});

// Subscribe to data streams
io.subscribe('eeg_filtered');
io.subscribe('eeg_bandpower');
io.subscribe('eeg_emotiv_metrics');

// ---- 10-20 International System positions (SVG coordinates on 300x320 viewBox) ----
// Covers: Emotiv Insight, Epoch X/+, MN8, OpenBCI Cyton, Dummy, and more
var ELECTRODE_POSITIONS = {
    // Prefrontal
    Fp1: { x: 110, y: 45,  label: 'Prefrontal L' },
    Fp2: { x: 190, y: 45,  label: 'Prefrontal R' },
    Fpz: { x: 150, y: 40,  label: 'Prefrontal Mid' },
    // Anterior-Frontal
    AF3: { x: 105, y: 65,  label: 'Ant. Frontal L' },
    AF4: { x: 195, y: 65,  label: 'Ant. Frontal R' },
    AFz: { x: 150, y: 58,  label: 'Ant. Frontal Mid' },
    // Frontal
    F3:  { x: 95,  y: 95,  label: 'Frontal L' },
    F4:  { x: 205, y: 95,  label: 'Frontal R' },
    F7:  { x: 62,  y: 88,  label: 'Frontal Far L' },
    F8:  { x: 238, y: 88,  label: 'Frontal Far R' },
    Fz:  { x: 150, y: 85,  label: 'Frontal Mid' },
    // Fronto-Central
    FC1: { x: 120, y: 118, label: 'Fronto-Central L' },
    FC2: { x: 180, y: 118, label: 'Fronto-Central R' },
    FC5: { x: 68,  y: 115, label: 'Fronto-Central Far L' },
    FC6: { x: 232, y: 115, label: 'Fronto-Central Far R' },
    FCz: { x: 150, y: 110, label: 'Fronto-Central Mid' },
    // Central
    C1:  { x: 120, y: 150, label: 'Central L' },
    C2:  { x: 180, y: 150, label: 'Central R' },
    C3:  { x: 90,  y: 150, label: 'Central L' },
    C4:  { x: 210, y: 150, label: 'Central R' },
    Cz:  { x: 150, y: 145, label: 'Central Mid' },
    // Temporal
    T7:  { x: 42,  y: 150, label: 'Temporal L' },
    T8:  { x: 258, y: 150, label: 'Temporal R' },
    // Parietal
    P3:  { x: 95,  y: 205, label: 'Parietal L' },
    P4:  { x: 205, y: 205, label: 'Parietal R' },
    P7:  { x: 62,  y: 200, label: 'Parietal Far L' },
    P8:  { x: 238, y: 200, label: 'Parietal Far R' },
    Pz:  { x: 150, y: 210, label: 'Parietal Mid' },
    // Occipital
    O1:  { x: 115, y: 250, label: 'Occipital L' },
    O2:  { x: 185, y: 250, label: 'Occipital R' },
    Oz:  { x: 150, y: 258, label: 'Occipital Mid' }
};

// Color palette for electrodes (cycles if more channels than colors)
var ELECTRODE_PALETTE = [
    '#7ab3bd', '#8b7db5', '#c49545', '#c46060', '#5ca8b5',
    '#6aab8e', '#b07db5', '#bd9a7a', '#7a8ebd', '#b5a35c',
    '#9c7ab3', '#5cb5a0', '#bd7a8e', '#7abda0'
];

// ---- State ----
var discoveredElectrodes = [];
var electrodeColors = {};
var qualityState = {};
var signalBuffers = {};
var headMapBuilt = false;
var cardsBuilt = {};
var BUFFER_SIZE = 256;

// SVG namespace
var SVG_NS = 'http://www.w3.org/2000/svg';

document.addEventListener('DOMContentLoaded', function () {

    // ---- Methodology toggle ----
    var toggleBtn = document.getElementById('methodologyToggle');
    var content = document.getElementById('methodologyContent');
    var panelHeader = toggleBtn.closest('.panel-header');

    function toggleMethodology() {
        var expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !expanded);
        content.classList.toggle('open');
    }

    toggleBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMethodology(); });
    panelHeader.addEventListener('click', toggleMethodology);

    // ---- Dark theme config for Smoothie charts ----
    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255, 255, 255, 0.04)',
        millisPerLine: 7000,
        borderVisible: false
    };
    var darkLabels = { fillStyle: '#a0a0ab', fontSize: 10 };

    // ---- Discover a new electrode ----
    function discoverElectrode(name) {
        if (discoveredElectrodes.indexOf(name) !== -1) return;
        discoveredElectrodes.push(name);
        electrodeColors[name] = ELECTRODE_PALETTE[(discoveredElectrodes.length - 1) % ELECTRODE_PALETTE.length];

        // Rebuild head map with all discovered electrodes
        buildHeadMap();

        // Create card
        createElectrodeCard(name);

        // Create quality timeline series
        ensureQualitySeries(name);
    }

    // ---- Build SVG Head Map dynamically ----
    function buildHeadMap() {
        var electrodesGroup = document.getElementById('headMapElectrodes');
        var linesGroup = document.getElementById('headMapLines');

        // Clear previous
        electrodesGroup.innerHTML = '';
        linesGroup.innerHTML = '';

        // Place electrodes
        var placed = [];
        for (var i = 0; i < discoveredElectrodes.length; i++) {
            var name = discoveredElectrodes[i];
            var pos = ELECTRODE_POSITIONS[name];

            if (!pos) {
                // Unknown electrode — distribute on a circle
                var unknownIdx = i;
                var angle = (unknownIdx / Math.max(discoveredElectrodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
                pos = {
                    x: 150 + Math.cos(angle) * 85,
                    y: 155 + Math.sin(angle) * 100,
                    label: name
                };
            }

            placed.push({ name: name, x: pos.x, y: pos.y });

            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'electrode-node');
            g.setAttribute('id', 'electrode_' + name);
            g.setAttribute('data-electrode', name);

            var glow = document.createElementNS(SVG_NS, 'circle');
            glow.setAttribute('class', 'electrode-glow');
            glow.setAttribute('cx', pos.x);
            glow.setAttribute('cy', pos.y);
            glow.setAttribute('r', '22');
            glow.setAttribute('fill', 'none');
            g.appendChild(glow);

            var ring = document.createElementNS(SVG_NS, 'circle');
            ring.setAttribute('class', 'electrode-ring');
            ring.setAttribute('cx', pos.x);
            ring.setAttribute('cy', pos.y);
            ring.setAttribute('r', '14');
            ring.setAttribute('fill', 'none');
            ring.setAttribute('stroke-width', '1.5');
            g.appendChild(ring);

            var dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('class', 'electrode-dot');
            dot.setAttribute('cx', pos.x);
            dot.setAttribute('cy', pos.y);
            dot.setAttribute('r', '7');
            g.appendChild(dot);

            var label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('class', 'electrode-label');
            label.setAttribute('x', pos.x);
            label.setAttribute('y', pos.y + 28);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = name;
            g.appendChild(label);

            electrodesGroup.appendChild(g);

            // Restore quality state if we already have it
            if (qualityState[name] !== undefined) {
                var level = getQualityLevel(qualityState[name]);
                g.classList.add(level);
            }
        }

        // Draw connection lines between nearby electrodes
        for (var a = 0; a < placed.length; a++) {
            for (var b = a + 1; b < placed.length; b++) {
                var dx = placed[a].x - placed[b].x;
                var dy = placed[a].y - placed[b].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                // Connect electrodes that are within ~120px of each other
                if (dist < 120) {
                    var line = document.createElementNS(SVG_NS, 'line');
                    line.setAttribute('x1', placed[a].x);
                    line.setAttribute('y1', placed[a].y);
                    line.setAttribute('x2', placed[b].x);
                    line.setAttribute('y2', placed[b].y);
                    line.setAttribute('stroke', 'rgba(255,255,255,0.04)');
                    line.setAttribute('stroke-width', '1');
                    line.setAttribute('stroke-dasharray', '4,4');
                    linesGroup.appendChild(line);
                }
            }
        }

        headMapBuilt = true;
    }

    // ---- Create Electrode Card dynamically ----
    function createElectrodeCard(name) {
        if (cardsBuilt[name]) return;
        cardsBuilt[name] = true;

        var container = document.getElementById('electrodeCardsContainer');
        var pos = ELECTRODE_POSITIONS[name];
        var location = pos ? pos.label : name;

        var card = document.createElement('div');
        card.className = 'electrode-card';
        card.id = 'card_' + name;
        card.innerHTML =
            '<div class="electrode-card-header">' +
                '<span class="electrode-card-name">' + name + '</span>' +
                '<span class="electrode-card-status" id="status_' + name + '">—</span>' +
            '</div>' +
            '<div class="electrode-card-location">' + location + '</div>' +
            '<div class="electrode-card-value" id="quality_' + name + '">—<span class="metric-unit">%</span></div>' +
            '<div class="metric-bar-track">' +
                '<div class="metric-bar-fill electrode-bar" id="bar_' + name + '" style="width: 0%;"></div>' +
            '</div>' +
            '<div class="electrode-card-snr">' +
                '<span class="snr-label">SNR</span>' +
                '<span class="snr-value" id="snr_' + name + '">— dB</span>' +
            '</div>';

        container.appendChild(card);
    }

    // ---- Quality Timeline — Combined Smoothie Chart ----
    var qualityChart = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        timestampFormatter: SmoothieChart.timeFormatter,
        grid: darkGrid,
        labels: darkLabels,
        maxValue: 100,
        minValue: 0
    });

    var qualitySeries = {};
    var legendContainer = document.getElementById('qualityLegend');

    function ensureQualitySeries(electrode) {
        if (qualitySeries[electrode]) return;
        var color = electrodeColors[electrode] || '#7ab3bd';
        qualitySeries[electrode] = new TimeSeries();
        qualityChart.addTimeSeries(qualitySeries[electrode], {
            lineWidth: 2,
            strokeStyle: color,
            interpolation: 'bezier'
        });

        var item = document.createElement('div');
        item.className = 'quality-legend-item';
        item.innerHTML = '<span class="quality-legend-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + ';"></span>' + electrode;
        legendContainer.appendChild(item);
    }

    qualityChart.streamTo(document.getElementById('qualityTimelineChart'), 1000);

    // ---- EEG Filtered Signal Charts (per electrode) ----
    var eegCharts = {};
    var eegTimeSeries = {};

    function createEegChart(container, metric) {
        if (eegCharts[metric]) return;

        var empty = document.getElementById('emptyStateEeg');
        if (empty) empty.remove();

        var wrapper = document.createElement('div');
        wrapper.className = 'chart-item';

        var label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = metric;
        wrapper.appendChild(label);

        var canvas = document.createElement('canvas');
        canvas.id = 'eegChart_' + metric;
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        var color = electrodeColors[metric] || '#7ab3bd';
        eegCharts[metric] = new SmoothieChart({
            millisPerPixel: 10,
            responsive: true,
            grid: darkGrid,
            labels: darkLabels,
            tooltipLine: { strokeStyle: color },
            title: { text: '', fontSize: 0 }
        });
        eegTimeSeries[metric] = new TimeSeries();
        eegCharts[metric].streamTo(canvas, 1000);
        eegCharts[metric].addTimeSeries(eegTimeSeries[metric], {
            lineWidth: 1.5,
            strokeStyle: color,
            interpolation: 'bezier'
        });
    }

    // ---- Bandpower Charts (per electrode) ----
    var bpCharts = {};
    var bpTimeSeries = {};

    function createBandpowerChart(container, metric) {
        if (bpCharts[metric]) return;

        var empty = document.getElementById('emptyStateBandpower');
        if (empty) empty.remove();

        var wrapper = document.createElement('div');
        wrapper.className = 'chart-item';

        var label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = metric;
        wrapper.appendChild(label);

        var canvas = document.createElement('canvas');
        canvas.id = 'bpChart_' + metric;
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        // Extract base electrode name (e.g., "AF3" from "AF3_alpha")
        var baseElectrode = metric.split('_')[0];
        var color = electrodeColors[baseElectrode] || '#8b7db5';
        bpCharts[metric] = new SmoothieChart({
            millisPerPixel: 10,
            responsive: true,
            grid: darkGrid,
            labels: darkLabels,
            tooltipLine: { strokeStyle: color },
            title: { text: '', fontSize: 0 }
        });
        bpTimeSeries[metric] = new TimeSeries();
        bpCharts[metric].streamTo(canvas, 1000);
        bpCharts[metric].addTimeSeries(bpTimeSeries[metric], {
            lineWidth: 1.5,
            strokeStyle: color,
            interpolation: 'bezier'
        });
    }

    // ---- Quality assessment from signal ----
    function computeSignalQuality(electrode) {
        var buf = signalBuffers[electrode];
        if (!buf || buf.length < 64) return null;

        var n = buf.length;

        // 1. Compute mean & RMS
        var mean = 0;
        for (var i = 0; i < n; i++) mean += buf[i];
        mean /= n;

        var variance = 0;
        for (var j = 0; j < n; j++) {
            var diff = buf[j] - mean;
            variance += diff * diff;
        }
        variance /= n;
        var rms = Math.sqrt(variance);

        // 2. Autocorrelation at lag-1: real EEG is temporally smooth,
        //    random noise has near-zero autocorrelation.
        //    At 128 Hz, consecutive EEG samples are highly correlated (r > 0.8).
        //    Random noise: r ≈ 0.
        var autoCorr = 0;
        if (variance > 0) {
            var covSum = 0;
            for (var k = 0; k < n - 1; k++) {
                covSum += (buf[k] - mean) * (buf[k + 1] - mean);
            }
            autoCorr = covSum / ((n - 1) * variance);
        }

        // 3. High-frequency noise ratio: compare sample-to-sample differences
        //    (approximates high-freq content) vs overall signal variance.
        //    Real EEG (bandpass 0.1–40 Hz at 128 Hz) is smooth → low HF ratio.
        //    Random noise → HF ratio ≈ 1.
        var diffVariance = 0;
        for (var d = 0; d < n - 1; d++) {
            var dd = buf[d + 1] - buf[d];
            diffVariance += dd * dd;
        }
        diffVariance /= (n - 1);
        var hfRatio = variance > 0 ? diffVariance / (2 * variance) : 1;
        // For pure white noise: hfRatio ≈ 1.0
        // For smooth EEG signal: hfRatio ≈ 0.01–0.3

        // 4. Spike detection: ratio of max amplitude to RMS
        var maxVal = 0;
        for (var m = 0; m < n; m++) {
            var absVal = Math.abs(buf[m] - mean);
            if (absVal > maxVal) maxVal = absVal;
        }
        var crestFactor = rms > 0 ? maxVal / rms : 0;

        // 5. SNR estimate based on autocorrelation
        //    SNR ≈ autoCorr / (1 - autoCorr) for AR(1) signals
        var snr = 0;
        if (autoCorr > 0.05 && autoCorr < 1) {
            snr = 10 * Math.log10(autoCorr / (1 - autoCorr + 0.001));
            snr = Math.max(-10, Math.min(30, snr));
        } else {
            snr = -10;
        }

        // 6. Quality score computation
        var quality = 0;

        // No signal / flat line
        if (rms < 0.1) {
            quality = 2;
            snr = -10;
        }
        // Saturated / huge artifacts
        else if (rms > 500 || crestFactor > 10) {
            quality = 10;
        }
        // Normal amplitude range
        else {
            // Temporal smoothness score (0–40 points)
            // autoCorr > 0.9 = very smooth (good EEG), ≈ 0 = noise
            var smoothScore = Math.max(0, Math.min(40, autoCorr * 50));

            // Low HF noise score (0–30 points)
            // hfRatio < 0.15 = clean signal, > 0.8 = pure noise
            var hfScore = 0;
            if (hfRatio < 0.1) hfScore = 30;
            else if (hfRatio < 0.3) hfScore = 20;
            else if (hfRatio < 0.5) hfScore = 10;
            else if (hfRatio < 0.7) hfScore = 5;

            // Amplitude plausibility score (0–15 points)
            // EEG typically 1–100 µV after filtering
            var ampScore = 0;
            if (rms > 0.5 && rms < 150) ampScore = 15;
            else if (rms >= 150 && rms < 300) ampScore = 8;

            // Stability score (0–15 points) — low crest factor = no big spikes
            var stabilityScore = 0;
            if (crestFactor < 3) stabilityScore = 15;
            else if (crestFactor < 5) stabilityScore = 10;
            else if (crestFactor < 8) stabilityScore = 5;

            quality = smoothScore + hfScore + ampScore + stabilityScore;
        }

        quality = Math.max(0, Math.min(100, Math.round(quality)));
        return { quality: quality, snr: snr.toFixed(1) };
    }

    function getQualityLevel(quality) {
        if (quality >= 70) return 'good';
        if (quality >= 40) return 'fair';
        if (quality >= 15) return 'poor';
        return 'off';
    }

    function getQualityLabel(level) {
        switch (level) {
            case 'good': return 'Good';
            case 'fair': return 'Fair';
            case 'poor': return 'Poor';
            case 'off':  return 'No contact';
            default:     return '—';
        }
    }

    function updateElectrodeUI(electrode, quality, snr) {
        var level = getQualityLevel(quality);

        var qualityEl = document.getElementById('quality_' + electrode);
        var barEl = document.getElementById('bar_' + electrode);
        var statusEl = document.getElementById('status_' + electrode);
        var snrEl = document.getElementById('snr_' + electrode);
        var cardEl = document.getElementById('card_' + electrode);

        if (qualityEl) qualityEl.innerHTML = quality.toFixed(0) + '<span class="metric-unit">%</span>';
        if (barEl) {
            barEl.style.width = quality + '%';
            barEl.className = 'metric-bar-fill electrode-bar ' + level;
        }
        if (statusEl) {
            statusEl.textContent = getQualityLabel(level);
            statusEl.className = 'electrode-card-status ' + level;
        }
        if (snrEl) snrEl.textContent = snr + ' dB';
        if (cardEl) cardEl.className = 'electrode-card ' + level;

        // Update head map electrode
        var nodeEl = document.getElementById('electrode_' + electrode);
        if (nodeEl) {
            nodeEl.classList.remove('good', 'fair', 'poor', 'off');
            nodeEl.classList.add(level);
        }

        // Update quality timeline
        if (qualitySeries[electrode]) {
            qualitySeries[electrode].append(new Date().getTime(), quality);
        }
    }

    function updateOverallQuality() {
        var electrodes = Object.keys(qualityState);
        if (electrodes.length === 0) return;

        var total = 0;
        for (var i = 0; i < electrodes.length; i++) {
            total += qualityState[electrodes[i]];
        }
        var avg = total / electrodes.length;

        var el = document.getElementById('overallQualityValue');
        if (el) {
            el.textContent = avg.toFixed(0) + '%';
            var level = getQualityLevel(avg);
            el.className = 'quality-value ' + level;
        }
    }

    // ---- Handle incoming EEG filtered data ----
    io.on('eeg_filtered', function (message) {
        var container = document.getElementById('eegChartsContainer');
        for (var timestamp in message) {
            for (var electrode in message[timestamp]) {
                var value = message[timestamp][electrode];

                // Auto-discover electrode
                discoverElectrode(electrode);

                // Create chart
                createEegChart(container, electrode);
                if (eegTimeSeries[electrode]) {
                    eegTimeSeries[electrode].append(parseInt(timestamp), value);
                }

                // Buffer signal for quality computation
                if (!signalBuffers[electrode]) signalBuffers[electrode] = [];
                signalBuffers[electrode].push(value);
                if (signalBuffers[electrode].length > BUFFER_SIZE) {
                    signalBuffers[electrode].shift();
                }

                // Compute quality periodically
                if (signalBuffers[electrode].length % 32 === 0) {
                    var result = computeSignalQuality(electrode);
                    if (result) {
                        qualityState[electrode] = result.quality;
                        updateElectrodeUI(electrode, result.quality, result.snr);
                        updateOverallQuality();
                    }
                }
            }
        }
    });

    // ---- Handle bandpower data ----
    io.on('eeg_bandpower', function (message) {
        var container = document.getElementById('eegBandpowerContainer');
        for (var timestamp in message) {
            for (var metric in message[timestamp]) {
                createBandpowerChart(container, metric);
                if (bpTimeSeries[metric]) {
                    bpTimeSeries[metric].append(parseInt(timestamp), message[timestamp][metric]);
                }
            }
        }
    });

    // ---- Handle Emotiv device metrics (if available) ----
    io.on('eeg_emotiv_metrics', function (message) {
        for (var timestamp in message) {
            var data = message[timestamp];
            for (var key in data) {
                // Check if key matches known electrode patterns with quality suffix
                for (var i = 0; i < discoveredElectrodes.length; i++) {
                    var el = discoveredElectrodes[i];
                    if (key.indexOf(el) !== -1 && (key.indexOf('quality') !== -1 || key.indexOf('contact') !== -1)) {
                        var q = parseFloat(data[key]);
                        if (!isNaN(q)) {
                            if (q <= 4) q = q * 25; // Some devices use 0-4 scale
                            qualityState[el] = q;
                            updateElectrodeUI(el, q, '—');
                            updateOverallQuality();
                        }
                    }
                }
            }
        }
    });
});
