/**
 * @file BCI grid controler
 * @author Pierre Clisson <pierre@clisson.com>
 */

'use strict';


/**
 * A 3-command BCI grid controler
 */
class Grid {

    /**
     * Initialize
     *
     * @param {Object} [io] - a Timeflux IO instance
     * @param {Object} [options]
     * @param {string} [options.symbols] - list of symbols
     * @param {Object} [options.shape]
     * @param {HTMLElement} [options.shape.element] - grid container DOM node
     * @param {number} [options.shape.columns] - number of columns in the grid
     * @param {string} [options.shape.ratio] - grid aspect ratio (examples: '1:1', '16:9', empty string means 100% width and 100% height)
     * @param {boolean} [options.shape.borders] - if the borders must be drawn
     * @param {boolean} [options.wrap] - if the selected cells must warp around
     */
    constructor(io, options = {}) {

        // Merge options
        let default_options = {
            symbols: '123456789',
            shape: {
                element: document.getElementById('grid'),
                columns: 3,
                //columns: 4,
                ratio: '',
                borders: true
            },
            wrap: false
            //wrap: true,
        };
        this.options = merge(default_options, options);

        // Set useful variables
        this.shape = {};
        this.shape.cols = this.options.shape.columns;
        this.shape.rows = Math.ceil(this.options.symbols.length / this.options.shape.columns);
        this.shape.cells = this.shape.cols * this.shape.rows;
        this.x = 0;
        this.y = 0;
        this.flip = false;
        this.active = true;
        this.action = false;

        // Draw grid
        this._make_grid();

        // Draw cursor
        this._update('reset');

        // Initialize events
        this.io = io;
        this.io.event('grid_begins', this.options);

        // Initialize scheduler
        this.scheduler = new Scheduler();
        this.scheduler.start();

    }

    /**
     * Add symbols to the grid
     */
    _make_grid() {
        let columns = this.shape.cols;
        let cells = this.shape.cells;
        this.options.shape.element.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        for (let i = 0; i < cells; i++) {
            let cell = document.createElement('div');
            cell.classList.add('cell');
            let x = i % this.shape.cols;
            let y = (i - x) / this.shape.cols;
            cell.classList.add(`pos_${x}_${y}`);
            const symbol = this.options.symbols[i];
            if (symbol) {
                cell.id = `target_${i}`;
                cell.textContent = symbol;
            }
            this.options.shape.element.appendChild(cell);
        }
        if (!this.options.shape.borders) set_css_var('--grid-border-size', '0');
        this._resize();
        window.onresize = this._resize.bind(this);
    }

    /**
     * Adjust font size relatively to the window size
     */
    _resize() {
        // Reset
        set_css_var('--grid-width', '100%');
        set_css_var('--grid-height', '100%');
        set_css_var('--grid-padding', '0');
        set_css_var('--font-size', '0px');
        // Compute sizes
        let columns = this.shape.cols;
        let rows = this.shape.rows;
        let grid_width = this.options.shape.element.clientWidth;
        let grid_height = this.options.shape.element.clientHeight;
        let grid_padding = 0;
        if (this.options.shape.ratio != '') {
            let ratio = this.options.shape.ratio.split(':');
            if (ratio[0] * grid_height >= grid_width * ratio[1]) {
                let height = (ratio[1] * grid_width) / ratio[0];
                grid_padding = (grid_height - height) / 2 + "px 0";
                grid_padding = Math.ceil((grid_height - height) / 2) + "px 0";
                grid_height = height;

            } else {
                let width = (ratio[0] * grid_height) / ratio[1];
                grid_padding = "0 " + (grid_width - width) / 2 + "px";
                grid_padding = "0 " + Math.ceil((grid_width - width) / 2) + "px";
                grid_width = width;
            }
        }
        let cell_width = grid_width / columns;
        let cell_height = grid_height / rows;
        let cell_size  = (cell_width > cell_height) ? cell_height : cell_width;
        let font_size = Math.ceil(cell_size * .5);
        // Adjust
        set_css_var('--grid-width', grid_width + 'px');
        set_css_var('--grid-height', grid_height + 'px');
        set_css_var('--grid-padding', grid_padding);
        set_css_var('--font-size',  font_size + 'px');
    }

