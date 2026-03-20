'use strict';

/* ════════════════════════════════════════════════════════════════
   Settings — Configuration UI
   ════════════════════════════════════════════════════════════════
   Reads the current .env configuration and lets the user modify
   parameters. Changes are saved to .env and applied on next
   Timeflux restart.
   ════════════════════════════════════════════════════════════════ */

// ── Schema (mirrors setup_ui.py) ────────────────────────────────
const SCHEMA = [
    {
        section: 'Devices',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>`,
        fields: [
            { key: 'PPG_DEVICE', label: 'PPG Device', type: 'select', default: 'fake',
              description: 'Photoplethysmography sensor', options: ['fake', 'emotibit'] },
            { key: 'ECG', label: 'ECG Serial Port', type: 'text', default: '',
              description: 'BITalino serial port (leave empty to disable)', placeholder: '/dev/tty.BITalino-XX-XX' },
            { key: 'CAMERA_ENABLE', label: 'Camera', type: 'bool', default: 'false',
              description: 'Enable facial expression detection via camera' },
        ],
    },
    {
        section: 'Training — Baseline',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h4l3-9 4 18 3-9h6"/></svg>`,
        fields: [
            { key: 'BASELINE_ENABLE', label: 'Baseline Recording', type: 'bool', default: 'false',
              description: 'Record a resting-state baseline before training' },
            { key: 'BASELINE_DURATION', label: 'Duration', type: 'number', default: '45000',
              description: 'Baseline duration in milliseconds', unit: 'ms' },
        ],
    },
    {
        section: 'Training — Motor Imagery',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>`,
        fields: [
            { key: 'MOTOR_ENABLE', label: 'Motor Training', type: 'bool', default: 'true',
              description: 'Enable motor imagery training paradigm' },
            { key: 'MOTOR_IMAGERY', label: 'Imagery Type', type: 'select', default: 'generic',
              description: 'Type of motor imagery task', options: ['generic', 'rotation', 'extension', 'flexion'] },
            { key: 'MOTOR_BLOCKS', label: 'Blocks', type: 'number', default: '20',
              description: 'Number of blocks per session' },
            { key: 'MOTOR_TRIALS', label: 'Trials', type: 'number', default: '10',
              description: 'Number of trials per block' },
        ],
    },
    {
        section: 'Training — Blink Detection',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        fields: [
            { key: 'BLINK_ENABLE', label: 'Blink Training', type: 'bool', default: 'true',
              description: 'Enable blink detection training' },
            { key: 'BLINK_TRIALS', label: 'Trials', type: 'number', default: '12',
              description: 'Total number of blink trials' },
        ],
    },
    {
        section: 'OSC Output',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>`,
        fields: [
            { key: 'OSC_ENABLE', label: 'OSC Streaming', type: 'bool', default: 'false',
              description: 'Stream data via Open Sound Control protocol' },
            { key: 'OSC_IP', label: 'IP Address', type: 'text', default: '127.0.0.1',
              description: 'Target OSC server IP' },
            { key: 'OSC_PORT', label: 'Port', type: 'number', default: '5005',
              description: 'Target OSC server port' },
        ],
    },
    {
        section: 'Paths & Models',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        fields: [
            { key: 'WARMUP_BLINK', label: 'Warmup — Blink', type: 'text', default: '',
              description: 'Path to warmup data for blink detection', placeholder: './data/warmup_blink.hdf5' },
            { key: 'WARMUP_MOTOR', label: 'Warmup — Motor', type: 'text', default: '',
              description: 'Path to warmup data for motor imagery', placeholder: './data/warmup_motor.hdf5' },
            { key: 'MODEL_BLINK', label: 'Model — Blink', type: 'text', default: '',
              description: 'Pre-computed blink model (skips training if set)', placeholder: './models/blink.pkl' },
            { key: 'MODEL_MOTOR', label: 'Model — Motor', type: 'text', default: '',
              description: 'Pre-computed motor model (skips training if set)', placeholder: './models/motor.pkl' },
            { key: 'TIMEFLUX_LOG_FILE', label: 'Log File', type: 'text', default: './logs/%Y%m%d-%H%M%S.log',
              description: 'Log file path pattern' },
            { key: 'TIMEFLUX_DATA_PATH', label: 'Data Directory', type: 'text', default: './data',
              description: 'Directory for recorded data' },
        ],
    },
];

