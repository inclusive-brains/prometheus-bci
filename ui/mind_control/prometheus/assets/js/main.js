// S'abonner à l'événement 'facial_blendshapes' et 'multimodal_attention'
io.subscribe('facial_blendshapes');
io.subscribe('multimodal_attention');

// Variables pour stocker les métriques disponibles
let attentionValue = 0; // Initialisation avec une valeur par défaut
let availableMetrics = new Set();

// Écoute de l'événement 'facial_blendshapes' pour recevoir les données
io.on('facial_blendshapes', (message) => {
    var data = message; // Les données reçues sont stockées dans la variable 'data'
    console.log("Blendshapes", data); // Affiche toutes les données des blendshapes dans la console

    let newMetricsAdded = false; // Indicateur pour savoir si de nouvelles métriques sont ajoutées

    // Parcourir chaque timestamp dans les données
    for (var timestamp in data) {
        // Vérifier et ajouter de nouvelles clés
        Object.keys(data[timestamp]).forEach(metric => {
            if (!availableMetrics.has(metric)) {
                availableMetrics.add(metric);
                newMetricsAdded = true; // Indiquer qu'une nouvelle métrique a été ajoutée
            }
        });
    }

    // Mettre à jour le select uniquement si de nouvelles métriques sont ajoutées
    if (newMetricsAdded) {
        updateMetricSelect(availableMetrics);
    }
});

// Fonction pour mettre à jour les <select> avec les métriques disponibles
function updateMetricSelect(metrics) {
    const upSelectElement = document.getElementById('upMetricSelect');
    const downSelectElement = document.getElementById('downMetricSelect');
    upSelectElement.innerHTML = ''; // Effacer les options existantes
    downSelectElement.innerHTML = ''; // Effacer les options existantes

    // Ajouter chaque métrique en tant qu'option dans les select
    metrics.forEach(metric => {
        const upOption = document.createElement('option');
        upOption.value = metric;
        upOption.textContent = metric;
        upSelectElement.appendChild(upOption);

        const downOption = document.createElement('option');
        downOption.value = metric;
        downOption.textContent = metric;
        downSelectElement.appendChild(downOption);
    });
}

// Variables globales pour les seuils configurables et les métriques sélectionnées
let thresholdValue = 0.8; // Seuil par défaut pour la mesure de contrôle
let upExpressionMetric = "jawOpen";   // Metric par défaut pour l'action Up
let upExpressionThreshold = 0.8; // Seuil de score pour l'action Up
let downExpressionMetric = "mouthPucker"; // Metric par défaut pour l'action Down
let downExpressionThreshold = 0.8; // Seuil de score pour l'action Down

// Récupération des éléments du DOM pour les seuils
const thresholdInput = document.getElementById("thresholdInput");
const upExpressionThresholdInput = document.getElementById("upExpressionThreshold");
const downExpressionThresholdInput = document.getElementById("downExpressionThreshold");
const applySettingsButton = document.getElementById("applySettingsButton");

// Écouteur d'événement pour le bouton "Appliquer" qui met à jour les métriques et seuils
applySettingsButton.addEventListener("click", () => {
    thresholdValue = parseFloat(thresholdInput.value);
    upExpressionThreshold = parseFloat(upExpressionThresholdInput.value);
    downExpressionThreshold = parseFloat(downExpressionThresholdInput.value);
    upExpressionMetric = document.getElementById('upMetricSelect').value;
    downExpressionMetric = document.getElementById('downMetricSelect').value;
    console.log(`Seuil: ${thresholdValue}, Seuil Up: ${upExpressionThreshold}, Metric Up: ${upExpressionMetric}, Seuil Down: ${downExpressionThreshold}, Metric Down: ${downExpressionMetric}`);
});

// Gérer l'affichage de la métrique sélectionnée pour les actions Up et Down
io.on('facial_blendshapes', (message) => {
    var data = message;

    for (var timestamp in data) {
        // Vérifier et afficher la métrique pour l'action Up
        if (data[timestamp].hasOwnProperty(upExpressionMetric)) {
            let upValue = data[timestamp][upExpressionMetric];
            document.getElementById('upMetricValue').value = upValue; // Mise à jour de la valeur en temps réel
            console.log(`Value of ${upExpressionMetric} for Up:`, upValue);
            // Déclencher l'action Up si les conditions de seuil sont remplies
            if (upValue > upExpressionThreshold && attentionValue > thresholdValue) {
                triggerActionUp();
            }
        }

        // Vérifier et afficher la métrique pour l'action Down
        if (data[timestamp].hasOwnProperty(downExpressionMetric)) {
            let downValue = data[timestamp][downExpressionMetric];
            document.getElementById('downMetricValue').value = downValue; // Mise à jour de la valeur en temps réel
            console.log(`Value of ${downExpressionMetric} for Down:`, downValue);
            // Déclencher l'action Down si les conditions de seuil sont remplies
            if (downValue > downExpressionThreshold && attentionValue > thresholdValue) {
                triggerActionDown();
            }
        }
    }
});

