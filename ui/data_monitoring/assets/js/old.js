'use strict';

let io = new IO();
io.on('connect', function () {
    console.log('Connected');
});

io.subscribe('eeg_raw');
io.subscribe('ppg_raw');

document.addEventListener('DOMContentLoaded', function () {
    var electrodes = ["Fp1", "Fp2", "F3", "Fz", "F4", "C1", "Cz", "C2", "P3", "Pz", "P4", "O1", "Oz", "O2", "T3", "T4"];
    var charts = {};
    var timeSeries = {};

    electrodes.forEach(function (electrode) {
        // Créez une nouvelle instance de SmoothieChart pour chaque électrode
        charts[electrode] = new SmoothieChart({
            millisPerPixel: 10,
            responsive: true,
            grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
            labels: { fillStyle: 'rgba(0,0,0,0.68)' },
            tooltipLine: { strokeStyle: '#000000' }
        });

        // Créez une nouvelle TimeSeries pour chaque électrode
        timeSeries[electrode] = new TimeSeries();

        // Associez chaque graphique à un élément canvas différent dans le DOM
        charts[electrode].streamTo(document.getElementById("eegChart" + electrode), 1000);

        // Ajoutez la TimeSeries au graphique correspondant
        charts[electrode].addTimeSeries(timeSeries[electrode], { lineWidth: 1, strokeStyle: '#242464', interpolation: 'bezier' });
    });

    io.on('eeg_raw', (message) => {
        var data = message;
        for (var timestamp in data) {
            for (var sensor in data[timestamp]) {
                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]);
                }
            }
        }
    });
});


// Add event listeners to buttons
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

// Definition of sendStartEvent and sendStopEvent functions
function sendStartEvent() {
    // Logic to send a start event
    io.event('start');
}

function sendStopEvent() {
    // Logic to send a start event
    io.event('stop');
}

function sendMarkerEvent() {
    // Logic to send a start event
    io.event('marker');
}


/*'use strict';

// Assurez-vous que ce script est exécuté après que le DOM soit complètement chargé
document.addEventListener('DOMContentLoaded', function () {
    var smoothie = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        tooltipLine: { strokeStyle: '#000000' }
    });
    smoothie.streamTo(document.getElementById("eegCharts"), 1000);

    // Créez une TimeSeries pour chaque électrode
    var electrodes = ["Fp1"];
    var timeSeries = {};
    electrodes.forEach(function (electrode) {
        timeSeries[electrode] = new TimeSeries();
        // Ajoutez chaque série temporelle au graphique avec une couleur et un style de ligne uniques
        smoothie.addTimeSeries(timeSeries[electrode], { lineWidth: 1, strokeStyle: '#242464', interpolation: 'bezier' });
    });

    let io = new IO();
    io.on('connect', function () {
        console.log('Connected');
    });

    io.subscribe('eeg_raw');

    io.on('eeg_raw', (message) => {
        var data = message; // Assurez-vous que cela correspond à la structure de vos données
        console.log('Payload:', data); // Pour voir la structure exacte de payload
        for (var timestamp in data) {
            console.log('Timestamp:', timestamp); // Vérifiez que les timestamps sont lus correctement
            for (var sensor in data[timestamp]) {
                console.log(`Data for ${sensor}: ${data[timestamp][sensor]}`); // Vérifiez que les données du capteur sont correctes
                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]); // Ajoutez les données à la série temporelle correspondante
                }
            }
        }
    });
});
/*




/*'use strict';

document.addEventListener('DOMContentLoaded', function () {
    let io = new IO();

    // Create a Smoothie chart for every sensor
    function createEEGCharts(electrodes) {
        electrodes.forEach((electrode, index) => {
            // Create a div container for each sensor
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.id = `chart-${electrode}`;
            chartContainer.style.width = '100%';
            chartContainer.style.height = '100px';
            document.getElementById('eegCharts').appendChild(chartContainer);

            // Create a canva element for the chart
            const canvas = document.createElement('canvas');
            canvas.id = `eegChart-${electrode}`;
            chartContainer.appendChild(canvas);

            // Initialize the Smoothie Chart
            const smoothie = new SmoothieChart({
                millisPerPixel: 50,
                //responsive: true,
                grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
                labels: { fillStyle: 'rgba(0,0,0,0.68)' },
                tooltipLine: { strokeStyle: '#000000' }
            });
            smoothie.streamTo(document.getElementById(`eegChart-${electrode}`), 1000);

            // Create a timeserie for each sensor
            const timeSeries = new TimeSeries();
            smoothie.addTimeSeries(timeSeries, { lineWidth: 1, strokeStyle: randomColor(), interpolation: 'bezier' });

            // memorize time serie in an object to acess later
            electrodeTimeSeries[electrode] = timeSeries;
        });
    }

    // Detect sensors (to be modified later with autodetection)
    let electrodes = ["Fp1", "Fp2", "Fp3"];
    let electrodeTimeSeries = {};
    createEEGCharts(electrodes);

    io.on('connect', function () {
        console.log('Connected');
    });

    io.subscribe('eeg_filtered');

    io.on('eeg_filtered', (message) => {
        var data = message;
        for (var timestamp in data) {
            for (var sensor in data[timestamp]) {
                if (electrodeTimeSeries[sensor]) {
                    electrodeTimeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]);
                }
            }
        }
    });
});

// Create a random color
function randomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

*/