const HEADSETS = [
    { id: 'dummy', name: 'Dummy', brand: 'Simulated',
      description: 'Fake signal generator for testing and development',
      channels: '5 ch', rate: '128 Hz', color: '#63636e', tag: 'Dev' },
    { id: 'emotiv_insight', name: 'INSIGHT', brand: 'EMOTIV',
      description: '5-channel lightweight EEG for everyday brain monitoring',
      channels: '5 ch', rate: '128 Hz', color: '#a78bfa', tag: 'Wellness' },
    { id: 'emotiv_epochX', name: 'EPOCH X', brand: 'EMOTIV',
      description: '14-channel high-resolution research-grade headset',
      channels: '14 ch', rate: '256 Hz', color: '#22d3ee', tag: 'Research' },
    { id: 'emotiv_epoch+', name: 'EPOCH+', brand: 'EMOTIV',
      description: '14-channel wireless headset with saline sensors',
      channels: '14 ch', rate: '256 Hz', color: '#06b6d4', tag: 'Research' },
    { id: 'emotiv_mn8', name: 'MN8', brand: 'EMOTIV',
      description: '2-channel in-ear EEG for workplace focus tracking',
      channels: '2 ch', rate: '128 Hz', color: '#f59e0b', tag: 'Wellness' },
    { id: 'emotiv_mw20', name: 'MW20', brand: 'EMOTIV',
      description: '2-channel in-ear EEG headset for brain activity monitoring',
      channels: '2 ch', rate: '128 Hz', color: '#ec4899', tag: 'Wellness' },
    { id: 'brainflow_synthetic', name: 'Synthetic', brand: 'BrainFlow',
      description: 'Realistic synthetic EEG signals for testing and development',
      channels: '16 ch', rate: '250 Hz', color: '#64748b', tag: 'Dev', status: 'to_test' },
    { id: 'brainflow_muse2', name: 'Muse 2', brand: 'Muse',
      description: '4-channel consumer EEG headband for meditation and focus',
      channels: '4 ch', rate: '256 Hz', color: '#10b981', tag: 'Wellness', status: 'to_test' },
    { id: 'brainflow_muse_s', name: 'Muse S', brand: 'Muse',
      description: '4-channel sleep and meditation EEG with soft headband',
      channels: '4 ch', rate: '256 Hz', color: '#34d399', tag: 'Wellness', status: 'to_test' },
    { id: 'brainflow_ganglion', name: 'Ganglion', brand: 'OpenBCI',
      description: '4-channel open-source biosensing board via BrainFlow',
      channels: '4 ch', rate: '200 Hz', color: '#3b82f6', tag: 'Research', status: 'to_test' },
    { id: 'brainflow_unicorn', name: 'Unicorn', brand: 'g.tec',
      description: '8-channel hybrid EEG for BCI research and neurofeedback',
      channels: '8 ch', rate: '250 Hz', color: '#8b5cf6', tag: 'Research', status: 'to_test' },
    { id: 'brainflow_crown', name: 'Crown', brand: 'Neurosity',
      description: '8-channel EEG for focus tracking and productivity',
      channels: '8 ch', rate: '256 Hz', color: '#e879f9', tag: 'Wellness', status: 'to_test' },
];

