/**
 * @file BCI command trainer
 * @author Pierre Clisson <pierre@clisson.com>
 */

'use strict';


/**
 * A BCI command trainer
 */
class Training {

    /**
     * Initialize
     *
     * @param {Object} [baseline]
     * @param {number} [baseline.duration] - baseline duration, in ms
     *
     * @param {number} [blocks_per_session] - number of blocks per session
     * @param {number} [instructions_per_block] - number of instructions per block
     * @param {Object} [duration]
     * @param {number} [duration.prep] - preparation duration before session starts, in ms
     * @param {number} [duration.rest] - rest duration between blocks, in ms
     * @param {number} [duration.on] - duration of the instruction message, in ms
     * @param {number} [duration.off] - blank screen duration after each instruction, in ms
     * @param {number} [duration.pause] - pause duration before actually playing a video, in ms
     * @param {string[]} [instructions] - list of instructions
     * @param {Object[]} [media] - optional list of videos or images, in the same order as instructions
     * @param {string} media[].path - file source
     * @param {string} media[].position - position in the grid, can be: nw, n, ne, w, c, e, sw, s, se
     * @param {number} [media[].width] - video width
     * @param {number} [media[].height] - video height
     */
    constructor(io, options = {}) {

        let default_options = {
            baseline: {
                enable: true,
                duration: 3000,
                instruction: 'Stay as still as possible and look at the fixation cross.'
            },
            motor: {
                enable: true,
                blocks: 3,
                trials: 10,
                duration: {
                    prep: 5000,
                    rest: 10000,
                    on: 3000,
                    off: 2000,
                    pause: 0
                },
                instruction: 'Stay as still as possible. Try to stay in sync, and <em>feel</em> the sensation as you <em>imagine</em> doing the movement displayed on the screen.',
                imagery: [
                    'Extend your LEFT wrist',
                    'Extend your RIGHT wrist'
                ],
                //media: false
                media: [{
                    path: 'assets/media/extension_left.mp4',
                    width: 320,
                    position: 'bottom-left'
                }, {
                    path: 'assets/media/extension_right.mp4',
                    width: 320,
                    position: 'bottom-right'
                }]
            },
            blink: {
                enable: true,
                trials: 10,
                duration: {
                    prep: 3000,
                    stim: 1500,
                    display: 800,
                    rest_min: 0,
                    rest_max: 500
                },
                instruction: 'Stay as still as possible. Blink <em>once</em> when you see a red dot.'
            }
        }

        // Do not merge arrays
        if (options?.motor?.imagery && Array.isArray(options.motor.imagery)) {
            default_options.motor.imagery = [];
        }
        if (options?.motor?.media && Array.isArray(options.motor.media)) {
            default_options.motor.media = [];
        }

        // Merge options
        this.options = merge(default_options, options);

        // Create HTML elements
        if (this.options.motor.media) {
            let container = document.getElementById('media');
            for (let [index, media] of this.options.motor.media.entries()) {
                let extension = media.path.split('.').pop();
                if (extension == 'mp4') {
                    media.type = 'video';
                    let element = document.createElement('video');
                    element.setAttribute('id', `media-${index}`);
                    element.src = media.path;
                    if (media.width) element.width = media.width;
                    if (media.height) element.height = media.height;
                    element.controls = false;
                    element.classList.add(media.position);
                    element.classList.add('hidden');
                    container.appendChild(element);
                }
                if (extension == 'png') {
                    media.type = 'image';
                    let element = document.createElement('img');
                    element.setAttribute('id', `media-${index}`);
                    element.src = media.path;
                    if (media.width) element.width = media.width;
                    if (media.height) element.height = media.height;
                    element.classList.add(media.position);
                    element.classList.add('hidden');
                    container.appendChild(element);
                }
            }
        }

        // Send start and stop events
        this.io = io;

        // Get HTML elements handlers
        this.marker = document.getElementById("marker");
        this.dot = document.getElementById("dot");
        this.message = document.getElementById("message");
        this.ready = document.getElementById("ready");

        // Infinite scheduler to work around Chrome bug
        this.scheduler = new Scheduler();
    }

    async start() {
        this.scheduler.start();
        this.io.event('training_begins', this.options);
        if (this.options.baseline.enable) await this.baseline();
        if (this.options.motor.enable) await this.motor();
        if (this.options.blink.enable) await this.blink();
        this.io.event('training_ends');
        this.scheduler.stop();
    }

    async baseline() {
        if (this.options.baseline.duration > 0) {
            this.message.innerHTML = this.options.baseline.instruction;
            this.ready.classList.toggle('hidden');
            await key();
            this.message.innerHTML = '';
            this.ready.classList.toggle('hidden');
            this.marker.classList.toggle('hidden');
            this.io.event('baseline_begins')
            await sleep(this.options.baseline.duration);
            this.io.event('baseline_ends')
            this.marker.classList.toggle('hidden');
        }
    }

