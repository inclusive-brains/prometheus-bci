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
    const overlay = document.getElementById('robotLoadingOverlay');
    const loadingText = document.getElementById('robotLoadingText');
    const badge = document.getElementById('robotBadge');
    const badgeText = document.getElementById('robotStatusText');

    if (!container) return;

    robotViewer = new RobotViewer();

    try {
        await robotViewer.init(
            container,
            (msg) => { if (loadingText) loadingText.textContent = msg; },
            (status, msg) => {
                if (status === 'ready') {
                    if (overlay) overlay.style.display = 'none';
                    if (badge) badge.classList.add('ready');
                    if (badgeText) badgeText.textContent = 'Franka Panda — Live';
                } else if (status === 'error') {
                    if (loadingText) loadingText.textContent = msg;
                    if (badge) badge.classList.add('error');
                    if (badgeText) badgeText.textContent = 'Error';
                }
            }
        );

        // Up
        const btnUp = document.getElementById('btnUp');
        btnUp.addEventListener('mousedown', () => { robotViewer.moveUp(); updateCommandUI('up'); });
        btnUp.addEventListener('mouseup', () => { robotViewer.stop(); updateCommandUI('idle'); });
        btnUp.addEventListener('mouseleave', () => { if (robotViewer.getCommand() === 'up') { robotViewer.stop(); updateCommandUI('idle'); } });

        // Down
        const btnDown = document.getElementById('btnDown');
        btnDown.addEventListener('mousedown', () => { robotViewer.moveDown(); updateCommandUI('down'); });
        btnDown.addEventListener('mouseup', () => { robotViewer.stop(); updateCommandUI('idle'); });
        btnDown.addEventListener('mouseleave', () => { if (robotViewer.getCommand() === 'down') { robotViewer.stop(); updateCommandUI('idle'); } });

        // Stop
        document.getElementById('btnStop').addEventListener('click', () => {
            robotViewer.stop();
            updateCommandUI('idle');
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.key === 'ArrowUp' || e.key === 'w') { robotViewer.moveUp(); updateCommandUI('up'); }
            if (e.key === 'ArrowDown' || e.key === 's') { robotViewer.moveDown(); updateCommandUI('down'); }
            if (e.key === ' ' || e.key === 'Escape') { robotViewer.stop(); updateCommandUI('idle'); }
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ArrowDown' || e.key === 's') {
                robotViewer.stop();
                updateCommandUI('idle');
            }
        });

    } catch (err) {
        console.error('Robot3D init failed:', err);
        if (loadingText) loadingText.textContent = 'Failed: ' + err.message;
        if (badge) badge.classList.add('error');
        if (badgeText) badgeText.textContent = 'Error';
    }
});