const HEADSET_SVGS = {
    dummy: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h6"/></svg>',
    emotiv_insight: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 4.5 3 6v4h3v-2h8v2h3v-4c1.5-1.5 3-3.5 3-6 0-4-4.48-8-10-8z"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>',
    emotiv_epochX: '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><circle cx="7" cy="9" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15.5" cy="11" r="1"/></svg>',
    'emotiv_epoch+': '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><circle cx="7" cy="9" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15.5" cy="11" r="1"/><path d="M19 13h3M20.5 11.5v3"/></svg>',
    emotiv_mn8: '<svg viewBox="0 0 24 24"><ellipse cx="8" cy="12" rx="4" ry="6"/><ellipse cx="16" cy="12" rx="4" ry="6"/><path d="M12 8c0-2 1-4 3-4M12 8c0-2-1-4-3-4"/></svg>',
    emotiv_mw20: '<svg viewBox="0 0 24 24"><ellipse cx="8" cy="12" rx="4" ry="6"/><ellipse cx="16" cy="12" rx="4" ry="6"/><path d="M12 8c0-2 1-4 3-4M12 8c0-2-1-4-3-4"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>',
    brainflow_synthetic: '<svg viewBox="0 0 24 24"><path d="M2 12h4l3-9 4 18 3-9h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    brainflow_muse2: '<svg viewBox="0 0 24 24"><path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M6 12c0 2 1.5 4 3 5M18 12c0 2-1.5 4-3 5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>',
    brainflow_muse_s: '<svg viewBox="0 0 24 24"><path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M6 12c0 2 1.5 4 3 5M18 12c0 2-1.5 4-3 5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 17h8" stroke-dasharray="2 2"/></svg>',
    brainflow_ganglion: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg>',
    brainflow_unicorn: '<svg viewBox="0 0 24 24"><path d="M4 10c0-4.4 3.6-8 8-8s8 3.6 8 8"/><path d="M4 10c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7"/><path d="M12 2V0"/><circle cx="8" cy="10" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="14" cy="8" r="1"/><circle cx="16" cy="10" r="1"/></svg>',
    brainflow_crown: '<svg viewBox="0 0 24 24"><path d="M3 18L5 8l4 4 3-6 3 6 4-4 2 10z"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
};

// ── State ────────────────────────────────────────────────────────
let currentEnv = {};
let selectedHeadset = 'dummy';

// ── Load current .env via the setup_ui API ──────────────────────
// The settings page reads the .env file through an internal API
// Since we're served by Timeflux (not setup_ui.py), we parse
// the env from the page's data attributes or use defaults.

function loadEnvFromDefaults() {
    // Initialize from schema defaults
    currentEnv = {};
    SCHEMA.forEach(section => {
        section.fields.forEach(field => {
            currentEnv[field.key] = field.default;
        });
    });
    currentEnv.EEG_DEVICE = 'dummy';
}

// ── Headset Rendering ───────────────────────────────────────────

function buildCard(h, experimental) {
    const card = document.createElement('div');
    card.className = 'headset-card' + (h.id === selectedHeadset ? ' selected' : '') + (experimental ? ' experimental' : '');
    card.dataset.headsetId = h.id;
    card.style.setProperty('--card-color', h.color);
    card.onclick = () => selectHeadset(h.id);

    card.innerHTML = `
        <div class="headset-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
        <span class="headset-tag">${h.tag}</span>
        <div class="headset-icon">${HEADSET_SVGS[h.id] || HEADSET_SVGS.dummy}</div>
        <div class="headset-brand">${h.brand}</div>
        <div class="headset-name">${h.name}</div>
        <div class="headset-desc">${h.description}</div>
        ${experimental ? '<span class="headset-status">to test</span>' : ''}
        <div class="headset-specs">
            <span class="headset-spec">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                ${h.channels}
            </span>
            <span class="headset-spec">
                <svg viewBox="0 0 24 24"><path d="M2 12h4l3-9 4 18 3-9h6"/></svg>
                ${h.rate}
            </span>
        </div>
    `;
    return card;
}

function renderHeadsets() {
    const grid = document.getElementById('headsetGrid');
    const gridExp = document.getElementById('headsetGridExp');
    grid.innerHTML = '';
    gridExp.innerHTML = '';

    const stable = HEADSETS.filter(h => !h.status);
    const experimental = HEADSETS.filter(h => h.status === 'to_test');

    stable.forEach(h => grid.appendChild(buildCard(h, false)));
    experimental.forEach(h => gridExp.appendChild(buildCard(h, true)));

    document.getElementById('expanderCount').textContent = experimental.length + ' devices';
    updateHeadsetValue();

    // Auto-open expander if experimental headset is selected
    if (experimental.some(h => h.id === selectedHeadset)) {
        toggleExpander(true);
    }
}

function selectHeadset(id) {
    selectedHeadset = id;
    document.querySelectorAll('.headset-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.headsetId === id);
    });
    updateHeadsetValue();
}

