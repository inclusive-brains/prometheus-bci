'use strict';

const app = location.pathname.split('/')[1];
const button = document.getElementById('start');
const logo = document.getElementById('logo');
const message = document.getElementById('message');
const ready = document.getElementById('ready');
const loading = document.getElementById('loading');
const main = document.getElementById('wrapper');
const metrics = document.getElementById('metrics');
const overlay = document.getElementById('overlay');

let training = null;
let grid = null;

let model = {
    _enabled: 0,
    _trained: 0,
}

let blink = {
    delay: 1200,
    _status: 0,
    _timeout: null
};

let config = {
    threshold: null,
    buffersize: null,
    recovery: null,
    scorer: "sum",
    feedback: true
};

(async () => {

    // Load settings
    let settings = await load_settings();
    settings = settings[app];
    model._enabled += (settings.training?.motor?.enable ?? true);
    model._enabled += (settings.training?.blink?.enable ?? true);

    // Initialize I/O
    let io = new IO();
    io.on('connect', () => io.event('session_begins', settings));
    window.onbeforeunload = () => io.event('session_ends');
    io.subscribe('model');
    io.on('model', on_message);
    io.subscribe('metrics');
    io.on('metrics', on_message);

    // Accumulation setttings
    io.event('get_motor_accumulation');
    for (let setting of ['threshold', 'buffer_size', 'recovery']) {
        let value = document.getElementById(setting + '-value');
        document.getElementById(setting + '-slider').addEventListener('input', (event) => {
            value.innerHTML = event.target.value;
            config[setting] = parseFloat(event.target.value);
        });
        document.getElementById(setting + '-slider').addEventListener('change', (event) => {
            io.event('reset_motor_accumulation', config);
        });
    }
    document.getElementById('scorer').addEventListener('change', (event) => {
        config['scorer'] = event.target.value;
        io.event('reset_motor_accumulation', config);
    });
    document.getElementById('feedback').addEventListener('change', (event) => {
        config['feedback'] = event.target.value == 1 ? true : false;
        io.event('reset_motor_accumulation', config);
        if (config['feedback']) {
            grid._feedback([.5, .5]);
        } else {
            grid._feedback([1, 1]);
        }
    });

    // Keystroke listening
    window.addEventListener('keydown', (event) => {
        if (event.key == 's') {
            overlay.classList.toggle('hidden');
        }

        if (grid == null) return;
        if (event.key == 'm') {
            metrics.classList.toggle('hidden');
        }
        if (event.key == 'b') {
            on_prediction(microtime(), 'blink', 1);
        }
        const commands = {
            ArrowRight: 'right',
            ArrowLeft: 'left',
            w: 'flip',
            x: 'select',
            c: 'toggle'
        }
        const command = commands[event.key];
        if (command) grid._update(command);
    })

    // Handle messages
    function on_message(data, meta) {
        for (const [timestamp, row] of Object.entries(data)) {
            switch (row.label) {
                case 'ready':
                    model._trained += 1;
                    if (model._trained == model._enabled) {
                        loading.classList.toggle('hidden');
                        main.classList.toggle('hidden');
                        metrics.classList.toggle('hidden');
                        grid = new Grid(io, settings.grid);
                    }
                    break;
                case 'feedback':
                    if (grid != null) {
                        on_feedback(timestamp, row.data.source, row.data.scores);
                    }
                    break;
                case 'predict':
                    if (grid != null) {
                        on_prediction(timestamp, row.data.source, row.data.target);
                    }
                    break;
                case 'cognitive_load':
                    set_css_var('--metric-cognitiveload', color_scale(1 - row.data));
                    break;
                case 'accumulation':
                    for (let setting of ['threshold', 'buffer_size', 'recovery']) {
                        document.getElementById(setting + '-slider').value = row.data[setting];
                        document.getElementById(setting + '-value').innerHTML = row.data[setting];
                    }
                    document.getElementById('scorer').value = row.data.scorer;
                    break;
            }
        }
    }

    // Handle feedback
    function on_feedback(timestamp, source, scores) {
        if (source == 'motor' && config['feedback']) {
            grid._feedback(scores);
        }
    }

    // Handle predictions
    function on_prediction(timestamp, source, target) {
        if (source == 'motor') {
            target = target == 0 ? 'left' : 'right';
            grid._update(target);
        }
        if (source == 'blink') {
            if (target == 1) {
                if (blink._timeout) clearTimeout(blink._timeout);
                blink._status++;
                if (blink._status == 3) {
                    blink._status = 0;
                    grid._update('toggle');
                } else {
                    blink._timeout = setTimeout(() => {
                        if (blink._status == 1) {
                            grid._update('flip');
                        }
                        else if (blink._status == 2) {
                            grid._update('select');
                        }
                        blink._status = 0;
                    }, blink.delay - (microtime() - timestamp))
                }
            }
        }
    }

    // Start training
    await key();
    logo.classList.toggle('hidden');
    ready.classList.toggle('hidden');
    training = new Training(io, settings.training);
    await training.start();
    loading.classList.toggle('hidden');

})()


/**
 * Set a CSS variable
 *
 * @param {string} variable name
 * @param {string|number} value
 */
function set_css_var(name, value) {
    document.documentElement.style.setProperty(name, value);
}

/**
 * Get a CSS variable
 *
 * @param {string} variable name
 */
function get_css_var(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/**
 * Text to speech synthesis
 *
 * @param {string} text
 */
function speak(text) {
    if ('speechSynthesis' in window) {
        let utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}

/**
 * Color scale
 *
 * @param {number} normalized value between 0 and 1
 * @return {string} hexadecimal color value from red to yellow to green
 */
function color_scale(value) {
    value *= 100;
    let r, g, b = 0;
    if (value < 50) {
        r = 255;
        g = Math.round(5.1 * value);
    } else {
        g = 255;
        r = Math.round(510 - 5.10 * value);
    }
    let h = r * 0x10000 + g * 0x100 + b * 0x1;
    return '#' + ('000000' + h.toString(16)).slice(-6);
}
