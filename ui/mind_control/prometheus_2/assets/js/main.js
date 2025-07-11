// Content of main.js

io.subscribe('multimodal_vigilance');
io.subscribe('multimodal_attention');
io.subscribe('model');

/********************************************************************
// Exoskeleton Control
********************************************************************/

let controlThreshold = 0.70; // Default threshold for motor control
let attentionThreshold = 0.75; // Default threshold for attention
let vigilanceThreshold = 0.2; // Default threshold for vigilance

let motorValue = 0; // Variable to store the motor value
let attentionValue = 0; // Variable to store the multimodal_attention value
let multimodalVigilance = 0; // Variable to store the multimodal_vigilance value

// Handle multimodal_attention data
io.on('multimodal_attention', (data) => {
    let keys = Object.keys(data);
    let lastKey = keys[keys.length - 1];
    attentionValue = data[lastKey].multimodal_attention; // Update the multimodal_attention value
});

// Handle multimodal_vigilance data
io.on('multimodal_vigilance', (data) => {
    let keys = Object.keys(data);
    let lastKey = keys[keys.length - 1];
    multimodalVigilance = data[lastKey].multimodal_vigilance; // Update the multimodal_vigilance value
});

// Handle model data and trigger actions based on the updated thresholds
io.on('model', (data) => {
  // Extract dynamic key
  const key = Object.keys(data)[0];
  const modelData = data[key].data;

  // Extract specific information
  const motor = modelData.target;
  const scores = modelData.scores;
  const accumulation = modelData.accumulation;
  const source = modelData.source;

  // Update values in the table
  document.getElementById('scoresValue').textContent = scores.join(', ');
  document.getElementById('accumulationValue').textContent = accumulation;
  document.getElementById('sourceValue').textContent = source;

  // Update the display with the latest motor value
  document.getElementById('motorValue').textContent = motor;

  // Check conditions for triggering actions based on any value in the scores list
  if (scores.some(score => score > controlThreshold) && attentionValue > attentionThreshold) {
      triggerActionUp();
  } else if (scores.some(score => score > controlThreshold) && multimodalVigilance < vigilanceThreshold) {
      triggerActionDown();
  }
});


// Update thresholds based on user input
document.getElementById('applyThresholdSettingsButton').addEventListener('click', () => {
  controlThreshold = parseFloat(document.getElementById('motorThresholdInput').value);
  attentionThreshold = parseFloat(document.getElementById('attentionThresholdInput').value);
  vigilanceThreshold = parseFloat(document.getElementById('vigilanceThresholdInput').value);
  console.log(`Updated thresholds - Motor: ${controlThreshold}, Attention: ${attentionThreshold}, Vigilance: ${vigilanceThreshold}`);
});

// Function to trigger "Up" action
function triggerActionUp() {
    console.log("Action Up triggered based on motor and attention values!");
    showMessage("Action Up triggered");

    // Send the command 'B' multiple times and stop
    sendCommandB();
    sendCommandB();
    sendCommandB();
    sendCommandC();
}

// Function to trigger "Down" action
function triggerActionDown() {
    console.log("Action Down triggered based on motor and vigilance values!");
    showMessage("Action Down triggered");

    // Send the command 'A' multiple times and stop
    sendCommandA();
    sendCommandA();
    sendCommandA();
    sendCommandC();
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

// Additional code from the second <script> tag in HTML
let port, writer;

// Listener for the 'Connect' button to establish serial communication
document.getElementById('connectButton').addEventListener('click', async () => {
    try {
        // Prompt user to select any serial port
        port = await navigator.serial.requestPort();
        // Open the selected port with a baud rate of 9600
        await port.open({ baudRate: 9600 });
        console.log('Port opened successfully');

        // Enable the send command buttons when port is opened
        document.getElementById('sendCommandButtonB').disabled = false;
        document.getElementById('sendCommandButtonA').disabled = false;
        document.getElementById('sendCommandButtonC').disabled = false; // Enable the 'Stop' button

        // Setup writer
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

function showMessage(message) {
const messageContainer = document.getElementById('messageContainer');
const messageText = document.getElementById('messageText');
messageText.textContent = message;
messageContainer.style.display = 'block';
setTimeout(() => {
    messageContainer.style.display = 'none';
}, 3000); // Masquer le message après 3 secondes
}