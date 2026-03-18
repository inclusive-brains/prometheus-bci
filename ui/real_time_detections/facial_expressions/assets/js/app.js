'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    var dot = document.getElementById('statusDot');
    var text = document.getElementById('statusText');
    if (dot) dot.classList.add('connected');
    if (text) text.textContent = 'Connected';
});

// Subscribe to facial data streams
io.subscribe('facial_metrics');
io.subscribe('facial_blendshapes');
io.subscribe('facial_emotions');

document.addEventListener('DOMContentLoaded', function () {
    var metricsCharts = {};
    var metricsTimeSeries = {};
    var blendshapesCharts = {};
    var blendshapesTimeSeries = {};
    var emotionsCharts = {};
    var emotionsTimeSeries = {};

    var metricsContainer = document.getElementById('facialMetricsContainer');
    var blendshapesContainer = document.getElementById('facialBlendshapesContainer');
    var emotionsContainer = document.getElementById('facialEmotionsContainer');

    var metricsEmptyState = document.getElementById('metricsEmptyState');
    var blendshapesEmptyState = document.getElementById('blendshapesEmptyState');
    var emotionsEmptyState = document.getElementById('emotionsEmptyState');

    // Dark Smoothie chart options
    var darkChartOptions = {
        millisPerPixel: 10,
        responsive: true,
        grid: {
            fillStyle: 'rgba(15, 15, 18, 0.6)',
            strokeStyle: 'rgba(255, 255, 255, 0.04)',
            borderVisible: false,
            millisPerLine: 7000
        },
        labels: {
            fillStyle: '#63636e',
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace'
        },
        tooltipLine: { strokeStyle: '#7ab3bd' },
        title: {
            fillStyle: '#5ca8b5',
            text: '',
            fontSize: 0,
            verticalAlign: 'top'
        }
    };

    var darkLineStyle = {
        lineWidth: 1.5,
        strokeStyle: '#7ab3bd',
        interpolation: 'bezier'
    };

    function processMetricsData(data) {
        // Hide empty state on first data
        if (metricsEmptyState) {
            metricsEmptyState.style.display = 'none';
            metricsEmptyState = null;
        }

        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                if (!metricsCharts[metric]) {
                    var chartItem = document.createElement('div');
                    chartItem.className = 'chart-item';

                    var label = document.createElement('span');
                    label.className = 'chart-label';
                    label.textContent = metric;

                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialMetricChart' + metric;

                    chartItem.appendChild(label);
                    chartItem.appendChild(canvas);
                    metricsContainer.appendChild(chartItem);

                    metricsCharts[metric] = new SmoothieChart(Object.assign({}, darkChartOptions));
                    metricsTimeSeries[metric] = new TimeSeries();
                    metricsCharts[metric].streamTo(document.getElementById('facialMetricChart' + metric), 1000);
                    metricsCharts[metric].addTimeSeries(metricsTimeSeries[metric], Object.assign({}, darkLineStyle));
                }
                if (metricsTimeSeries[metric]) {
                    metricsTimeSeries[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    }

    function processBlendshapesData(data) {
        if (blendshapesEmptyState) {
            blendshapesEmptyState.style.display = 'none';
            blendshapesEmptyState = null;
        }

        for (var timestamp in data) {
            for (var blendshape in data[timestamp]) {
                if (!blendshapesCharts[blendshape]) {
                    var chartItem = document.createElement('div');
                    chartItem.className = 'chart-item';
                    chartItem.style.display = 'inline-block';
                    chartItem.style.width = '50%';

                    var label = document.createElement('span');
                    label.className = 'chart-label';
                    label.textContent = blendshape;

                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialBlendshapeChart' + blendshape;
                    canvas.style.height = '50px';

                    chartItem.appendChild(label);
                    chartItem.appendChild(canvas);
                    blendshapesContainer.appendChild(chartItem);

                    var blendOpts = Object.assign({}, darkChartOptions);
                    blendOpts.grid = Object.assign({}, darkChartOptions.grid, { millisPerLine: 7000 });

                    blendshapesCharts[blendshape] = new SmoothieChart(blendOpts);
                    blendshapesTimeSeries[blendshape] = new TimeSeries();
                    blendshapesCharts[blendshape].streamTo(document.getElementById('facialBlendshapeChart' + blendshape), 1000);
                    blendshapesCharts[blendshape].addTimeSeries(blendshapesTimeSeries[blendshape], Object.assign({}, darkLineStyle, { strokeStyle: '#8b7db5' }));
                }
                if (blendshapesTimeSeries[blendshape]) {
                    blendshapesTimeSeries[blendshape].append(parseInt(timestamp), data[timestamp][blendshape]);
                }
            }
        }
    }

    function processEmotionsData(data) {
        if (emotionsEmptyState) {
            emotionsEmptyState.style.display = 'none';
            emotionsEmptyState = null;
        }

        for (var timestamp in data) {
            for (var emotion in data[timestamp]) {
                if (!emotionsCharts[emotion]) {
                    var chartItem = document.createElement('div');
                    chartItem.className = 'chart-item';

                    var label = document.createElement('span');
                    label.className = 'chart-label';
                    label.textContent = emotion;

                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialEmotionChart' + emotion;

                    chartItem.appendChild(label);
                    chartItem.appendChild(canvas);
                    emotionsContainer.appendChild(chartItem);

                    var emotionOpts = Object.assign({}, darkChartOptions);
                    emotionOpts.grid = Object.assign({}, darkChartOptions.grid, { millisPerLine: 1000 });

                    emotionsCharts[emotion] = new SmoothieChart(emotionOpts);
                    emotionsTimeSeries[emotion] = new TimeSeries();
                    emotionsCharts[emotion].streamTo(document.getElementById('facialEmotionChart' + emotion), 1000);
                    emotionsCharts[emotion].addTimeSeries(emotionsTimeSeries[emotion], Object.assign({}, darkLineStyle, { strokeStyle: '#c49545' }));
                }
                if (emotionsTimeSeries[emotion]) {
                    emotionsTimeSeries[emotion].append(parseInt(timestamp), data[timestamp][emotion]);
                }
            }
        }
    }

    io.on('facial_metrics', (message) => {
        processMetricsData(message);
    });

    io.on('facial_blendshapes', (message) => {
        processBlendshapesData(message);
    });

    io.on('facial_emotions', (message) => {
        processEmotionsData(message);
    });
});