function updateHeadsetValue() {
    const h = HEADSETS.find(h => h.id === selectedHeadset);
    const el = document.getElementById('headsetValue');
    if (el && h) el.textContent = h.brand + ' ' + h.name;
}

function toggleExpander(forceOpen) {
    const toggle = document.getElementById('expanderToggle');
    const body = document.getElementById('expanderBody');
    const isOpen = body.classList.contains('open');
    const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
    toggle.classList.toggle('open', shouldOpen);
    body.classList.toggle('open', shouldOpen);
}

// ── Config Sections Rendering ───────────────────────────────────

function renderSections() {
    const container = document.getElementById('configSections');
    container.innerHTML = '';

    SCHEMA.forEach((section, si) => {
        const sectionEl = document.createElement('section');
        sectionEl.className = 'settings-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.dataset.toggle = 'section-' + si;

        // Count active values for summary
        const activeCount = section.fields.filter(f => {
            const val = currentEnv[f.key] || f.default;
            return val && val !== '' && val !== 'false';
        }).length;

        header.innerHTML = `
            <span class="section-icon">${section.icon}</span>
            <h2 class="section-title">${section.section}</h2>
            <span class="section-value">${activeCount}/${section.fields.length} active</span>
            <span class="section-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </span>
        `;

        const body = document.createElement('div');
        body.className = 'section-body';
        body.id = 'body-section-' + si;

        section.fields.forEach(field => {
            const row = document.createElement('div');
            row.className = 'field-row';
            const val = currentEnv[field.key] !== undefined ? currentEnv[field.key] : field.default;

            let inputHtml = '';
            if (field.type === 'select') {
                const opts = (field.options || []).map(o =>
                    `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                ).join('');
                inputHtml = `<select class="settings-select" data-key="${field.key}">${opts}</select>`;
            } else if (field.type === 'bool') {
                const on = val === 'true';
                inputHtml = `
                    <div class="toggle ${on ? 'on' : ''}" data-key="${field.key}">
                        <div class="knob"></div>
                    </div>
                    <span class="toggle-label">${on ? 'On' : 'Off'}</span>
                `;
            } else if (field.type === 'number') {
                inputHtml = `<input class="settings-input" type="number" data-key="${field.key}" value="${val}" placeholder="${field.default}">`;
                if (field.unit) inputHtml += `<span class="field-unit">${field.unit}</span>`;
            } else {
                inputHtml = `<input class="settings-input" type="text" data-key="${field.key}" value="${val}" placeholder="${field.placeholder || field.default}">`;
            }

            row.innerHTML = `
                <label class="field-label">
                    <span class="field-name">${field.label}</span>
                    <span class="field-desc">${field.description || ''}</span>
                </label>
                <div class="field-input">${inputHtml}</div>
            `;
            body.appendChild(row);
        });

        // Toggle click handler
        header.addEventListener('click', () => {
            header.classList.toggle('open');
            body.classList.toggle('open');
        });

        sectionEl.appendChild(header);
        sectionEl.appendChild(body);
        container.appendChild(sectionEl);
    });

    // Bind toggle clicks
    document.querySelectorAll('.toggle').forEach(el => {
        el.addEventListener('click', () => {
            const on = !el.classList.contains('on');
            el.classList.toggle('on', on);
            const label = el.nextElementSibling;
            if (label && label.classList.contains('toggle-label')) {
                label.textContent = on ? 'On' : 'Off';
            }
        });
    });
}

// ── Headset section toggle ──────────────────────────────────────

function initHeadsetSection() {
    const header = document.querySelector('#sectionHeadset .section-header');
    const body = document.getElementById('bodyHeadset');
    if (header && body) {
        // Start open
        header.classList.add('open');
        body.classList.add('open');
        header.addEventListener('click', () => {
            header.classList.toggle('open');
            body.classList.toggle('open');
        });
    }

    document.getElementById('expanderToggle').addEventListener('click', () => {
        toggleExpander();
    });
}

// ── Collect values ──────────────────────────────────────────────

function collectValues() {
    const values = { EEG_DEVICE: selectedHeadset };
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (el.classList.contains('toggle')) {
            values[key] = el.classList.contains('on') ? 'true' : 'false';
        } else {
            values[key] = el.value;
        }
    });
    return values;
}

// ── Reset defaults ──────────────────────────────────────────────

function resetDefaults() {
    selectedHeadset = 'dummy';
    loadEnvFromDefaults();
    renderHeadsets();
    renderSections();
    showToast('Reset to defaults', 'warning');
}

// ── Save configuration ──────────────────────────────────────────
// Tries to save via the setup_ui.py API (port 8888) if running,
// otherwise stores to localStorage as fallback.

async function saveConfig() {
    const values = collectValues();

    // Try the setup_ui.py API first
    try {
        const resp = await fetch('http://localhost:8888/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        });
        if (resp.ok) {
            showToast('Configuration saved — restart Timeflux to apply');
            return;
        }
    } catch (e) {
        // setup_ui.py not running, that's expected
    }

    // Fallback: save to localStorage
    localStorage.setItem('prometheus-settings', JSON.stringify(values));
    showToast('Configuration saved locally — run setup UI to write .env', 'warning');
}

// ── Toast ────────────────────────────────────────────────────────

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    const text = toast.querySelector('.toast-text');
    text.textContent = msg;
    toast.className = 'toast-container show' + (type ? ' ' + type : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ── Load saved settings from localStorage ───────────────────────

function loadFromLocalStorage() {
    const saved = localStorage.getItem('prometheus-settings');
    if (saved) {
        try {
            const values = JSON.parse(saved);
            Object.assign(currentEnv, values);
            if (values.EEG_DEVICE) selectedHeadset = values.EEG_DEVICE;
        } catch (e) {
            // ignore parse errors
        }
    }
}

// ── Restart Timeflux ─────────────────────────────────────────────
// Sends a restart request. The Timeflux process will be restarted
// by the orchestrator (make run / systemd / docker).

async function restartTimeflux() {
    const btn = document.getElementById('btnRestart');
    btn.classList.add('restarting');
    btn.querySelector('svg').nextSibling.textContent = ' Restarting...';

    // Save config first if possible
    await saveConfig();

    showToast('Restarting Timeflux — page will reconnect automatically');

    // Try to trigger restart via setup_ui API
    try {
        await fetch('http://localhost:8888/restart', { method: 'POST' });
    } catch (e) {
        // setup_ui.py not running — show manual instruction
    }

    // Wait for disconnection then poll for reconnection
    let reconnectAttempts = 0;
    const maxAttempts = 30;
    const pollInterval = setInterval(async () => {
        reconnectAttempts++;
        try {
            const resp = await fetch(window.location.href, { method: 'HEAD', cache: 'no-cache' });
            if (resp.ok) {
                clearInterval(pollInterval);
                btn.classList.remove('restarting');
                btn.querySelector('svg').nextSibling.textContent = ' Restart Timeflux';
                showToast('Timeflux restarted successfully');
                // Reload to get fresh state
                setTimeout(() => window.location.reload(), 1000);
                return;
            }
        } catch (e) {
            // Still restarting
        }
        if (reconnectAttempts >= maxAttempts) {
            clearInterval(pollInterval);
            btn.classList.remove('restarting');
            btn.querySelector('svg').nextSibling.textContent = ' Restart Timeflux';
            showToast('Could not confirm restart — check terminal', 'error');
        }
    }, 2000);
}

// ── Timeflux Connection ─────────────────────────────────────────
let io;

function initTimeflux() {
    io = new IO();
    io.on('connect', () => updateConnectionStatus('connected'));
    io.on('disconnect', () => updateConnectionStatus('disconnected'));
}

// ── Boot ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadEnvFromDefaults();
    loadFromLocalStorage();
    renderHeadsets();
    renderSections();
    initHeadsetSection();

    // Action buttons
    document.getElementById('btnReset').addEventListener('click', resetDefaults);
    document.getElementById('btnSave').addEventListener('click', saveConfig);
    document.getElementById('btnRestart').addEventListener('click', restartTimeflux);

    // Timeflux connection
    if (typeof IO !== 'undefined') {
        initTimeflux();
    } else {
        const check = setInterval(() => {
            if (typeof IO !== 'undefined') {
                clearInterval(check);
                initTimeflux();
            }
        }, 200);
    }
});
