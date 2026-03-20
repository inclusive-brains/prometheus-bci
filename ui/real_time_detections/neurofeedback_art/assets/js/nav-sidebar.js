'use strict';

class NavSidebar extends HTMLElement {
    connectedCallback() {
        const active = this.getAttribute('active') || '';
        const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';

        this.innerHTML = `
        <aside class="sidebar${collapsed ? ' collapsed' : ''}" role="navigation" aria-label="Main navigation">
            <div class="sidebar-header">
                <div class="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg></div>
                <div class="logo-text">
                    <span class="logo-title">Prometheus</span>
                    <span class="logo-subtitle">BCI Platform</span>
                </div>
                <button class="sidebar-toggle" aria-label="Toggle sidebar" title="Toggle sidebar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M15 18l-6-6 6-6"/>
                    </svg>
                </button>
            </div>

            <nav class="sidebar-nav">
                <div class="nav-section">
                    <span class="nav-section-label">Monitor</span>
                    ${this._link('/dashboard', 'Dashboard', active, `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`)}
                </div>

                <div class="nav-section">
                    <span class="nav-section-label">Signals</span>
                    ${this._link('/brain_metrics', 'Brainwaves', active, `<path d="M2 12h4l3-9 4 18 3-9h6"/>`)}
                    ${this._link('/eeg_quality', 'EEG Quality', active, `<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>`)}
                    ${this._link('/heart_metrics', 'Heart Activity', active, `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>`)}
                    ${this._link('/facial_expressions', 'Facial Expressions', active, `<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>`)}
                    ${this._link('/head_motions', 'Head Movements', active, `<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`)}
                    ${this._link('/multimodal', 'Multimodal', active, `<circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10"/><path d="M12 2a15 15 0 0 0-4 10 15 15 0 0 0 4 10"/><path d="M2 12h20"/>`)}
                    ${this._link('/neurofeedback_art', 'Neurofeedback', active, `<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>`)}
                </div>

                <div class="nav-section">
                    <span class="nav-section-label">Control</span>
                    ${this._link('/mind_control_training', 'Calibration', active, `<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>`)}
                    ${this._link('/obi1', 'Mind Keyboard', active, `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>`)}
                    ${this._link('/prometheus', 'Prometheus v1', active, `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/>`)}
                    ${this._link('/prometheus_2', 'Prometheus v2', active, `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/>`)}
                    ${this._link('/robotic_arm', 'Robotic Arm', active, `<path d="M18 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M18 8v6a2 2 0 0 1-2 2H8"/><path d="M8 16l-4 4"/><path d="M8 16l4 4"/><path d="M4 4h4v4H4z"/>`)}
                </div>

                <div class="nav-section">
                    <span class="nav-section-label">Experiments</span>
                    ${this._link('/n_back', 'N-back Task', active, `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`)}
                </div>
            </nav>

            <div class="sidebar-footer">
                <div class="connection-status">
                    <span class="status-dot" id="statusDot"></span>
                    <span class="status-text" id="statusText">Connecting...</span>
                </div>
            </div>
        </aside>
        `;

        this.querySelector('.sidebar-toggle').addEventListener('click', () => {
            const sidebar = this.querySelector('.sidebar');
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    _link(href, label, active, iconPaths) {
        const isActive = active === href ? ' active' : '';
        const ariaCurrent = isActive ? ' aria-current="page"' : '';
        return `<a href="${href}" class="nav-item${isActive}"${ariaCurrent}>
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${iconPaths}</svg>
            <span class="nav-label">${label}</span>
        </a>`;
    }
}

customElements.define('nav-sidebar', NavSidebar);

// Helper: safely update connection status from any page's app.js
function updateConnectionStatus(state) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;
    dot.classList.remove('connected', 'disconnected');
    if (state === 'connected') {
        dot.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        dot.classList.add('disconnected');
        text.textContent = 'Disconnected';
    }
}
