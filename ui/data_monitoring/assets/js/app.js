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

    // ──────────────────────────────────────────
    //  1. SMOOTHIE (existing)
    // ──────────────────────────────────────────
    const charts = {};
    const timeSeries = {};
    const container = document.getElementById('eegChartsContainer');
    const emptyState = document.getElementById('emptyState');

    // ──────────────────────────────────────────
    //  2. CHART.JS STREAMING
    // ──────────────────────────────────────────
    // ChartStreaming auto-registers via Chart.register(M) in its UMD build
    // but we ensure it's registered in case of load-order edge cases
    if (typeof ChartStreaming !== 'undefined') {
        Chart.register(...ChartStreaming);
    }
    const cjsCharts = {};
    const cjsContainer = document.getElementById('chartjsContainer');
    const cjsEmpty = document.getElementById('chartjsEmpty');

    const CJS_COLORS = [
        '#22d3ee', '#a78bfa', '#34d399', '#fb923c',
        '#f472b6', '#facc15', '#60a5fa', '#e879f9',
    ];
    let cjsColorIdx = 0;

    function createChartJS(sensor) {
        if (cjsEmpty) cjsEmpty.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-item';

        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = sensor;
        wrapper.appendChild(label);

        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        cjsContainer.appendChild(wrapper);

        const color = CJS_COLORS[cjsColorIdx++ % CJS_COLORS.length];

        cjsCharts[sensor] = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [{
                    label: sensor,
                    borderColor: color,
                    backgroundColor: color + '18',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.35,
                    data: [],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    streaming: {
                        duration: 10000,
                        delay: 500,
                        frameRate: 30,
                    },
                },
                scales: {
                    x: {
                        type: 'realtime',
                        realtime: {
                            duration: 10000,
                            delay: 500,
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.04)',
                        },
                        ticks: { display: false },
                    },
                    y: {
                        grid: {
                            color: 'rgba(255,255,255,0.04)',
                        },
                        ticks: {
                            color: 'rgba(255,255,255,0.3)',
                            font: { family: 'JetBrains Mono', size: 9 },
                        },
                    },
                },
            },
        });
    }

    // ──────────────────────────────────────────
    //  3. UPLOT
    // ──────────────────────────────────────────
    const uplotInstances = {};
    const uplotData = {};           // { sensor: { timestamps: [], values: [] } }
    const uplotContainer = document.getElementById('uplotContainer');
    const uplotEmpty = document.getElementById('uplotEmpty');
    const UPLOT_WINDOW = 10;        // seconds visible
    const UPLOT_MAX_PTS = 2500;     // max points kept in buffer

    const UPLOT_COLORS = [
        '#22d3ee', '#a78bfa', '#34d399', '#fb923c',
        '#f472b6', '#facc15', '#60a5fa', '#e879f9',
    ];
    let uplotColorIdx = 0;

    function createUPlot(sensor) {
        if (uplotEmpty) uplotEmpty.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-item';

        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = sensor;
        wrapper.appendChild(label);

        const target = document.createElement('div');
        wrapper.appendChild(target);
        uplotContainer.appendChild(wrapper);

        const color = UPLOT_COLORS[uplotColorIdx++ % UPLOT_COLORS.length];

        const now = Date.now() / 1000;
        uplotData[sensor] = { timestamps: [now], values: [0] };

        const opts = {
            width: uplotContainer.clientWidth - 32,
            height: 120,
            cursor: { show: false },
            legend: { show: false },
            axes: [
                {
                    stroke: 'rgba(255,255,255,0.3)',
                    grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
                    ticks: { show: false },
                    values: '',
                },
                {
                    stroke: 'rgba(255,255,255,0.3)',
                    grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
                    ticks: { size: 0 },
                    font: '9px JetBrains Mono',
                    size: 45,
                },
            ],
            series: [
                {},
                {
                    label: sensor,
                    stroke: color,
                    width: 1.5,
                    fill: color + '18',
                },
            ],
        };

        uplotInstances[sensor] = new uPlot(opts, [
            uplotData[sensor].timestamps,
            uplotData[sensor].values,
        ], target);

        // Resize on container resize
        const ro = new ResizeObserver(() => {
            const w = uplotContainer.clientWidth - 32;
            if (w > 0 && uplotInstances[sensor]) {
                uplotInstances[sensor].setSize({ width: w, height: 120 });
            }
        });
        ro.observe(uplotContainer);
    }

    // Throttled uPlot redraw (60fps max)
    let uplotRAF = null;
    function scheduleUPlotRedraw() {
        if (uplotRAF) return;
        uplotRAF = requestAnimationFrame(() => {
            uplotRAF = null;
            const now = Date.now() / 1000;
            for (const sensor in uplotInstances) {
                const d = uplotData[sensor];
                uplotInstances[sensor].setData([d.timestamps, d.values]);
                uplotInstances[sensor].setScale('x', {
                    min: now - UPLOT_WINDOW,
                    max: now,
                });
            }
        });
    }

    // ──────────────────────────────────────────
    //  DATA HANDLER — feeds all three renderers
    // ──────────────────────────────────────────
    io.on('eeg_raw', (data) => {
        // Hide empty state on first data
        if (emptyState && emptyState.parentNode) {
            emptyState.style.display = 'none';
        }

        for (const timestamp in data) {
            const tsMs = parseInt(timestamp);
            const tsSec = tsMs / 1000;

            for (const sensor in data[timestamp]) {
                const value = data[timestamp][sensor];

                // ---- Smoothie ----
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
                timeSeries[sensor].append(tsMs, value);

                // ---- Chart.js ----
                if (!cjsCharts[sensor]) {
                    createChartJS(sensor);
                }
                cjsCharts[sensor].data.datasets[0].data.push({
                    x: tsMs,
                    y: value,
                });

                // ---- uPlot ----
                if (!uplotInstances[sensor]) {
                    createUPlot(sensor);
                }
                const d = uplotData[sensor];
                d.timestamps.push(tsSec);
                d.values.push(value);
                // Trim buffer
                if (d.timestamps.length > UPLOT_MAX_PTS) {
                    const excess = d.timestamps.length - UPLOT_MAX_PTS;
                    d.timestamps.splice(0, excess);
                    d.values.splice(0, excess);
                }
            }
        }

        scheduleUPlotRedraw();
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
