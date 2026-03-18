'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
    updateConnectionStatus('connected');
});

// Subscribe to motion data stream
io.subscribe('motion');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};
    var emptyState = document.getElementById('emptyState');

    io.on('motion', (message) => {
        var data = message;

        // Hide empty state on first data
        if (emptyState) {
            emptyState.style.display = 'none';
            emptyState = null;
        }

        for (var timestamp in data) {
            for (var sensor in data[timestamp]) {
                // Create chart for this sensor if it does not exist yet
                if (!charts[sensor]) {
                    var chartItem = document.createElement('div');
                    chartItem.className = 'chart-item';

                    var label = document.createElement('span');
                    label.className = 'chart-label';
                    label.textContent = sensor;

                    var canvas = document.createElement('canvas');
                    canvas.id = 'motionChart' + sensor;

                    chartItem.appendChild(label);
                    chartItem.appendChild(canvas);
                    document.getElementById('motionChartsContainer').appendChild(chartItem);

                    // Initialise dark-themed Smoothie chart
                    charts[sensor] = new SmoothieChart({
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
                    });
                    timeSeries[sensor] = new TimeSeries();
                    charts[sensor].streamTo(document.getElementById('motionChart' + sensor), 1000);
                    charts[sensor].addTimeSeries(timeSeries[sensor], {
                        lineWidth: 1.5,
                        strokeStyle: '#7ab3bd',
                        interpolation: 'bezier'
                    });
                }

                // Append data to the time series
                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]);
                }
            }
        }
    });
});
