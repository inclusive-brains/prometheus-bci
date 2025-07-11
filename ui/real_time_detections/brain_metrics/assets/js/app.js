'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

// Souscrire aux flux de données brutes EEG, PPG et EEG Bandpower
io.subscribe('eeg_filtered');
io.subscribe('eeg_stress_metric');
io.subscribe('eeg_cognitiveload_metric');
io.subscribe('eeg_attention_metric');
io.subscribe('eeg_arousal_metric');
io.subscribe('eeg_bandpower');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    // Function to create chart for a metric, blendshape, or bandpower
    function createChart(container, type, metric) {
        if (!charts[metric]) {
            // Créer un nouvel élément canvas pour la métrique
            var canvas = document.createElement('canvas');
            canvas.id = type + 'Chart' + metric;
            canvas.style.width = '50%';
            canvas.style.height = '50px';
            container.appendChild(canvas);

            // Initialiser le graphique Smoothie pour la métrique
            charts[metric] = new SmoothieChart({
                millisPerPixel: 10,
                responsive: true,
                grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                tooltipLine: { strokeStyle: '#000000' },
                title: { fillStyle: '#012030', text: metric, fontSize: 21, verticalAlign: 'top' }
            });
            timeSeries[metric] = new TimeSeries();
            charts[metric].streamTo(document.getElementById(type + 'Chart' + metric), 1000);
            charts[metric].addTimeSeries(timeSeries[metric], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
        }
    }

    // Function to handle data updates for a given type (metric, blendshape, or bandpower)
    function handleDataUpdate(containerId, type, message) {
        var data = message;
        var container = document.getElementById(containerId);
        for (var timestamp in data) {
            for (var metric in data[timestamp]) {
                // Vérifier si le graphique pour la métrique existe déjà, sinon le créer.
                createChart(container, type, metric);

                // Ajouter les données à la série temporelle de la métrique
                if (timeSeries[metric]) {
                    timeSeries[metric].append(parseInt(timestamp), data[timestamp][metric]);
                }
            }
        }
    }

    io.on('eeg_filtered', (message) => {
        handleDataUpdate('eegChartsContainer', 'eeg', message);
    });

    io.on('eeg_bandpower', (message) => {
        handleDataUpdate('eegBandpowerContainer', 'eegBandpower', message);
    });

    io.on('eeg_stress_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let stress = data[lastKey].eeg_stress;

        // Limiter le pourcentage de stress à deux décimales
        let stressPercentage = (stress * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#stress_title span').textContent = `${stressPercentage}%`;
        let stressProgressBar = document.querySelector('#stress_progress');
        stressProgressBar.style.width = `${stressPercentage}%`;
        stressProgressBar.setAttribute('aria-valuenow', stressPercentage);
        stressProgressBar.textContent = `${stressPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    io.on('eeg_cognitiveload_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let cognitiveLoad = data[lastKey].eeg_cognitive_load;

        // Limiter le pourcentage de stress à deux décimales
        let cognitiveLoadPercentage = (cognitiveLoad * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#cognitive_load_title span').textContent = `${cognitiveLoadPercentage}%`;
        let cognitiveLoadProgressBar = document.querySelector('#cognitive_load_progress');
        cognitiveLoadProgressBar.style.width = `${cognitiveLoadPercentage}%`;
        cognitiveLoadProgressBar.setAttribute('aria-valuenow', cognitiveLoadPercentage);
        cognitiveLoadProgressBar.textContent = `${cognitiveLoadPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    
    io.on('eeg_attention_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].eeg_attention; // Assurez-vous que cela correspond à la clé réelle

        // Limiter le pourcentage d'attention à deux décimales
        let attentionPercentage = (attention * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#attention_title span').textContent = `${attentionPercentage}%`;
        let attentionProgressBar = document.querySelector('#attention_progress');
        attentionProgressBar.style.width = `${attentionPercentage}%`;
        attentionProgressBar.setAttribute('aria-valuenow', attentionPercentage);
        attentionProgressBar.textContent = `${attentionPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    io.on('eeg_arousal_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let arousal = data[lastKey].eeg_arousal; // Assurez-vous que cela correspond à la clé réelle

        // Limiter le pourcentage d'arousal à deux décimales
        let arousalPercentage = (arousal * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#arousal_title span').textContent = `${arousalPercentage}%`;
        let arousalProgressBar = document.querySelector('#arousal_progress');
        arousalProgressBar.style.width = `${arousalPercentage}%`;
        arousalProgressBar.setAttribute('aria-valuenow', arousalPercentage);
        arousalProgressBar.textContent = `${arousalPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
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

    // Créer des séries temporelles pour chaque métrique
    var stressSeries = new TimeSeries();
    var cognitiveLoadSeries = new TimeSeries();
    var attentionSeries = new TimeSeries();
    var arousalSeries = new TimeSeries();

    // Associer les séries temporelles au graphique avec différentes couleurs
    metricsChart.addTimeSeries(stressSeries, { lineWidth: 2, strokeStyle: '#ff6347', interpolation: 'bezier' });
    metricsChart.addTimeSeries(cognitiveLoadSeries, { lineWidth: 2, strokeStyle: '#ffa500', interpolation: 'bezier' });
    metricsChart.addTimeSeries(attentionSeries, { lineWidth: 2, strokeStyle: '#012030', interpolation: 'bezier' });
    metricsChart.addTimeSeries(arousalSeries, { lineWidth: 2, strokeStyle: '#4682b4', interpolation: 'bezier' });

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

    // Écouteurs pour chaque métrique
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

});

// Souscrire uniquement aux flux de données eeg_bandpower_mean et eeg_bandpower_mean_fullband
io.subscribe('eeg_bandpower_mean');
io.subscribe('eeg_bandpower_mean_fullband');

document.addEventListener('DOMContentLoaded', function () {
    var bandpowerCharts = {};
    var bandpowerTimeSeries = {};

    // Conteneur pour les graphiques des EEG bandpower
    var bandpowerContainer = document.getElementById('eegBandpowerContainerMean');

    function processBandpowerData(data, key) {
        for (var timestamp in data) {
            for (var band in data[timestamp]) {
                var value = data[timestamp][band];
                
                var chartKey = key + "_" + band;
                
                if (!bandpowerCharts[chartKey]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'eegBandpowerChart' + chartKey;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    bandpowerContainer.appendChild(canvas);

                    bandpowerCharts[chartKey] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: chartKey, fontSize: 21, verticalAlign: 'top' }
                    });
                    bandpowerTimeSeries[chartKey] = new TimeSeries();
                    bandpowerCharts[chartKey].streamTo(document.getElementById('eegBandpowerChart' + chartKey), 1000);
                    bandpowerCharts[chartKey].addTimeSeries(bandpowerTimeSeries[chartKey], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }
                if (bandpowerTimeSeries[chartKey]) {
                    bandpowerTimeSeries[chartKey].append(parseInt(timestamp), value);
                }
            }
        }
    }

    io.on('eeg_bandpower_mean', (message) => {
        processBandpowerData(message, 'eeg_bandpower_mean');
    });

    io.on('eeg_bandpower_mean_fullband', (message) => {
        processBandpowerData(message, 'eeg_bandpower_mean_fullband');
    });
});

document.addEventListener('DOMContentLoaded', function () {
    var eegFullbandCtx = document.getElementById('eegBandpowerMeanFullbandBarChart').getContext('2d');
    var eegFullbandBarChart;

    function updateEegFullbandBarChart(data) {
        var labels = [];
        var values = [];

        // Extraire les données
        for (var timestamp in data) {
            for (var band in data[timestamp]) {
                labels.push(band);
                values.push(data[timestamp][band]);
            }
        }

        // Si le graphique existe déjà, mettez à jour les données
        if (eegFullbandBarChart) {
            eegFullbandBarChart.data.labels = labels;
            eegFullbandBarChart.data.datasets[0].data = values;
            eegFullbandBarChart.update();
        } else {
            // Sinon, créez un nouveau graphique
            eegFullbandBarChart = new Chart(eegFullbandCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'EEG Bandpower - Mean Fullband',
                        data: values,
                        backgroundColor: 'rgba(153, 102, 255, 0.5)',
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }

    // Écoute des données sur le flux "eeg_bandpower_mean_fullband"
    io.on('eeg_bandpower_mean_fullband', (message) => {
        console.log('EEG Bandpower Mean Fullband data received:', message);  // Debugging
        updateEegFullbandBarChart(message);
    });
});