/*'use strict';

// Assurez-vous que ce script est exécuté après que le DOM soit complètement chargé
document.addEventListener('DOMContentLoaded', function () {
    var smoothie = new SmoothieChart({
        millisPerPixel: 50,
        responsive: true,
        grid: { fillStyle: '#ffffff', strokeStyle: 'rgba(201,201,201,0.38)', millisPerLine: 7000 },
        labels: { fillStyle: 'rgba(0,0,0,0.68)' },
        tooltipLine: { strokeStyle: '#000000' }
    });
    smoothie.streamTo(document.getElementById("eegChart"), 1000);

    // Créez une TimeSeries pour chaque électrode
    var electrodes = ["Fp1", "Fp2"];
    var timeSeries = {};
    electrodes.forEach(function (electrode) {
        timeSeries[electrode] = new TimeSeries();
        // Ajoutez chaque série temporelle au graphique avec une couleur et un style de ligne uniques
        smoothie.addTimeSeries(timeSeries[electrode], { lineWidth: 1, strokeStyle: randomColor(), interpolation: 'bezier' });
    });

    let io = new IO();
    io.on('connect', function () {
        console.log('Connected');
    });

    io.subscribe('eeg_filtered');

    io.on('eeg_filtered', (message) => {
        var data = message; // Assurez-vous que cela correspond à la structure de vos données
        console.log('Payload:', data); // Pour voir la structure exacte de payload
        for (var timestamp in data) {
            console.log('Timestamp:', timestamp); // Vérifiez que les timestamps sont lus correctement
            for (var sensor in data[timestamp]) {
                console.log(`Data for ${sensor}: ${data[timestamp][sensor]}`); // Vérifiez que les données du capteur sont correctes
                if (timeSeries[sensor]) {
                    timeSeries[sensor].append(parseInt(timestamp), data[timestamp][sensor]); // Ajoutez les données à la série temporelle correspondante
                }
            }
        }
    });
});

// Fonction pour générer une couleur aléatoire
function randomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

/*

/*
Buttons ==> To be updated !!
// Add event listeners to buttons
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

// Definition of sendStartEvent and sendStopEvent functions
function sendStartEvent() {
    // Logic to send a start event
    io.event('start');
}

function sendStopEvent() {
    // Logic to send a start event
    io.event('stop');
}

function sendMarkerEvent() {
    // Logic to send a start event
    io.event('marker');
}
*/