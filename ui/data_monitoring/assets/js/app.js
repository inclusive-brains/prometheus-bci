"use strict";

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

// Souscrire uniquement au flux de données brutes EEG
io.subscribe('eeg_raw');

document.addEventListener('DOMContentLoaded', function () {
    var charts = {};
    var timeSeries = {};

    io.on('eeg_raw', (message) => {
        var data = message;
        for (var timestamp in data) {
            for (var sensor in data[timestamp]) {
                // Vérifier si le graphique pour l'électrode existe déjà, sinon le créer.
                if (!charts[sensor]) {
                    // Créer un nouvel élément canvas pour l'électrode
                    var canvas = document.createElement('canvas');
                    canvas.id = 'eegChart' + sensor;
                    canvas.style.width = '100%';
                    canvas.style.height = '100px';
                    document.getElementById('eegChartsContainer').appendChild(canvas);

                    // Initialiser le graphique Smoothie pour l'électrode
                    charts[sensor] = new SmoothieChart({
                        millisPerPixel: 10,
                        responsive: true,
                        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                        tooltipLine: { strokeStyle: '#000000' },
                        title: { fillStyle: '#012030', text: sensor, fontSize: 21, verticalAlign: 'top' }
                    });
                    timeSeries[sensor] = new TimeSeries();
                    charts[sensor].streamTo(document.getElementById('eegChart' + sensor), 1000);
                    charts[sensor].addTimeSeries(timeSeries[sensor], { lineWidth: 1, strokeStyle: '#012030', interpolation: 'bezier' });
                }

                // Ajouter les données à la série temporelle de l'électrode
                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]);
                }
            }
        }
    });
});

// Ajouter les gestionnaires d'événements pour les boutons
document.addEventListener('DOMContentLoaded', function () {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const markButton = document.getElementById('markButton');

    startButton.addEventListener('click', function () {
        sendStartEvent();
    });

    stopButton.addEventListener('click', function () {
        sendStopEvent();
    });

    markButton.addEventListener('click', function () {
        sendMarkerEvent();
    });
});

// Définition des fonctions d'événements
function sendStartEvent() {
    io.event('start');
}

function sendStopEvent() {
    io.event('stop');
}

function sendMarkerEvent() {
    io.event('marker');
}
