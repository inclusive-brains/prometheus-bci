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

// Subscribe to all metric sources
io.subscribe('multimodal_stress');
io.subscribe('multimodal_cognitive_load');
io.subscribe('multimodal_attention');
io.subscribe('multimodal_arousal');
io.subscribe('eeg_stress_metric');
io.subscribe('eeg_cognitiveload_metric');
io.subscribe('eeg_attention_metric');
io.subscribe('eeg_arousal_metric');
io.subscribe('ppg_stress_metric');
io.subscribe('ppg_cognitive_load_metric');
io.subscribe('ppg_attention_metric');
io.subscribe('ppg_arousal_metric');
io.subscribe('facial_metrics');

document.addEventListener('DOMContentLoaded', function () {

    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255, 255, 255, 0.04)',
        millisPerLine: 7000,
        borderVisible: false
    };
    var darkLabels = { fillStyle: '#a0a0ab', fontSize: 10 };

    function makeChart(canvasId) {
        var chart = new SmoothieChart({
            millisPerPixel: 50,
            responsive: true,
            timestampFormatter: SmoothieChart.timeFormatter,
            grid: darkGrid,
            labels: darkLabels,
            maxValue: 1,
            minValue: 0
        });
        chart.streamTo(document.getElementById(canvasId), 1000);
        return chart;
    }

    function addSeries(chart) {
        var stress = new TimeSeries();
        var cognitive = new TimeSeries();
        var attention = new TimeSeries();
        var arousal = new TimeSeries();
        chart.addTimeSeries(stress, { lineWidth: 2, strokeStyle: '#c46060', interpolation: 'bezier' });
        chart.addTimeSeries(cognitive, { lineWidth: 2, strokeStyle: '#8b7db5', interpolation: 'bezier' });
        chart.addTimeSeries(attention, { lineWidth: 2, strokeStyle: '#7ab3bd', interpolation: 'bezier' });
        chart.addTimeSeries(arousal, { lineWidth: 2, strokeStyle: '#c49545', interpolation: 'bezier' });
        return { stress: stress, cognitive: cognitive, attention: attention, arousal: arousal };
    }

    // Multimodal chart
    var multiChart = makeChart('metricsChart');
    var multiSeries = addSeries(multiChart);

    // EEG chart
    var eegChart = makeChart('eegMetricsChart');
    var eegSeries = addSeries(eegChart);

    // PPG chart
    var ppgChart = makeChart('ppgMetricsChart');
    var ppgSeries = addSeries(ppgChart);

    // Facial chart
    var facialChart = makeChart('facialMetricsChart');
    var facialSeries = addSeries(facialChart);

    function updateCard(valueId, barId, value) {
        var pct = (value * 100).toFixed(2);
        document.getElementById(valueId).innerHTML = pct + '<span class="metric-unit">%</span>';
        document.getElementById(barId).style.width = pct + '%';
    }

    function appendToSeries(series, metricKey, data) {
        var keys = Object.keys(data);
        var lastKey = keys[keys.length - 1];
        var val = data[lastKey][metricKey];
        if (val !== undefined) {
            series.append(new Date().getTime(), val);
        }
    }

    // ── Multimodal (cards + chart) ──
    io.on('multimodal_stress', function (data) {
        var keys = Object.keys(data);
        var val = data[keys[keys.length - 1]].multimodal_stress;
        updateCard('stress_value', 'stress_bar', val);
        appendToSeries(multiSeries.stress, 'multimodal_stress', data);
    });

    io.on('multimodal_cognitive_load', function (data) {
        var keys = Object.keys(data);
        var val = data[keys[keys.length - 1]].multimodal_cognitive_load;
        updateCard('cognitive_value', 'cognitive_bar', val);
        appendToSeries(multiSeries.cognitive, 'multimodal_cognitive_load', data);
    });

    io.on('multimodal_attention', function (data) {
        var keys = Object.keys(data);
        var val = data[keys[keys.length - 1]].multimodal_attention;
        updateCard('attention_value', 'attention_bar', val);
        appendToSeries(multiSeries.attention, 'multimodal_attention', data);
    });

    io.on('multimodal_arousal', function (data) {
        var keys = Object.keys(data);
        var val = data[keys[keys.length - 1]].multimodal_arousal;
        updateCard('arousal_value', 'arousal_bar', val);
        appendToSeries(multiSeries.arousal, 'multimodal_arousal', data);
    });

    // ── EEG chart ──
    io.on('eeg_stress_metric', function (data) {
        appendToSeries(eegSeries.stress, 'eeg_stress', data);
    });
    io.on('eeg_cognitiveload_metric', function (data) {
        appendToSeries(eegSeries.cognitive, 'eeg_cognitive_load', data);
    });
    io.on('eeg_attention_metric', function (data) {
        appendToSeries(eegSeries.attention, 'eeg_attention', data);
    });
    io.on('eeg_arousal_metric', function (data) {
        appendToSeries(eegSeries.arousal, 'eeg_arousal', data);
    });

    // ── PPG chart ──
    io.on('ppg_stress_metric', function (data) {
        appendToSeries(ppgSeries.stress, 'PPG_Stress_Metric', data);
    });
    io.on('ppg_cognitive_load_metric', function (data) {
        appendToSeries(ppgSeries.cognitive, 'PPG_Cognitive_Load_Metric', data);
    });
    io.on('ppg_attention_metric', function (data) {
        appendToSeries(ppgSeries.attention, 'PPG_Attention_Metric', data);
    });
    io.on('ppg_arousal_metric', function (data) {
        appendToSeries(ppgSeries.arousal, 'PPG_Arousal_Metric', data);
    });

    // ── Facial chart ──
    io.on('facial_metrics', function (data) {
        var keys = Object.keys(data);
        if (keys.length === 0) return;
        var lastKey = keys[keys.length - 1];
        var row = data[lastKey];
        var t = new Date().getTime();
        if (row.stress !== undefined) facialSeries.stress.append(t, row.stress);
        if (row.attention !== undefined) facialSeries.attention.append(t, row.attention);
        if (row.vigilance !== undefined) facialSeries.arousal.append(t, row.vigilance);
    });
});
