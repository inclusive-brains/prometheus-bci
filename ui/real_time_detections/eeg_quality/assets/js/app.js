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

// Known electrode channels (will be auto-detected from data if different)
var knownElectrodes = ['AF3', 'AF4', 'T7', 'T8', 'Pz'];

// Electrode colors (muted palette matching the design)
var electrodeColors = {
    'AF3': '#7ab3bd',
    'AF4': '#8b7db5',
    'T7':  '#c49545',
    'T8':  '#c46060',
    'Pz':  '#5ca8b5'
};

// Quality state per electrode
var qualityState = {};

// Rolling signal buffer per electrode for SNR calculation
var signalBuffers = {};
var BUFFER_SIZE = 256; // ~2 seconds at 128 Hz

document.addEventListener('DOMContentLoaded', function () {

    // ---- Dark theme config for Smoothie charts ----
    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255, 255, 255, 0.04)',
        millisPerLine: 7000,
        borderVisible: false
    };
    var darkLabels = { fillStyle: '#a0a0ab', fontSize: 10 };

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
        if (!qualitySeries[electrode]) {
            var color = electrodeColors[electrode] || '#7ab3bd';
            qualitySeries[electrode] = new TimeSeries();
            qualityChart.addTimeSeries(qualitySeries[electrode], {
                lineWidth: 2,
                strokeStyle: color,
                interpolation: 'bezier'
            });

            // Add legend entry
            var item = document.createElement('div');
            item.className = 'quality-legend-item';
            item.innerHTML = '<span class="quality-legend-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + ';"></span>' + electrode;
            legendContainer.appendChild(item);
        }
    }

    qualityChart.streamTo(document.getElementById('qualityTimelineChart'), 1000);

    // ---- EEG Filtered Signal Charts (per electrode) ----
    var eegCharts = {};
    var eegTimeSeries = {};

    function createEegChart(container, metric) {
        if (!eegCharts[metric]) {
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
    }

    // ---- Bandpower Charts (per electrode) ----
    var bpCharts = {};
    var bpTimeSeries = {};

    function createBandpowerChart(container, metric) {
        if (!bpCharts[metric]) {
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
    }

    // ---- Quality assessment from signal ----
    function computeSignalQuality(electrode) {
        var buf = signalBuffers[electrode];
        if (!buf || buf.length < 32) return null;

        // Compute RMS of the signal
        var sum = 0;
        var mean = 0;
        for (var i = 0; i < buf.length; i++) mean += buf[i];
        mean /= buf.length;
        for (var j = 0; j < buf.length; j++) {
            var diff = buf[j] - mean;
            sum += diff * diff;
        }
        var rms = Math.sqrt(sum / buf.length);

        // Estimate SNR: signal power vs noise floor
        // Higher RMS with moderate variance = good signal
        // Very low RMS = no signal / bad contact
        // Very high variance with spikes = artifacts

        var maxVal = Math.max.apply(null, buf.map(Math.abs));
        var snr = 0;

        if (maxVal > 0 && rms > 0) {
            // Simple SNR estimate: ratio of mean absolute signal to noise deviation
            var meanAbs = 0;
            for (var k = 0; k < buf.length; k++) meanAbs += Math.abs(buf[k]);
            meanAbs /= buf.length;

            snr = 20 * Math.log10(meanAbs / (rms - meanAbs + 0.001));
            snr = Math.max(0, Math.min(40, snr));
        }

        // Quality score (0-100)
        // Good signal: moderate amplitude (5-100 uV), reasonable variance
        var quality = 0;
        if (rms > 0.5 && rms < 200) {
            // Base quality from having a reasonable signal
            quality = 50;

            // Bonus for good SNR
            quality += Math.min(30, snr * 1.5);

            // Bonus for stable signal (low max/rms ratio means fewer spikes)
            var spikeRatio = maxVal / (rms + 0.001);
            if (spikeRatio < 5) quality += 20;
            else if (spikeRatio < 10) quality += 10;
        } else if (rms >= 200) {
            // Too high = saturated / artifact
            quality = 15;
        } else {
            // Too low = no contact
            quality = 5;
        }

        quality = Math.max(0, Math.min(100, quality));

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

        // Update card
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
            // Remove all quality classes
            nodeEl.classList.remove('good', 'fair', 'poor', 'off');
            nodeEl.classList.add(level);
        }

        // Update quality timeline
        ensureQualitySeries(electrode);
        qualitySeries[electrode].append(new Date().getTime(), quality);
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

                // Compute quality periodically (every 32 samples)
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
        // Emotiv metrics may include contact quality data
        // Format varies by device, attempt to extract quality scores
        for (var timestamp in message) {
            var data = message[timestamp];
            for (var key in data) {
                // Check if key matches known electrode patterns with quality suffix
                for (var i = 0; i < knownElectrodes.length; i++) {
                    var el = knownElectrodes[i];
                    if (key.indexOf(el) !== -1 && (key.indexOf('quality') !== -1 || key.indexOf('contact') !== -1)) {
                        var q = parseFloat(data[key]);
                        if (!isNaN(q)) {
                            // Normalize to 0-100 if needed
                            if (q <= 4) q = q * 25; // Some devices use 0-4 scale
                            qualityState[el] = q;
                            updateElectrodeUI(el, q, qualityState[el + '_snr'] || '—');
                            updateOverallQuality();
                        }
                    }
                }
            }
        }
    });
});
