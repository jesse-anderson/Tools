/* ============================================
   TOOLS HUB - SHARED JAVASCRIPT
   ============================================ */

// Theme Management
const ThemeManager = {
    init() {
        // Check for saved theme preference or system preference
        const savedTheme = localStorage.getItem('toolsTheme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else if (systemPrefersDark) {
            this.setTheme('dark');
        } else {
            this.setTheme('dark'); // Default to dark
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('toolsTheme')) {
                this.setTheme(e.matches ? 'dark' : 'light');
            }
        });

        // Setup toggle buttons
        this.setupToggleButtons();
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('toolsTheme', theme);
        this.updateToggleButtons(theme);
    },

    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    },

    toggle() {
        const current = this.getTheme();
        this.setTheme(current === 'dark' ? 'light' : 'dark');
    },

    setupToggleButtons() {
        document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.themeToggle;
                if (theme === 'toggle') {
                    this.toggle();
                } else {
                    this.setTheme(theme);
                }
            });
        });
    },

    updateToggleButtons(theme) {
        document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
            const btnTheme = btn.dataset.themeToggle;
            if (btnTheme === 'dark' || btnTheme === 'light') {
                btn.classList.toggle('active', btnTheme === theme);
            }
        });
    }
};

// Copy to Clipboard
const Clipboard = {
    async copy(text, feedbackElement = null) {
        try {
            await navigator.clipboard.writeText(text);
            if (feedbackElement) {
                const originalText = feedbackElement.textContent;
                feedbackElement.textContent = 'Copied!';
                setTimeout(() => {
                    feedbackElement.textContent = originalText;
                }, 1500);
            }
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }
};

// Number Formatting
const NumberFormat = {
    // Format number with appropriate precision
    format(num, maxDecimals = 10) {
        if (num === 0) return '0';
        if (!isFinite(num)) return num > 0 ? '∞' : '-∞';
        
        const absNum = Math.abs(num);
        
        // Use scientific notation for very large or small numbers
        if (absNum >= 1e10 || (absNum < 1e-6 && absNum > 0)) {
            return num.toExponential(6);
        }
        
        // Otherwise use fixed notation with smart precision
        const str = num.toPrecision(12);
        const parsed = parseFloat(str);
        
        // Remove trailing zeros
        return parsed.toString();
    },

    // Parse number from various formats
    parse(str) {
        if (typeof str === 'number') return str;
        str = str.toString().trim();
        
        // Handle scientific notation
        if (/[eE]/.test(str)) {
            return parseFloat(str);
        }
        
        // Remove commas and spaces
        str = str.replace(/[,\s]/g, '');
        
        return parseFloat(str);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
});

// Export for use in other scripts
window.ToolsHub = {
    ThemeManager,
    Clipboard,
    NumberFormat
};