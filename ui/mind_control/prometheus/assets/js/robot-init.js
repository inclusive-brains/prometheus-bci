/**
 * Robot 3D initialization for Prometheus v1.
 * Connects the BCI exoskeleton controls (Up/Down/Stop) to the 3D robot arm.
 */
import { RobotViewer } from './robot3d.js';

let robotViewer = null;

function updateCommandUI(command) {
    const dot = document.getElementById('robotCommandDot');
    const text = document.getElementById('robotCommandText');
    if (!dot || !text) return;

    if (command === 'up') {
        dot.style.background = 'var(--green)';
        dot.style.boxShadow = '0 0 6px var(--green)';
        text.textContent = 'Moving Up';
        text.style.color = 'var(--green)';
    } else if (command === 'down') {
        dot.style.background = 'var(--amber)';
        dot.style.boxShadow = '0 0 6px var(--amber)';
        text.textContent = 'Moving Down';
        text.style.color = 'var(--amber)';
    } else {
        dot.style.background = 'var(--text-tertiary)';
        dot.style.boxShadow = 'none';
        text.textContent = 'Idle';
        text.style.color = 'var(--text-tertiary)';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('robot3dContainer');
    const loadingOverlay = document.getElementById('robotLoadingOverlay');
    const loadingText = document.getElementById('robotLoadingText');
    const statusBadge = document.getElementById('robotStatus');

    if (!container) return;

    robotViewer = new RobotViewer();

    try {
        await robotViewer.init(
            container,
            (msg) => { if (loadingText) loadingText.textContent = msg; },
            (status, msg) => {
                if (status === 'ready') {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    if (statusBadge) { statusBadge.textContent = 'Live'; }
                } else if (status === 'error') {
                    if (loadingText) loadingText.textContent = msg;
                    if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.style.color = 'var(--red)'; statusBadge.style.background = 'var(--red-dim)'; }
                }
            }
        );

        // Wire Up button
        const btnUp = document.getElementById('sendCommandButtonB');
        if (btnUp) {
            btnUp.addEventListener('mousedown', () => { robotViewer.moveUp(); updateCommandUI('up'); });
            btnUp.addEventListener('mouseup', () => { robotViewer.stop(); updateCommandUI('idle'); });
            btnUp.addEventListener('mouseleave', () => { robotViewer.stop(); updateCommandUI('idle'); });
            // Also support click for toggle behavior
            btnUp.addEventListener('click', () => { robotViewer.moveUp(); updateCommandUI('up'); });
        }

        // Wire Down button
        const btnDown = document.getElementById('sendCommandButtonA');
        if (btnDown) {
            btnDown.addEventListener('mousedown', () => { robotViewer.moveDown(); updateCommandUI('down'); });
            btnDown.addEventListener('mouseup', () => { robotViewer.stop(); updateCommandUI('idle'); });
            btnDown.addEventListener('mouseleave', () => { robotViewer.stop(); updateCommandUI('idle'); });
            btnDown.addEventListener('click', () => { robotViewer.moveDown(); updateCommandUI('down'); });
        }

        // Wire Stop button
        const btnStop = document.getElementById('sendCommandButtonC');
        if (btnStop) {
            btnStop.addEventListener('click', () => { robotViewer.stop(); updateCommandUI('idle'); });
        }

    } catch (err) {
        console.error('Robot3D init failed:', err);
        if (loadingText) loadingText.textContent = 'Failed to load robot: ' + err.message;
        if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.style.color = 'var(--red)'; statusBadge.style.background = 'var(--red-dim)'; }
    }
});

// Expose robotViewer globally so the BCI data stream can drive it
window.robotViewer = { get: () => robotViewer };
