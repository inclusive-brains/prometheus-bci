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
    const charts = {};
    const timeSeries = {};
    const container = document.getElementById('eegChartsContainer');
    const emptyState = document.getElementById('emptyState');

    io.on('eeg_raw', (data) => {
        // Hide empty state on first data
        if (emptyState && emptyState.parentNode) {
            emptyState.style.display = 'none';
        }

        for (const timestamp in data) {
            for (const sensor in data[timestamp]) {
                if (!charts[sensor]) {
                    // Create chart wrapper
                    const wrapper = document.createElement('div');
                    wrapper.className = 'chart-item';

                    const label = document.createElement('span');
                    label.className = 'chart-label';
                    label.textContent = sensor;
                    wrapper.appendChild(label);

                    const canvas = document.createElement('canvas');
                    canvas.id = 'eegChart_' + sensor;
                    wrapper.appendChild(canvas);

                    container.appendChild(wrapper);

                    // Dark themed Smoothie chart
                    charts[sensor] = new SmoothieChart({
                        millisPerPixel: 8,
                        responsive: true,
                        interpolation: 'bezier',
                        grid: {
                            fillStyle: 'rgba(15, 15, 18, 0.6)',
                            strokeStyle: 'rgba(255, 255, 255, 0.03)',
                            borderVisible: false,
                            millisPerLine: 5000,
                            verticalSections: 3,
                        },
                        labels: {
                            disabled: true,
                        },
                        tooltip: false,
                        minValueScale: 1.05,
                        maxValueScale: 1.05,
                    });

                    timeSeries[sensor] = new TimeSeries();
                    charts[sensor].streamTo(canvas, 1000);
                    charts[sensor].addTimeSeries(timeSeries[sensor], {
                        lineWidth: 1,
                        strokeStyle: '#7ab3bd',
                        interpolation: 'bezier',
                    });
                }

                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]);
                }
            }
        }
    });

    // Controls
    const startBtn = document.getElementById('startButton');
    const stopBtn = document.getElementById('stopButton');
    const markBtn = document.getElementById('markButton');
    const badge = document.querySelector('.header-badge');
    const statusLabel = document.getElementById('recordingStatus');

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
        setTimeout(() => { markBtn.style.transform = ''; }, 150);
    });
});