    /**
     * Update a cell
     */
     _cell(x, y, style) {
        const element = document.querySelector(`.cell.pos_${x}_${y}`);
        element.classList.add(style);
     }

    /**
     * Update the cursor
     */
    _update(command) {

        Array.from(document.querySelectorAll('.cell')).forEach((el) => el.classList.remove('active'));
        Array.from(document.querySelectorAll('.cell')).forEach((el) => el.classList.remove('center'));
        Array.from(document.querySelectorAll('.cell')).forEach((el) => el.classList.remove('right'));
        Array.from(document.querySelectorAll('.cell')).forEach((el) => el.classList.remove('left'));

        // Refuse commands if an action is in progress
        if (this.action) return;

        // Toggle
        if (command == 'toggle') {
            this.active = !this.active;
            if (this.active) {
                speak('Ready for command.');
            } else {
                speak('Neural interface disabled.');
            }
        }
        if (!this.active) return;

        // Select
        if (command == 'select') {
            this._cell(this.x, this.y, 'active');
            this.action = true;
            const action = document.querySelector(`.cell.pos_${this.x}_${this.y}`).innerText;
            speak(action); // TODO: send event
            window.setTimeout(() => {
                this.action= false;
                this._update('reset');
            }, 1500);
            return;
        }

        // Reset
        if (command == 'reset') {
            this.flip = false;
            this.x = Math.floor(this.shape.cols / 2);
            this.y = Math.floor(this.shape.rows / 2);
        }

        // Flip
        if (command == 'flip') {
            this.flip = !this.flip;
        }

        // Left
        if (command == 'left') {
            if (this.flip) {
                if (this.y < (this.shape.rows - 1)) {
                    this.y++;
                } else if (this.options.wrap) {
                    this.y = 0;
                }
            } else {
                if (this.x > 0) {
                    this.x--;
                } else if (this.options.wrap) {
                    this.x = this.shape.rows - 1;
                }
            }
        }

        // Right
        if (command == 'right') {
            if (this.flip) {
                if (this.y > 0) {
                    this.y--;
                } else if (this.options.wrap) {
                    this.y = this.shape.cols - 1;
                }
            } else {
                if (this.x < (this.shape.cols - 1)) {
                    this.x++;
                } else if (this.options.wrap) {
                    this.x = 0;
                }
            }
        }

        // Update DOM
        this._cell(this.x, this.y, 'center');
        let x = 0;
        let y = 0;
        if (this.flip) {
            // Left
            y = this.y + 1;
            if (y < this.shape.rows) {
                this._cell(this.x, y, 'left');
            } else if (this.options.wrap) {
                this._cell(this.x, 0, 'left');
            }
            // Right
            y = this.y - 1;
            if (y >= 0) {
                this._cell(this.x, y, 'right');
            } else if (this.options.wrap) {
                this._cell(this.x, this.shape.rows - 1, 'right');
            }
        } else {
            // Left
            x = this.x - 1;
            if (x >= 0) {
                this._cell(x, this.y, 'left');
            } else if (this.options.wrap) {
                this._cell(this.shape.cols - 1, this.y, 'left');
            }
            // Right
            x = this.x + 1;
            if (x < this.shape.cols) {
                this._cell(x, this.y, 'right');
            } else if (this.options.wrap) {
                this._cell(0, this.y, 'right');
            }
        }

    }

    /**
     * Feedback
     */
    _feedback(scores) {
        Array.from(document.querySelectorAll('.cell')).forEach((el) => el.removeAttribute('style'));
        const cells = ['left', 'right'];
        for (const i in cells) {
            const element = document.getElementsByClassName(cells[i])[0]
            if (element != undefined) {
                element.setAttribute('style', `opacity: ${scores[i]}`);
            }
        }
    }

}

