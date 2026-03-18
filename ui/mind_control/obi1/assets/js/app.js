'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    updateConnectionStatus('connected');
});

// Subscribe to audio data stream
io.subscribe('audio');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    // Create Smoothie chart for audio — dark theme
    var audioChart = new SmoothieChart({
        millisPerPixel: 10,
        responsive: true,
        grid: {
            fillStyle: 'rgba(15, 15, 18, 0.6)',
            strokeStyle: 'rgba(34, 211, 238, 0.06)',
            millisPerLine: 7000,
            verticalSections: 4,
            borderVisible: false
        },
        labels: {
            fillStyle: '#63636e',
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace'
        },
        tooltipLine: { strokeStyle: '#7ab3bd' },
        title: {
            fillStyle: '#5ca8b5',
            text: 'audio_0',
            fontSize: 11,
            verticalAlign: 'top'
        },
        maxValueScale: 1.1,
        minValueScale: 1.1
    });
    var audioTimeSeries = new TimeSeries();
    audioChart.streamTo(document.getElementById("audioChart"), 1000);
    audioChart.addTimeSeries(audioTimeSeries, {
        lineWidth: 1.5,
        strokeStyle: '#7ab3bd',
        interpolation: 'bezier'
    });

    io.on('audio', (message) => {
        var data = message;
        for (var timestamp in data) {
            if (audioTimeSeries) {
                audioTimeSeries.append(parseInt(timestamp), data[timestamp]['0']);
            }
        }
    });

});
