'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

// Souscrire aux flux de données brutes EEG et PPG
io.subscribe('audio');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    // Créer un graphique et une série temporelle pour l'audio
    var audioChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        tooltipLine: { strokeStyle: '#000000' },
        title: { fillStyle: '#8a2be2', text: 'audio_0', fontSize: 21, verticalAlign: 'top' }
    });
    var audioTimeSeries = new TimeSeries();
    audioChart.streamTo(document.getElementById("audioChart"), 1000);
    audioChart.addTimeSeries(audioTimeSeries, { lineWidth: 2, strokeStyle: '#8a2be2', interpolation: 'bezier' });


    io.on('audio', (message) => {
        var data = message;
        for (var timestamp in data) {
            if (audioTimeSeries) {
                audioTimeSeries.append(parseInt(timestamp), data[timestamp]['0']);
            }
        }
    });

});