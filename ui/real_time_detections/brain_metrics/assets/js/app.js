'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    updateConnectionStatus('connected');
    document.getElementById('streamStatus').textContent = 'Streaming';
    document.querySelector('.header-badge').classList.add('recording');
});

io.on('disconnect', function () {
    updateConnectionStatus('disconnected');
    document.getElementById('streamStatus').textContent = 'Offline';
    document.querySelector('.header-badge').classList.remove('recording');
});

// Subscribe to data streams
io.subscribe('eeg_filtered');
io.subscribe('eeg_stress_metric');
io.subscribe('eeg_cognitiveload_metric');
io.subscribe('eeg_attention_metric');
io.subscribe('eeg_arousal_metric');
io.subscribe('eeg_bandpower');
io.subscribe('eeg_bandpower_mean');
io.subscribe('eeg_bandpower_mean_fullband');

document.addEventListener('DOMContentLoaded', function () {
    // Dark theme config for Smoothie charts
    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255, 255, 255, 0.04)',
        millisPerLine: 7000,
        borderVisible: false
    };
    var darkLabels = { fillStyle: '#a0a0ab', fontSize: 10 };

    // ---- EEG Filtered Signal Charts ----
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

    io.on('eeg_filtered', (message) => {
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

    // ---- EEG Bandpower Charts ----
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

            bpCharts[metric] = new SmoothieChart({
                millisPerPixel: 10,
                responsive: true,
                grid: darkGrid,
                labels: darkLabels,
                tooltipLine: { strokeStyle: '#8b7db5' },
                title: { text: '', fontSize: 0 }
            });
            bpTimeSeries[metric] = new TimeSeries();
            bpCharts[metric].streamTo(canvas, 1000);
            bpCharts[metric].addTimeSeries(bpTimeSeries[metric], {
                lineWidth: 1.5,
                strokeStyle: '#8b7db5',
                interpolation: 'bezier'
            });
        }
    }

    io.on('eeg_bandpower', (message) => {
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

    // ---- EEG Bandpower Mean — Smoothie Charts ----
    var bpMeanCharts = {};
    var bpMeanTimeSeries = {};

    function createBandpowerMeanChart(container, chartKey) {
        if (!bpMeanCharts[chartKey]) {
            var empty = document.getElementById('emptyStateBandpowerMean');
            if (empty) empty.remove();

            var wrapper = document.createElement('div');
            wrapper.className = 'chart-item';

            var label = document.createElement('span');
            label.className = 'chart-label';
            label.textContent = chartKey;
            wrapper.appendChild(label);

            var canvas = document.createElement('canvas');
            canvas.id = 'bpMeanChart_' + chartKey;
            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            bpMeanCharts[chartKey] = new SmoothieChart({
                millisPerPixel: 10,
                responsive: true,
                grid: darkGrid,
                labels: darkLabels,
                tooltipLine: { strokeStyle: '#c49545' },
                title: { text: '', fontSize: 0 }
            });
            bpMeanTimeSeries[chartKey] = new TimeSeries();
            bpMeanCharts[chartKey].streamTo(canvas, 1000);
            bpMeanCharts[chartKey].addTimeSeries(bpMeanTimeSeries[chartKey], {
                lineWidth: 1.5,
                strokeStyle: '#c49545',
                interpolation: 'bezier'
            });
        }
    }

    function processBandpowerMeanData(message, prefix) {
        var container = document.getElementById('eegBandpowerContainerMean');
        for (var timestamp in message) {
            for (var band in message[timestamp]) {
                var chartKey = prefix + '_' + band;
                createBandpowerMeanChart(container, chartKey);
                if (bpMeanTimeSeries[chartKey]) {
                    bpMeanTimeSeries[chartKey].append(parseInt(timestamp), message[timestamp][band]);
                }
            }
        }
    }

    io.on('eeg_bandpower_mean', (message) => {
        processBandpowerMeanData(message, 'eeg_bandpower_mean');
    });

    io.on('eeg_bandpower_mean_fullband', (message) => {
        processBandpowerMeanData(message, 'eeg_bandpower_mean_fullband');
    });

    // ---- Metric Cards — Update values and progress bars ----
    io.on('eeg_stress_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let stress = data[lastKey].eeg_stress;
        let pct = (stress * 100).toFixed(2);
        document.getElementById('stress_value').innerHTML = pct + '<span class="metric-unit">%</span>';
        document.getElementById('stress_bar').style.width = pct + '%';
    });

    io.on('eeg_cognitiveload_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let cognitiveLoad = data[lastKey].eeg_cognitive_load;
        let pct = (cognitiveLoad * 100).toFixed(2);
        document.getElementById('cognitive_value').innerHTML = pct + '<span class="metric-unit">%</span>';
        document.getElementById('cognitive_bar').style.width = pct + '%';
    });

    io.on('eeg_attention_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].eeg_attention;
        let pct = (attention * 100).toFixed(2);
        document.getElementById('attention_value').innerHTML = pct + '<span class="metric-unit">%</span>';
        document.getElementById('attention_bar').style.width = pct + '%';
    });

    io.on('eeg_arousal_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let arousal = data[lastKey].eeg_arousal;
        let pct = (arousal * 100).toFixed(2);
        document.getElementById('arousal_value').innerHTML = pct + '<span class="metric-unit">%</span>';
        document.getElementById('arousal_bar').style.width = pct + '%';
    });

    // ---- Metrics Time Series — Combined Smoothie Chart ----
    var metricsChart = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        timestampFormatter: SmoothieChart.timeFormatter,
        grid: darkGrid,
        labels: darkLabels,
        maxValue: 1,
        minValue: 0
    });

    var stressSeries = new TimeSeries();
    var cognitiveLoadSeries = new TimeSeries();
    var attentionSeries = new TimeSeries();
    var arousalSeries = new TimeSeries();

    metricsChart.addTimeSeries(stressSeries, { lineWidth: 2, strokeStyle: '#c46060', interpolation: 'bezier' });
    metricsChart.addTimeSeries(cognitiveLoadSeries, { lineWidth: 2, strokeStyle: '#8b7db5', interpolation: 'bezier' });
    metricsChart.addTimeSeries(attentionSeries, { lineWidth: 2, strokeStyle: '#7ab3bd', interpolation: 'bezier' });
    metricsChart.addTimeSeries(arousalSeries, { lineWidth: 2, strokeStyle: '#c49545', interpolation: 'bezier' });

    metricsChart.streamTo(document.getElementById('metricsChart'), 1000);

    function processMetric(data, series, metricName) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let metricValue = data[lastKey][metricName];
        if (metricValue !== undefined) {
            series.append(new Date().getTime(), metricValue);
        }
    }

    io.on('eeg_stress_metric', (data) => {
        processMetric(data, stressSeries, 'eeg_stress');
    });

    io.on('eeg_cognitiveload_metric', (data) => {
        processMetric(data, cognitiveLoadSeries, 'eeg_cognitive_load');
    });

    io.on('eeg_attention_metric', (data) => {
        processMetric(data, attentionSeries, 'eeg_attention');
    });

    io.on('eeg_arousal_metric', (data) => {
        processMetric(data, arousalSeries, 'eeg_arousal');
    });

    // ---- EEG Bandpower Mean — Bar Chart (Chart.js) ----
    var eegFullbandCtx = document.getElementById('eegBandpowerMeanFullbandBarChart').getContext('2d');
    var eegFullbandBarChart;

    function updateEegFullbandBarChart(data) {
        var labels = [];
        var values = [];

        for (var timestamp in data) {
            for (var band in data[timestamp]) {
                labels.push(band);
                values.push(data[timestamp][band]);
            }
        }

        if (eegFullbandBarChart) {
            eegFullbandBarChart.data.labels = labels;
            eegFullbandBarChart.data.datasets[0].data = values;
            eegFullbandBarChart.update();
        } else {
            eegFullbandBarChart = new Chart(eegFullbandCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'EEG Bandpower - Mean Fullband',
                        data: values,
                        backgroundColor: 'rgba(92, 168, 181, 0.3)',
                        borderColor: '#5ca8b5',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#a0a0ab',
                                font: { family: "'JetBrains Mono', monospace", size: 11 }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(39,39,47,0.5)',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#a0a0ab',
                                font: { family: "'JetBrains Mono', monospace", size: 10 }
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(39,39,47,0.5)',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#a0a0ab',
                                font: { family: "'JetBrains Mono', monospace", size: 10 }
                            }
                        }
                    }
                }
            });
        }
    }

    io.on('eeg_bandpower_mean_fullband', (message) => {
        console.log('EEG Bandpower Mean Fullband data received:', message);
        updateEegFullbandBarChart(message);
    });
});
