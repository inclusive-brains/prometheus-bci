'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

// Souscrire au flux de données facial_metrics
io.subscribe('facial_metrics');
io.subscribe('multimodal_attention');
io.subscribe('facial_blendshapes');

document.addEventListener('DOMContentLoaded', function () {
    var chartsMetrics = {};
    var timeSeriesMetrics = {};
    var chartsBlendshapes = {};
    var timeSeriesBlendshapes = {};

    // Créer un élément conteneur pour les graphiques des métriques faciales si ce n'est pas déjà fait
    var containerMetrics = document.getElementById('facialMetricsContainer');
    if (!containerMetrics) {
        containerMetrics = document.createElement('div');
        containerMetrics.id = 'facialMetricsContainer';
        document.body.appendChild(containerMetrics);
    }

    // Créer un élément conteneur pour les graphiques des blendshapes faciaux si ce n'est pas déjà fait
    var containerBlendshapes = document.getElementById('facialBlendshapesContainer');
    if (!containerBlendshapes) {
        containerBlendshapes = document.createElement('div');
        containerBlendshapes.id = 'facialBlendshapesContainer';
        document.body.appendChild(containerBlendshapes);
    }

    io.on('facial_metrics', (message) => {
        var data = message;
        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                // Vérifier si le graphique pour la métrique existe déjà, sinon le créer.
                if (!chartsMetrics[metric]) {
                    // Créer un nouvel élément canvas pour la métrique
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialMetricChart' + metric;
                    canvas.style.width = '50%';
                    canvas.style.height = '50px';
                    containerMetrics.appendChild(canvas);

                    // Initialiser le graphique Smoothie pour la métrique
                    chartsMetrics[metric] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: metric, fontSize: 21, verticalAlign: 'top' }
                    });
                    timeSeriesMetrics[metric] = new TimeSeries();
                    chartsMetrics[metric].streamTo(document.getElementById('facialMetricChart' + metric), 1000);
                    chartsMetrics[metric].addTimeSeries(timeSeriesMetrics[metric], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }

                // Ajouter les données à la série temporelle de la métrique
                if (timeSeriesMetrics[metric]) {
                    timeSeriesMetrics[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    });

    io.on('facial_blendshapes', (message) => {
        var data = message;
        //console.log("Blendshapes", data)
        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                // Vérifier si le graphique pour la métrique existe déjà, sinon le créer.
                if (!chartsBlendshapes[metric]) {
                    // Créer un nouvel élément canvas pour la métrique
                    var canvas = document.createElement('canvas');
                    canvas.id = 'facialBlendshapesChart' + metric;
                    canvas.style.width = '50%';
                    canvas.style.height = '50px';
                    containerBlendshapes.appendChild(canvas);

                    // Initialiser le graphique Smoothie pour la métrique
                    chartsBlendshapes[metric] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: metric, fontSize: 21, verticalAlign: 'top' }
                    });
                    timeSeriesBlendshapes[metric] = new TimeSeries();
                    chartsBlendshapes[metric].streamTo(document.getElementById('facialBlendshapesChart' + metric), 1000);
                    chartsBlendshapes[metric].addTimeSeries(timeSeriesBlendshapes[metric], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }

                // Ajouter les données à la série temporelle de la métrique
                if (timeSeriesBlendshapes[metric]) {
                    timeSeriesBlendshapes[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    });

    io.on('multimodal_attention', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].multimodal_attention; // Assurez-vous que cela correspond à la clé réelle

        // Limiter le pourcentage d'attention à deux décimales
        let attentionPercentage = (attention * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#attention_title span').textContent = `${attentionPercentage}%`;
        let attentionProgressBar = document.querySelector('#attention_progress');
        attentionProgressBar.style.width = `${attentionPercentage}%`;
        attentionProgressBar.setAttribute('aria-valuenow', attentionPercentage);
        attentionProgressBar.textContent = `${attentionPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    var metricsChart = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        timestampFormatter: SmoothieChart.timeFormatter,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        maxValue: 1, // Les métriques sont normalement de 0 à 1
        minValue: 0
    });

    var attentionSeries = new TimeSeries();
    metricsChart.addTimeSeries(attentionSeries, { lineWidth: 2, strokeStyle: '#012030', interpolation: 'bezier' });

    // Diffuser le graphique dans l'élément HTML correspondant
    metricsChart.streamTo(document.getElementById("metricsChart"), 1000);

    // Fonctions pour traiter et afficher les données de chaque métrique dans le graphique
    function processMetric(data, series, metricName) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let metricValue = data[lastKey][metricName];
        if (metricValue !== undefined) { // Vérifiez si la valeur de la métrique est définie
            series.append(new Date().getTime(), metricValue);
        }
    }

    io.on('multimodal_attention', (data) => {
        processMetric(data, attentionSeries, 'multimodal_attention');
    });   
});