    async motor() {
        this.message.innerHTML = this.options.motor.instruction;
        this.ready.classList.toggle('hidden');
        await key();
        this.message.innerHTML = '';
        this.ready.classList.toggle('hidden');
        this.io.event('motor-training_begins');
        this.marker.classList.toggle('hidden');
        await sleep(this.options.motor.duration.prep);
        this.marker.classList.toggle('hidden');
        for (let block = 0; block < this.options.motor.blocks; block++) {
            /*
            if (this.options.motor.duration.rest == 0) {
                this.marker.classList.toggle('hidden');
                this.ready.classList.toggle('hidden');
                await key();
                this.marker.classList.toggle('hidden');
                this.message.innerHTML = '';
                this.ready.classList.toggle('hidden');
                await sleep(this.options.motor.duration.prep);
                this.marker.classList.toggle('hidden');
            }
            */
            this.io.event('block_begins');
            let trials = new BalancedRandom(this.options.motor.imagery.length, this.options.motor.trials);
            for (let trial = 0; trial < this.options.motor.trials; trial++) {
                //let id = Math.floor(Math.random() * this.options.motor.imagery.length);
                let id = trials.next();
                let media = document.getElementById(`media-${id}`);
                if (this.options.motor.media) {
                    if (this.options.motor.media[id].type == 'video') {
                        reset(media);
                    }
                    media.classList.toggle('hidden');
                    await sleep(this.options.motor.duration.pause);
                }
                await this.scheduler.asap(() => {
                    let message = this.options.motor.imagery[id];
                    if (this.options.motor.media) {
                        if (this.options.motor.media[id].type == 'video') {
                            play(media);
                        }
                    } else {
                        this.message.innerHTML = message;
                    }
                    this.io.event('trial_begins', { id: id, message: message });
                });
                await sleep(this.options.motor.duration.on);
                await this.scheduler.asap(() => {
                    if (this.options.motor.media) {
                        let media = document.getElementById(`media-${id}`);
                        media.classList.toggle('hidden');
                    } else {
                        this.message.innerHTML = "";
                    }
                    this.io.event('trial_ends');
                });
                await sleep(this.options.motor.duration.off);
            }
            this.io.event('block_ends');
            //if (this.options.motor.duration.rest > 0) {
            if (block + 1 < this.options.motor.blocks) {
                this.marker.classList.toggle('hidden');
                await sleep(this.options.motor.duration.rest);
                this.marker.classList.toggle('hidden');
                }
            //}
        }
        this.io.event('motor-training_ends');
    }

    async blink() {
        this.message.innerHTML = this.options.blink.instruction;
        this.ready.classList.toggle('hidden');
        await key();
        this.message.innerHTML = '';
        this.ready.classList.toggle('hidden');
        this.marker.classList.toggle('hidden');
        this.io.event('blink-training_begins');
        await sleep(this.options.blink.duration.prep);
        for (let trial = 1; trial <= this.options.blink.trials; trial++) {
            this.io.event('trial_begins');
            await this.scheduler.asap(() => {
                this.marker.classList.toggle('hidden');
                this.dot.classList.toggle('hidden');
                this.io.event('stim', { status: true });
            });
            await sleep(this.options.blink.duration.display);
            this.dot.classList.toggle('hidden');
            this.marker.classList.toggle('hidden');
            await sleep(this.options.blink.duration.stim - this.options.blink.duration.display);
            this.io.event('stim', { status: false });
            await sleep(this.options.blink.duration.stim);
            await sleep(this.options.blink.duration.display);
            let rest = Math.floor(Math.random() * (this.options.blink.duration.rest_max - this.options.blink.duration.rest_min + 1) + this.options.blink.duration.rest_min);
            await sleep(rest);
            this.io.event('trial_ends');
        }
        this.marker.classList.toggle('hidden');
        this.io.event('blink-training_ends');
    }

}


/**
 * Balanced random generator
 */
class BalancedRandom {

    /**
     *  Generate a balanced array of values
     *
     *  @param {number} n_classes
     *  @param {number} n_trials
     */
    constructor(n_classes, n_trials) {
        let items = [...Array(n_classes).keys()];
        this.values = Array.from({length: Math.ceil(n_trials / n_classes)}, () => items).flat();
        this.values = this.values.slice(0, n_trials);
        this._shuffle(this.values);
    }

    /**
     * Get the next element in array
     */
    next() {
        return this.values.shift();
    }

    /**
     * Shuffle an array
     *
     * This is done in-place. Make a copy first with .slice(0) if you don't want to
     * modify the original array.
     *
     * @param {array} array
     *
     * @see: https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm
     */
    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

}


/**
 * Play a video
 *
 * @param {string|object} DOM element or id
 */
function play(media) {
    if (!(media instanceof Element)) {
        media = document.getElementById(media);
    }
    media.play();
}

/**
 * Reset a video
 *
 * @param {string|object} DOM element or id
 */
function reset(media) {
    if (!(media instanceof Element)) {
        media = document.getElementById(media);
    }
    media.currentTime = 0;
}
