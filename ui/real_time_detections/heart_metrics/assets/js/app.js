'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

io.subscribe('ppg_filtered');
io.subscribe('ppg_stress_metric');
io.subscribe('ppg_cognitive_load_metric');
io.subscribe('ppg_attention_metric');
io.subscribe('ppg_arousal_metric');
io.subscribe('hr_data');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    var hrChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        tooltipLine: { strokeStyle: '#000000' },
        title: { fillStyle: '#8a2be2', text: 'heart_rate_bpm', fontSize: 21, verticalAlign: 'top' }
    });
    var hrTimeSeries = new TimeSeries();
    hrChart.streamTo(document.getElementById("HRChart"), 1000);
    hrChart.addTimeSeries(hrTimeSeries, { lineWidth: 2, strokeStyle: '#8a2be2', interpolation: 'bezier' });

    // Créer un graphique et une série temporelle pour la PPG
    var ppgChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        tooltipLine: { strokeStyle: '#000000' },
        timestampFormatter: SmoothieChart.timeFormatter,
        title: { fillStyle: '#ff6347', text: 'PPG_0', fontSize: 21, verticalAlign: 'top' }
    });
    var ppgTimeSeries = new TimeSeries();
    ppgChart.streamTo(document.getElementById("ppgChart"), 1000);
    ppgChart.addTimeSeries(ppgTimeSeries, { lineWidth: 2, strokeStyle: '#ff6347', interpolation: 'bezier' });

    // Traiter les données PPG filtrées pour le graphique
    io.on('ppg_filtered', (message) => {
        var data = message;
        for (var timestamp in data) {
            if (ppgTimeSeries) {
                ppgTimeSeries.append(parseInt(timestamp), data[timestamp]['0']);
            }
        }
    });

    io.on('ppg_stress_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let stress = data[lastKey].PPG_Stress_Metric;

        // Limiter le pourcentage de stress à deux décimales
        let stressPercentage = (stress * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#stress_title span').textContent = `${stressPercentage}%`;
        let stressProgressBar = document.querySelector('#stress_progress');
        stressProgressBar.style.width = `${stressPercentage}%`;
        stressProgressBar.setAttribute('aria-valuenow', stressPercentage);
        stressProgressBar.textContent = `${stressPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    io.on('ppg_cognitive_load_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let cognitiveLoad = data[lastKey].PPG_Cognitive_Load_Metric; // Assurez-vous que cela correspond à la clé réelle

        // Limiter le pourcentage de charge cognitive à deux décimales
        let cognitiveLoadPercentage = (cognitiveLoad * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#cognitive_load_title span').textContent = `${cognitiveLoadPercentage}%`;
        let cognitiveLoadProgressBar = document.querySelector('#cognitive_load_progress');
        cognitiveLoadProgressBar.style.width = `${cognitiveLoadPercentage}%`;
        cognitiveLoadProgressBar.setAttribute('aria-valuenow', cognitiveLoadPercentage);
        cognitiveLoadProgressBar.textContent = `${cognitiveLoadPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    io.on('ppg_attention_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].PPG_Attention_Metric; // Assurez-vous que cela correspond à la clé réelle

        // Limiter le pourcentage d'attention à deux décimales
        let attentionPercentage = (attention * 100).toFixed(2); // Convertir en pourcentage et formater
        document.querySelector('#attention_title span').textContent = `${attentionPercentage}%`;
        let attentionProgressBar = document.querySelector('#attention_progress');
        attentionProgressBar.style.width = `${attentionPercentage}%`;
        attentionProgressBar.setAttribute('aria-valuenow', attentionPercentage);
        attentionProgressBar.textContent = `${attentionPercentage}%`; // Mise à jour du texte pour les lecteurs d'écran
    });

    io.on('ppg_arousal_metric', (data) => {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let arousal = data[lastKey].PPG_Arousal_Metric; // Assurez-vous que cela correspond à la clé réelle

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
    io.on('ppg_stress_metric', (data) => {
        processMetric(data, stressSeries, 'PPG_Stress_Metric');
    });

    io.on('ppg_cognitive_load_metric', (data) => {
        processMetric(data, cognitiveLoadSeries, 'PPG_Cognitive_Load_Metric');
    });

    io.on('ppg_attention_metric', (data) => {
        processMetric(data, attentionSeries, 'PPG_Attention_Metric');
    });

    io.on('ppg_arousal_metric', (data) => {
        processMetric(data, arousalSeries, 'PPG_Arousal_Metric');
    });

 // Écouter les données du flux "hr_data" et mettre à jour le graphique et l'affichage
    io.on('hr_data', (message) => {
        var data = message;
        for (var timestamp in data) {
            var heartRate = data[timestamp]['0']; // Supposant que '0' contient la valeur du rythme cardiaque
            if (hrTimeSeries) {
                hrTimeSeries.append(parseInt(timestamp), heartRate);
            }
            // Mettre à jour la valeur affichée du rythme cardiaque
            document.getElementById('heart_rate_value').textContent = heartRate;
        }
    });

});

io.subscribe('hrv_data');

document.addEventListener('DOMContentLoaded', function () {
    var hrv_dataCharts = {};
    var hrv_dataTimeSeries = {};

    // Conteneur pour les graphiques des EEG bandpower
    var hrv_data_Container = document.getElementById('hrv_data_Container');

    function processhrv_data(data, key) {
        for (var timestamp in data) {
            for (var band in data[timestamp]) {
                var value = data[timestamp][band];
                
                var chartKey = key + "_" + band;
                
                if (!hrv_dataCharts[chartKey]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'hrv_dataCharts' + chartKey;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    hrv_data_Container.appendChild(canvas);

                    hrv_dataCharts[chartKey] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: chartKey, fontSize: 21, verticalAlign: 'top' }
                    });
                    hrv_dataTimeSeries[chartKey] = new TimeSeries();
                    hrv_dataCharts[chartKey].streamTo(document.getElementById('hrv_dataCharts' + chartKey), 1000);
                    hrv_dataCharts[chartKey].addTimeSeries(hrv_dataTimeSeries[chartKey], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }
                if (hrv_dataTimeSeries[chartKey]) {
                    hrv_dataTimeSeries[chartKey].append(parseInt(timestamp), value);
                }
            }
        }
    }

    io.on('hrv_data', (message) => {
        console.log('hrv_data received:', message);  // Debugging
        processhrv_data(message, 'hrv_data');
    });
});