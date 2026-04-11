/**
 * Visual Integration Tool - Main Entry
 */
import { initSeries } from './state.js';
import { initCanvas } from './canvas.js';
import { setupUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize State
    initSeries(); // Create default Series 1

    // 2. Initialize Canvas
    const canvasEl = document.getElementById('integrationCanvas');
    initCanvas(canvasEl);

    // 3. Bind UI Events
    setupUI();

    // Listen for theme changes from shared.js to re-render canvas
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                import('./canvas.js').then(module => module.draw());
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true });
});