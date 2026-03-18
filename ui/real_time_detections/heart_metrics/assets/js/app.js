'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    updateConnectionStatus('connected');
});

io.subscribe('ppg_filtered');
io.subscribe('ppg_stress_metric');
io.subscribe('ppg_cognitive_load_metric');
io.subscribe('ppg_attention_metric');
io.subscribe('ppg_arousal_metric');
io.subscribe('hr_data');
io.subscribe('hrv_data');

document.addEventListener('DOMContentLoaded', function () {

    // Dark Smoothie chart defaults
    var darkGrid = {
        fillStyle: 'rgba(15, 15, 18, 0.6)',
        strokeStyle: 'rgba(255,255,255,0.04)',
        borderVisible: false,
        millisPerLine: 7000
    };
    var darkLabels = { fillStyle: 'rgba(255,255,255,0.35)', fontSize: 10 };
    var darkTooltip = { strokeStyle: 'rgba(255,255,255,0.2)' };

    // ---- Heart Rate Chart ----
    var hrChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: darkGrid,
        labels: darkLabels,
        tooltipLine: darkTooltip,
        title: { fillStyle: '#c46060', text: 'heart_rate_bpm', fontSize: 12, verticalAlign: 'top' }
    });
    var hrTimeSeries = new TimeSeries();
    hrChart.streamTo(document.getElementById('HRChart'), 1000);
    hrChart.addTimeSeries(hrTimeSeries, { lineWidth: 2, strokeStyle: '#c46060', interpolation: 'bezier' });

    // ---- PPG Filtered Chart ----
    var ppgChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: darkGrid,
        labels: darkLabels,
        tooltipLine: darkTooltip,
        timestampFormatter: SmoothieChart.timeFormatter,
        title: { fillStyle: '#f97316', text: 'PPG_0', fontSize: 12, verticalAlign: 'top' }
    });
    var ppgTimeSeries = new TimeSeries();
    ppgChart.streamTo(document.getElementById('ppgChart'), 1000);
    ppgChart.addTimeSeries(ppgTimeSeries, { lineWidth: 2, strokeStyle: '#f97316', interpolation: 'bezier' });

    // ---- Metrics Combined Chart ----
    var metricsChart = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        timestampFormatter: SmoothieChart.timeFormatter,
        grid: darkGrid,
        labels: darkLabels,
        tooltipLine: darkTooltip,
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

    // ---- Data Handlers ----

    io.on('ppg_filtered', function (message) {
        var data = message;
        for (var timestamp in data) {
            if (ppgTimeSeries) {
                ppgTimeSeries.append(parseInt(timestamp), data[timestamp]['0']);
            }
        }
    });

    io.on('ppg_stress_metric', function (data) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let stress = data[lastKey].PPG_Stress_Metric;
        processMetric(data, stressSeries, 'PPG_Stress_Metric');
    });

    io.on('ppg_cognitive_load_metric', function (data) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let cognitiveLoad = data[lastKey].PPG_Cognitive_Load_Metric;
        processMetric(data, cognitiveLoadSeries, 'PPG_Cognitive_Load_Metric');
    });

    io.on('ppg_attention_metric', function (data) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let attention = data[lastKey].PPG_Attention_Metric;
        let attentionPercentage = (attention * 100).toFixed(2);

        var titleEl = document.querySelector('#attention_title span');
        if (titleEl) titleEl.textContent = attentionPercentage + '%';
        var barEl = document.getElementById('attention_progress');
        if (barEl) {
            barEl.style.width = attentionPercentage + '%';
            barEl.setAttribute('aria-valuenow', attentionPercentage);
        }

        processMetric(data, attentionSeries, 'PPG_Attention_Metric');
    });

    io.on('ppg_arousal_metric', function (data) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let arousal = data[lastKey].PPG_Arousal_Metric;
        let arousalPercentage = (arousal * 100).toFixed(2);

        var titleEl = document.querySelector('#arousal_title span');
        if (titleEl) titleEl.textContent = arousalPercentage + '%';
        var barEl = document.getElementById('arousal_progress');
        if (barEl) {
            barEl.style.width = arousalPercentage + '%';
            barEl.setAttribute('aria-valuenow', arousalPercentage);
        }

        processMetric(data, arousalSeries, 'PPG_Arousal_Metric');
    });

    io.on('hr_data', function (message) {
        var data = message;
        for (var timestamp in data) {
            var heartRate = data[timestamp]['0'];
            if (hrTimeSeries) {
                hrTimeSeries.append(parseInt(timestamp), heartRate);
            }
            document.getElementById('heart_rate_value').textContent = heartRate;
        }
    });

    function processMetric(data, series, metricName) {
        let keys = Object.keys(data);
        let lastKey = keys[keys.length - 1];
        let metricValue = data[lastKey][metricName];
        if (metricValue !== undefined) {
            series.append(new Date().getTime(), metricValue);
        }
    }

    // ---- HRV Data (dynamic charts) ----
    var hrv_dataCharts = {};
    var hrv_dataTimeSeries = {};
    var hrv_data_Container = document.getElementById('hrv_data_Container');

    function processhrv_data(data, key) {
        for (var timestamp in data) {
            for (var band in data[timestamp]) {
                var value = data[timestamp][band];
                var chartKey = key + '_' + band;

                if (!hrv_dataCharts[chartKey]) {
                    var canvas = document.createElement('canvas');
                    canvas.id = 'hrv_dataCharts' + chartKey;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    hrv_data_Container.appendChild(canvas);

                    hrv_dataCharts[chartKey] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: darkGrid,
                        labels: darkLabels,
                        tooltipLine: darkTooltip,
                        title: { fillStyle: '#5ca8b5', text: chartKey, fontSize: 11, verticalAlign: 'top' }
                    });
                    hrv_dataTimeSeries[chartKey] = new TimeSeries();
                    hrv_dataCharts[chartKey].streamTo(document.getElementById('hrv_dataCharts' + chartKey), 1000);
                    hrv_dataCharts[chartKey].addTimeSeries(hrv_dataTimeSeries[chartKey], {
                        lineWidth: 1.5,
                        strokeStyle: '#7ab3bd',
                        interpolation: 'bezier'
                    });
                }
                if (hrv_dataTimeSeries[chartKey]) {
                    hrv_dataTimeSeries[chartKey].append(parseInt(timestamp), value);
                }
            }
        }
    }

    io.on('hrv_data', function (message) {
        processhrv_data(message, 'hrv_data');
    });

});
