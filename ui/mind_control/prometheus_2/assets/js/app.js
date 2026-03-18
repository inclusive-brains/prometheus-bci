'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    updateConnectionStatus('connected');
});

// Subscribe to data streams
io.subscribe('facial_metrics');
io.subscribe('multimodal_attention');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    // Dark theme chart options
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
            fillStyle: 'rgba(160,160,171,0.7)'
        },
        tooltipLine: {
            strokeStyle: '#7ab3bd'
        }
    };

    var container = document.getElementById('facialMetricsContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'facialMetricsContainer';
        document.body.appendChild(container);
    }

    io.on('facial_metrics', (message) => {
        var data = message;
        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                if (!charts[metric]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialMetricChart' + metric;
                    canvas.style.width = '100%';
                    canvas.style.height = '50px';
                    container.appendChild(canvas);

                    charts[metric] = new SmoothieChart(Object.assign({}, darkChartOptions, {
                        title: { fillStyle: '#5ca8b5', text: metric, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", verticalAlign: 'top' }
                    }));
                    timeSeries[metric] = new TimeSeries();
                    charts[metric].streamTo(document.getElementById('facialMetricChart' + metric), 1000);
                    charts[metric].addTimeSeries(timeSeries[metric], {
                        lineWidth: 1.5,
                        strokeStyle: '#7ab3bd',
                        fillStyle: 'rgba(92,168,181,0.05)',
                        interpolation: 'bezier'
                    });
                }

                if (timeSeries[metric]) {
                    timeSeries[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    });

    io.on('multimodal_attention', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].multimodal_attention;

        let attentionPercentage = (attention * 100).toFixed(2);

        // Update attention bar
        var titleEl = document.getElementById('attention_title');
        if (titleEl) titleEl.textContent = 'Attention';

        var valueEl = document.getElementById('attention_value');
        if (valueEl) valueEl.textContent = attentionPercentage + '%';

        var progressEl = document.getElementById('attention_progress');
        if (progressEl) progressEl.style.width = attentionPercentage + '%';
    });

    var metricsChart = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        timestampFormatter: SmoothieChart.timeFormatter,
        grid: {
            fillStyle: 'rgba(15, 15, 18, 0.6)',
            strokeStyle: 'rgba(255, 255, 255, 0.04)',
            borderVisible: false,
            millisPerLine: 7000
        },
        labels: {
            fillStyle: 'rgba(160,160,171,0.7)'
        },
        maxValue: 1,
        minValue: 0
    });

    var attentionSeries = new TimeSeries();
    metricsChart.addTimeSeries(attentionSeries, {
        lineWidth: 2,
        strokeStyle: '#7ab3bd',
        fillStyle: 'rgba(92,168,181,0.08)',
        interpolation: 'bezier'
    });

    var metricsChartEl = document.getElementById("metricsChart");
    if (metricsChartEl) {
        metricsChart.streamTo(metricsChartEl, 1000);
    }

    function processMetric(data, series, metricName) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let metricValue = data[lastKey][metricName];
        if (metricValue !== undefined) {
            series.append(new Date().getTime(), metricValue);
        }
    }

    io.on('multimodal_attention', (data) => {
        processMetric(data, attentionSeries, 'multimodal_attention');

        // Drive the 3D robot arm from BCI attention data
        var robot = window.robotViewer && window.robotViewer.get();
        if (robot) {
            var keys = Object.keys(data);
            var lastKey = keys[keys.length - 1];
            var attention = data[lastKey].multimodal_attention;
            var attThreshold = parseFloat(document.getElementById('attentionThresholdInput')?.value || 0.75);
            var vigThreshold = parseFloat(document.getElementById('vigilanceThresholdInput')?.value || 0.2);

            if (attention >= attThreshold) {
                robot.moveUp();
            } else if (attention <= vigThreshold) {
                robot.moveDown();
            } else {
                robot.stop();
            }
        }
    });
});
