"use strict";

let io = new IO();

// Connection status
io.on('connect', function () {
    updateConnectionStatus('connected');
});

io.on('disconnect', function () {
    updateConnectionStatus('disconnected');
});

io.subscribe('eeg_raw');

document.addEventListener('DOMContentLoaded', function () {
    // Pipeline visualization
    PipelineViz.render('pipelineViz');
    PipelineViz.bindToIO(io);

    // Dark theme config for Smoothie charts (same as brain_metrics)
    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255, 255, 255, 0.04)',
        millisPerLine: 7000,
        borderVisible: false
    };
    var darkLabels = { fillStyle: '#a0a0ab', fontSize: 10 };

    // ---- EEG Raw Signal Charts ----
    var eegCharts = {};
    var eegTimeSeries = {};

    function createEegChart(container, metric) {
        if (!eegCharts[metric]) {
            // Remove empty state if present
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

            eegCharts[metric] = new SmoothieChart({
                millisPerPixel: 10,
                responsive: true,
                grid: darkGrid,
                labels: darkLabels,
                tooltipLine: { strokeStyle: '#7ab3bd' },
                title: { text: '', fontSize: 0 }
            });
            eegTimeSeries[metric] = new TimeSeries();
            eegCharts[metric].streamTo(canvas, 1000);
            eegCharts[metric].addTimeSeries(eegTimeSeries[metric], {
                lineWidth: 1.5,
                strokeStyle: '#7ab3bd',
                interpolation: 'bezier'
            });
        }
    }

    io.on('eeg_raw', function (message) {
        var container = document.getElementById('eegChartsContainer');
        for (var timestamp in message) {
            for (var metric in message[timestamp]) {
                createEegChart(container, metric);
                if (eegTimeSeries[metric]) {
                    eegTimeSeries[metric].append(parseInt(timestamp), message[timestamp][metric]);
                }
            }
        }
    });

    // Controls
    var startBtn = document.getElementById('startButton');
    var stopBtn = document.getElementById('stopButton');
    var markBtn = document.getElementById('markButton');
    var badge = document.querySelector('.header-badge');
    var statusLabel = document.getElementById('recordingStatus');

    startBtn.addEventListener('click', function () {
        io.event('start');
        startBtn.classList.add('active');
        badge.classList.add('recording');
        statusLabel.textContent = 'Recording';
    });

    stopBtn.addEventListener('click', function () {
        io.event('stop');
        startBtn.classList.remove('active');
        badge.classList.remove('recording');
        statusLabel.textContent = 'Idle';
    });

    markBtn.addEventListener('click', function () {
        io.event('marker');
        markBtn.style.transform = 'scale(0.95)';
        setTimeout(function () { markBtn.style.transform = ''; }, 150);
    });
});
