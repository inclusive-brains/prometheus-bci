"use strict";

let io = new IO();

// Update connection status in sidebar
io.on('connect', () => {
    updateConnectionStatus('connected');
});

load_settings().then(settings => {
    let stroop = new Stroop(io, settings.stroop);
    stroop.start();
});

class Stroop {

    /**
     * Initialize
     *
     * @param {IO} io - Timeflux IO instance
     * @param {Object} [options] - Experiment configuration
     * @param {string[]} [options.blocks] - Block types in order
     * @param {number} [options.trialsPerBlock] - Trials per block
     * @param {boolean} [options.practice] - Whether to run a practice block
     * @param {number} [options.practiceTrials] - Number of practice trials
     * @param {string[]} [options.colors] - Available colors
     * @param {string[]} [options.words] - Available words
     * @param {Object} [options.keys] - Key-to-color mapping
     * @param {number} [options.baseline] - Baseline duration in ms
     * @param {number} [options.fixation] - Fixation cross duration in ms
     * @param {number} [options.stimulus] - Max stimulus display in ms
     * @param {number} [options.feedback] - Feedback duration in ms
     * @param {number} [options.intertrial] - Inter-trial interval in ms
     * @param {number} [options.jitter] - ITI jitter range in ms
     */

    constructor(io, options = {}) {

        // Default options
        let default_options = {
            blocks: ['congruent', 'incongruent', 'mixed'],
            trialsPerBlock: 24,
            practice: true,
            practiceTrials: 6,
            colors: ['red', 'green', 'blue', 'yellow'],
            words: ['RED', 'GREEN', 'BLUE', 'YELLOW'],
            keys: { '1': 'red', '2': 'green', '3': 'blue', '4': 'yellow' },
            baseline: 60000,
            fixation: 500,
            stimulus: 2000,
            feedback: 500,
            intertrial: 1000,
            jitter: 200
        };

        // Merge options
        this.options = merge(default_options, options);

        // Color CSS classes
        this.colorClasses = {
            red: 'ink-red',
            green: 'ink-green',
            blue: 'ink-blue',
            yellow: 'ink-yellow'
        };

        // Block type labels
        this.blockLabels = {
            congruent: 'Congruent Block',
            incongruent: 'Incongruent Block',
            mixed: 'Mixed Block'
        };

        // Send start and stop events
        this.io = io;
        this.io.on('connect', () => this.io.event('session_begins', this.options));
        window.onbeforeunload = () => { this.io.event('session_ends'); }

        // Get HTML elements
        this.instructions = document.getElementById('instructions');
        this.baselineScreen = document.getElementById('baseline');
        this.markerEl = document.getElementById('marker');
        this.practiceIntro = document.getElementById('practice-intro');
        this.ready = document.getElementById('ready');
        this.readyBlockType = document.getElementById('ready-block-type');
        this.stimulusScreen = document.getElementById('stimulus');
        this.fixationCross = document.getElementById('fixation-cross');
        this.colorWord = document.getElementById('color-word');
        this.resultsScreen = document.getElementById('results');

        // State
        this.active = false;
        this.responded = false;
        this.trialData = [];

        // Listen to key press events
        document.addEventListener('keydown', this.on_key.bind(this));

        // Infinite scheduler to work around Chrome bug
        this.scheduler = new Scheduler();
    }

    async start() {
        this.scheduler.start();
        this.trialData = [];

        // Instructions
        await key(32);
        this.instructions.classList.add('hidden');

        // Baseline
        this.baselineScreen.classList.remove('hidden');
        await key();
        this.baselineScreen.classList.add('hidden');
        this.markerEl.classList.remove('hidden');
        this.io.event('baseline_begins');
        await sleep(this.options.baseline);
        this.io.event('baseline_ends');
        this.markerEl.classList.add('hidden');

        // Practice
        if (this.options.practice) {
            this.practiceIntro.classList.remove('hidden');
            await key(32);
            this.practiceIntro.classList.add('hidden');
            await this.runBlock('practice', this.options.practiceTrials);
        }

        // Main blocks
        for (let i = 0; i < this.options.blocks.length; i++) {
            let blockType = this.options.blocks[i];
            this.readyBlockType.innerHTML = this.blockLabels[blockType] || blockType;
            this.ready.classList.remove('hidden');
            await key(32);
            this.ready.classList.add('hidden');
            await this.runBlock(blockType, this.options.trialsPerBlock, i + 1);
        }

        // Results
        this.showResults();
        this.scheduler.stop();

        // Allow restart
        await key(32);
        this.resultsScreen.classList.add('hidden');
        this.instructions.classList.remove('hidden');
        this.start();
    }

    generateTrials(blockType, count) {
        let trials = [];
        let colors = this.options.colors;
        let words = this.options.words;

        for (let i = 0; i < count; i++) {
            let wordIndex = Math.floor(Math.random() * words.length);
            let word = words[wordIndex];
            let inkColor;

            if (blockType === 'congruent') {
                inkColor = colors[wordIndex];
            } else if (blockType === 'incongruent') {
                let available = colors.filter((_, idx) => idx !== wordIndex);
                inkColor = available[Math.floor(Math.random() * available.length)];
            } else {
                // mixed or practice: 50/50
                if (Math.random() < 0.5) {
                    inkColor = colors[wordIndex];
                } else {
                    let available = colors.filter((_, idx) => idx !== wordIndex);
                    inkColor = available[Math.floor(Math.random() * available.length)];
                }
            }

            trials.push({
                word: word,
                inkColor: inkColor,
                congruent: word === words[colors.indexOf(inkColor)]
            });
        }

        // Fisher-Yates shuffle
        for (let i = trials.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [trials[i], trials[j]] = [trials[j], trials[i]];
        }

        return trials;
    }

