'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

// Souscrire aux flux de données facial_metrics, facial_blendshapes, et facial_emotions
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

    // Conteneurs pour les graphiques des métriques faciales, blendshapes, et émotions
    var metricsContainer = document.getElementById('facialMetricsContainer');
    var blendshapesContainer = document.getElementById('facialBlendshapesContainer');
    var emotionsContainer = document.getElementById('facialEmotionsContainer');

    function processMetricsData(data) {
        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                if (!metricsCharts[metric]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialMetricChart' + metric;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    metricsContainer.appendChild(canvas);

                    metricsCharts[metric] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: metric, fontSize: 21, verticalAlign: 'top' }
                    });
                    metricsTimeSeries[metric] = new TimeSeries();
                    metricsCharts[metric].streamTo(document.getElementById('facialMetricChart' + metric), 1000);
                    metricsCharts[metric].addTimeSeries(metricsTimeSeries[metric], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }
                if (metricsTimeSeries[metric]) {
                    metricsTimeSeries[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    }

    function processBlendshapesData(data) {
        for (var timestamp in data) {
            for (var blendshape in data[timestamp]) {
                if (!blendshapesCharts[blendshape]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialBlendshapeChart' + blendshape;
                    canvas.style.width = '50%';
                    canvas.style.height = '50px';
                    blendshapesContainer.appendChild(canvas);

                    blendshapesCharts[blendshape] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: blendshape, fontSize: 21, verticalAlign: 'top' }
                    });
                    blendshapesTimeSeries[blendshape] = new TimeSeries();
                    blendshapesCharts[blendshape].streamTo(document.getElementById('facialBlendshapeChart' + blendshape), 1000);
                    blendshapesCharts[blendshape].addTimeSeries(blendshapesTimeSeries[blendshape], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }
                if (blendshapesTimeSeries[blendshape]) {
                    blendshapesTimeSeries[blendshape].append(parseInt(timestamp), data[timestamp][blendshape]);
                }
            }
        }
    }

    function processEmotionsData(data) {
        for (var timestamp in data) {
            for (var emotion in data[timestamp]) {
                if (!emotionsCharts[emotion]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialEmotionChart' + emotion;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    emotionsContainer.appendChild(canvas);

                    emotionsCharts[emotion] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 1000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: emotion, fontSize: 21, verticalAlign: 'top' }
                    });
                    emotionsTimeSeries[emotion] = new TimeSeries();
                    emotionsCharts[emotion].streamTo(document.getElementById('facialEmotionChart' + emotion), 1000);
                    emotionsCharts[emotion].addTimeSeries(emotionsTimeSeries[emotion], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
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
        console.log('Emotions data received:', message);  // Debugging
        processEmotionsData(message);
    });
});
