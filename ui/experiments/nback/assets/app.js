"use strict";

let io = new IO();

load_settings().then(settings => {
    let nback = new NBack(io, settings.nback);
    nback.start();
});

class NBack {

    /**
     * Initialize
     *
     * @param {number} [blocks] - number of blocks per session
     * @param {number} [trials] - number of trials per block
     * @param {number|array} {n} - how many symbols to look back, if an array will be updated at each block
     * @param {number} {p} - probability to get the same symbol as n-back (if 0, then p = 1 / n_symbols)
     * @param {number} [baseline] - baseline duration, in ms
     * @param {number} [display] - display duration, in ms
     * @param {number} [response] - response duration, in ms
     * @param {number} [intertrial] - intertrial duration, in ms
     * @param {string} [symbols] - list of symbols
     */

    constructor(io, options = {}) {

        // Default options
        let default_options = {
            blocks: 3,
            trials: 25,
            n: 2,
            p: .2,
            display: 500,
            response: 1000,
            intertrial: 2000,
            symbols: '1234567890'
        };

        // Merge options
        this.options = merge(default_options, options);

        // Set p
        if (this.options.p == 0) {
            this.options.p = 1 / this.options.symbols.length;
        }

        // Send start and stop events
        this.io = io;
        this.io.on('connect', () => this.io.event('session_begins', this.options));
        window.onbeforeunload = () => { this.io.event('session_ends'); }

        // Get HTML elements handlers
        this.instructions = document.getElementById('instructions');
        this.baseline = document.getElementById('baseline');
        this.marker = document.getElementById('marker');
        this.ready = document.getElementById('ready');
        this.ready_n = document.getElementById('ready_n');
        this.symbol = document.getElementById('symbol');

        // Listen to key press events
        this.active = false;
        document.addEventListener('keydown', this.on_key.bind(this));

        // Infinite scheduler to work around Chrome bug
        this.scheduler = new Scheduler();
    }

    async start() {
        this.scheduler.start();
        let score = { session: 0, block: 0};
        await key(32);
        this.instructions.classList.toggle('hidden');
        this.baseline.classList.toggle('hidden');
        await key();
        this.baseline.classList.toggle('hidden');
        this.marker.classList.toggle('hidden');
        this.io.event('baseline_begins');
        await sleep(this.options.baseline);
        this.io.event('baseline_ends');
        this.marker.classList.toggle('hidden');
        for (let block = 1; block <= this.options.blocks; block++) {
            let n;
            if (Array.isArray(this.options.n)) {
                n = this.options.n[block - 1];
                if (n === undefined) {
                    n = this.options.n[this.options.n.length - 1]
                }
            } else {
                n = this.options.n;
            }
            score.block = 0;
            this.ready_n.innerHTML = `n = ${n}`;
            this.ready.classList.toggle('hidden');
            await key(32);
            this.ready.classList.toggle('hidden');
            this.symbol.classList.toggle('hidden');
            this.buffer = [];
            this.io.event('block_begins', { n: n });
            for (let trial = 1; trial <= this.options.trials; trial++) {
                await sleep(this.options.intertrial);
                let symbol;
                if (this.buffer.length >= n && Math.random() <= this.options.p) {
                    symbol = this.buffer[this.buffer.length - n];
                } else {
                    let id = Math.floor(Math.random() * this.options.symbols.length);
                    symbol = this.options.symbols[id];
                }
                this.buffer.push(symbol);
                if (this.buffer.length > n + 1) {
                    this.buffer.shift();
                }
                this.match = this.buffer[0] == this.buffer[n] ? true : false;
                this.response = -1;
                this.result = 'timeout';
                this.io.event('trial_begins', { symbol: symbol });
                await this.scheduler.asap(() => {
                    this.symbol.innerHTML = symbol;
                    this.timer = performance.now();
                    if (this.buffer.length == n + 1) {
                        this.active = true;
                    }
                    this.io.event('display_on');
                });
                await sleep(this.options.display);
                await this.scheduler.asap(() => {
                    this.symbol.innerHTML = "";
                    this.io.event('display_off');
                });
                await sleep(this.options.response - (performance.now() - this.timer));
                this.active = false;
                await this.scheduler.asap(() => {
                    this.symbol.classList.remove('red');
                    this.symbol.classList.remove('green');
                    if (trial > n) {
                        if (this.result == 'failure' || (this.result == 'timeout' && this.match)) {
                            score.block--;
                            score.session--;
                        } else {
                            score.block++;
                            score.session++;
                        }
                    }
                    let event =  { block: block, trial: trial, symbol: symbol, buffer: this.buffer, result: this.result, response: this.response, score: score };
                    this.io.event('trial_ends', event);
                });
            }
            this.io.event('block_ends');
            this.symbol.classList.toggle('hidden');
        }
        this.scheduler.stop();
        this.instructions.classList.toggle('hidden');
    }

    on_key(event) {
        if (event.keyCode === 32 && this.active) {
            this.response = performance.now() - this.timer;
            this.active = false;
            if (this.match) {
                this.result = 'success';
                this.symbol.classList.add('green');
            } else {
                this.result = 'failure'
                this.symbol.classList.add('red');
            }
        }
    }

}