    async runBlock(blockType, trialCount, blockIndex) {
        let trials = this.generateTrials(blockType, trialCount);
        let isPractice = blockType === 'practice';

        this.stimulusScreen.classList.remove('hidden');
        this.io.event('block_begins', { type: blockType, index: blockIndex || 0 });

        for (let t = 0; t < trials.length; t++) {
            let trial = trials[t];

            // Fixation cross
            this.colorWord.innerHTML = '';
            this.colorWord.className = '';
            this.fixationCross.classList.remove('hidden');
            await sleep(this.options.fixation);
            this.fixationCross.classList.add('hidden');

            // Reset state
            this.responded = false;
            this.currentInkColor = trial.inkColor;
            this.result = 'timeout';
            this.correct = false;
            this.rt = -1;

            // Display stimulus
            this.io.event('trial_begins', {
                word: trial.word,
                inkColor: trial.inkColor,
                congruent: trial.congruent,
                trialIndex: t + 1
            });

            await this.scheduler.asap(() => {
                this.colorWord.innerHTML = trial.word;
                this.colorWord.className = this.colorClasses[trial.inkColor];
                this.timer = performance.now();
                this.active = true;
                this.io.event('display_on');
            });

            // Wait for response or timeout
            let elapsed = 0;
            let checkInterval = 16; // ~60fps
            while (elapsed < this.options.stimulus && !this.responded) {
                await sleep(checkInterval);
                elapsed = performance.now() - this.timer;
            }

            this.active = false;
            this.io.event('display_off');

            // Show feedback
            await this.scheduler.asap(() => {
                if (this.responded) {
                    if (this.correct) {
                        this.colorWord.classList.add('correct-feedback');
                    } else {
                        this.colorWord.classList.add('incorrect-feedback');
                    }
                } else {
                    this.colorWord.classList.add('timeout-feedback');
                    this.colorWord.innerHTML = '—';
                }
            });

            await sleep(this.options.feedback);

            // Record trial data (not for practice)
            let trialResult = {
                block: blockIndex || 0,
                blockType: blockType,
                trial: t + 1,
                word: trial.word,
                inkColor: trial.inkColor,
                congruent: trial.congruent,
                result: this.result,
                correct: this.correct,
                rt: this.rt
            };

            if (!isPractice) {
                this.trialData.push(trialResult);
            }

            this.io.event('trial_ends', trialResult);

            // Clear and ITI
            this.colorWord.innerHTML = '';
            this.colorWord.className = '';
            let jitter = (Math.random() * 2 - 1) * this.options.jitter;
            await sleep(this.options.intertrial + jitter);
        }

        this.io.event('block_ends', { type: blockType, index: blockIndex || 0 });
        this.stimulusScreen.classList.add('hidden');
    }

    on_key(event) {
        let keyStr = event.key;
        if (this.active && this.options.keys[keyStr]) {
            this.rt = performance.now() - this.timer;
            this.active = false;
            this.responded = true;
            let responseColor = this.options.keys[keyStr];
            this.correct = (responseColor === this.currentInkColor);
            this.result = this.correct ? 'success' : 'failure';
        }
    }

    showResults() {
        let congruent = this.trialData.filter(t => t.congruent && t.result !== 'timeout');
        let incongruent = this.trialData.filter(t => !t.congruent && t.result !== 'timeout');
        let congruentAll = this.trialData.filter(t => t.congruent);
        let incongruentAll = this.trialData.filter(t => !t.congruent);

        let avgRT = (trials) => {
            if (trials.length === 0) return 0;
            return Math.round(trials.reduce((sum, t) => sum + t.rt, 0) / trials.length);
        };

        let accuracy = (correct, total) => {
            if (total.length === 0) return 0;
            let hits = total.filter(t => t.correct).length;
            return Math.round((hits / total.length) * 100);
        };

        let rtCong = avgRT(congruent.filter(t => t.correct));
        let rtIncong = avgRT(incongruent.filter(t => t.correct));
        let accCong = accuracy(congruent, congruentAll);
        let accIncong = accuracy(incongruent, incongruentAll);
        let stroopEffect = rtIncong - rtCong;

        document.getElementById('rt-congruent').textContent = rtCong ? rtCong + ' ms' : '—';
        document.getElementById('rt-incongruent').textContent = rtIncong ? rtIncong + ' ms' : '—';
        document.getElementById('acc-congruent').textContent = accCong + '%';
        document.getElementById('acc-incongruent').textContent = accIncong + '%';
        document.getElementById('stroop-effect').textContent = (stroopEffect > 0 ? '+' : '') + stroopEffect + ' ms';

        this.resultsScreen.classList.remove('hidden');
    }
}