// Écoute de l'événement 'multimodal_attention' pour recevoir la valeur de contrôle
io.on('multimodal_attention', (data) => {
    let keys = Object.keys(data);
    let lastKey = keys[keys.length - 1];
    attentionValue = data[lastKey].multimodal_attention; // Mettre à jour la valeur de multimodal_attention

    // Mettre à jour la valeur de contrôle dans l'input readonly
    document.getElementById('controlValue').value = attentionValue;
});


// Écoute de l'événement 'multimodal_attention' pour recevoir la valeur de contrôle
io.on('multimodal_attention', (data) => {
    let keys = Object.keys(data);
    let lastKey = keys[keys.length - 1];
    attentionValue = data[lastKey].multimodal_attention; // Mettre à jour la valeur de multimodal_attention

    // Mettre à jour la valeur de contrôle dans l'input readonly
    document.getElementById('controlValue').value = attentionValue;
});


// Définissez ce que vous voulez faire quand le score dépasse le seuil configuré pour Up
function triggerActionUp() {
    console.log("Le score pour Up a dépassé le seuil configuré et le contrôle est valide !");
    showMessage("Action Up triggered");
    // Envoie la commande 'B' plusieurs fois et stoppe
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandB();
    //sendCommandC();
}

// Définissez ce que vous voulez faire quand le score dépasse le seuil configuré pour Down
function triggerActionDown() {
    console.log("Le score pour Down a dépassé le seuil configuré et le contrôle est valide !");
    showMessage("Action Down triggered");
    // Envoie la commande 'A' plusieurs fois et stoppe
    sendCommandA();
    sendCommandA();
    sendCommandA();
    //sendCommandC();
}

// Fonctions pour envoyer des commandes spécifiques via la connexion série (ex. commandes A, B, C)
async function sendCommandB() {
    try {
        if (!writer) {
            console.error('Writer not available. Check serial connection.');
            return;
        }
        const data = new TextEncoder().encode('B'); // Commande "B"
        await writer.write(data);
        console.log('Commande B envoyée avec succès');
    } catch (error) {
        console.error('Échec de l\'envoi de la commande B:', error);
    }
}

async function sendCommandC() {
    try {
        if (!writer) {
            console.error('Writer not available. Check serial connection.');
            return;
        }
        const data = new TextEncoder().encode('C'); // Commande "C"
        await writer.write(data);
        console.log('Commande C envoyée avec succès');
    } catch (error) {
        console.error('Échec de l\'envoi de la commande C:', error);
    }
}

async function sendCommandA() {
    try {
        if (!writer) {
            console.error('Writer not available. Check serial connection.');
            return;
        }
        const data = new TextEncoder().encode('A'); // Commande "A"
        await writer.write(data);
        console.log('Commande A envoyée avec succès');
    } catch (error) {
        console.error('Échec de l\'envoi de la commande A:', error);
    }
}

// Additional code for serial connection setup and command sending
let port, writer;

// Listener for the 'Connect' button to establish serial communication
document.getElementById('connectButton').addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        console.log('Port opened successfully');
        document.getElementById('sendCommandButtonB').disabled = false;
        document.getElementById('sendCommandButtonA').disabled = false;
        document.getElementById('sendCommandButtonC').disabled = false;
        writer = port.writable.getWriter();
    } catch (error) {
        console.error('Failed to open the port:', error);
    }
});

// Listener for the 'Up' button to send command 'B'
document.getElementById('sendCommandButtonB').addEventListener('click', async () => {
    try {
        if (writer) {
            const data = new TextEncoder().encode('B'); // Command "B"
            await writer.write(data);
            console.log('Command B sent successfully');
        }
    } catch (error) {
        console.error('Failed to send command B:', error);
    }
});

// Listener for the 'Down' button to send command 'A'
document.getElementById('sendCommandButtonA').addEventListener('click', async () => {
    try {
        if (writer) {
            const data = new TextEncoder().encode('A'); // Command "A"
            await writer.write(data);
            console.log('Command A sent successfully');
        }
    } catch (error) {
        console.error('Failed to send command A:', error);
    }
});

// Listener for the 'Stop' button to send command 'C'
document.getElementById('sendCommandButtonC').addEventListener('click', async () => {
    try {
        if (writer) {
            const data = new TextEncoder().encode('C'); // Command "C"
            await writer.write(data);
            console.log('Command C sent successfully');
        }
    } catch (error) {
        console.error('Failed to send command C:', error);
    }
});

// Function to display messages
function showMessage(message) {
    const messageContainer = document.getElementById('messageContainer');
    const messageText = document.getElementById('messageText');
    messageText.textContent = message;
    messageContainer.style.display = 'block';
    setTimeout(() => {
        messageContainer.style.display = 'none';
    }, 3000); // Hide message after 3 seconds
}
