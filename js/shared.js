/* ============================================
   TOOLS HUB - SHARED JAVASCRIPT MODULE
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
                const isActive = btnTheme === theme;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', isActive.toString());
            }
        });
    }
};

// Copy to Clipboard
const Clipboard = {
    /**
     * Copy text to clipboard with fallback for older browsers
     * @param {string} text - Text to copy
     * @param {HTMLElement} feedbackElement - Optional element to show feedback
     * @returns {Promise<boolean>} Success status
     */
    async copy(text, feedbackElement = null) {
        // Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                this.showFeedback(feedbackElement);
                return true;
            } catch (err) {
                // Fall through to fallback method
                console.warn('Clipboard API failed, trying fallback:', err);
            }
        }

        // Fallback: document.execCommand('copy')
        return this.fallbackCopy(text, feedbackElement);
    },

    /**
     * Fallback copy method using execCommand
     * @param {string} text - Text to copy
     * @param {HTMLElement} feedbackElement - Optional element to show feedback
     * @returns {boolean} Success status
     */
    fallbackCopy(text, feedbackElement) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);

        // Select text - iOS needs this range selection
        if (navigator.userAgent.match(/ipad|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(textarea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textarea.setSelectionRange(0, text.length);
        } else {
            textarea.select();
        }

        let success = false;
        try {
            success = document.execCommand('copy');
            if (success) {
                this.showFeedback(feedbackElement);
            }
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }

        document.body.removeChild(textarea);
        return success;
    },

    /**
     * Show visual feedback after successful copy
     * @param {HTMLElement} element - Element to update with feedback
     */
    showFeedback(element) {
        if (!element) return;

        const originalText = element.textContent;
        const originalClass = element.className;

        // Add success indicator
        element.textContent = 'Copied!';
        element.classList.add('copy-success');

        setTimeout(() => {
            element.textContent = originalText;
            element.classList.remove('copy-success');
        }, 1500);
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

// ============================================
// TOOLS COUNTING FUNCTIONALITY
// ============================================

const ToolsCounter = {
    /**
     * Counts tools in each category and updates the UI
     * @returns {{totalTools: number, categories: Array<{name: string, count: number}>}}
     */
    countAndUpdate() {
        const sections = document.querySelectorAll('.category-section');
        const categories = [];
        let totalTools = 0;

        sections.forEach(section => {
            const titleEl = section.querySelector('.category-title');
            const countEl = section.querySelector('.category-count');
            const toolCards = section.querySelectorAll('.tools-grid .tool-card');

            const categoryName = titleEl ? titleEl.textContent.trim() : 'Unknown';
            const toolCount = toolCards.length;

            // Update the category count display
            if (countEl) {
                if (toolCount === 0) {
                    countEl.textContent = 'Coming soon';
                } else if (toolCount === 1) {
                    countEl.textContent = '1 tool';
                } else {
                    countEl.textContent = `${toolCount} tools`;
                }
            }

            categories.push({
                name: categoryName,
                count: toolCount
            });

            totalTools += toolCount;
        });

        // Update the total tools count in the header
        const totalCountEl = document.getElementById('totalToolsCount');
        if (totalCountEl) {
            totalCountEl.textContent = totalTools;
        }

        return { totalTools, categories };
    },

    /**
     * Gets current tool statistics without updating UI
     * @returns {{totalTools: number, categories: Array<{name: string, count: number}>}}
     */
    getStats() {
        const sections = document.querySelectorAll('.category-section');
        const categories = [];
        let totalTools = 0;

        sections.forEach(section => {
            const titleEl = section.querySelector('.category-title');
            const toolCards = section.querySelectorAll('.tools-grid .tool-card');

            const categoryName = titleEl ? titleEl.textContent.trim() : 'Unknown';
            const toolCount = toolCards.length;

            if (toolCount > 0) {
                categories.push({
                    name: categoryName,
                    count: toolCount
                });
            }

            totalTools += toolCount;
        });

        return { totalTools, categories };
    }
};

// ============================================
// TOOLS SEARCH FUNCTIONALITY
// ============================================

const ToolsSearch = {
    index: [],
    searchInput: null,
    clearBtn: null,
    resultsCount: null,
    debounceTimer: null,

    init() {
        this.searchInput = document.getElementById('toolSearch');
        this.clearBtn = document.getElementById('searchClear');
        this.resultsCount = document.getElementById('searchResultsCount');

        if (!this.searchInput) return;

        this.buildIndex();
        this.bindEvents();
    },

    buildIndex() {
        const toolCards = document.querySelectorAll('.tool-card');
        this.index = [];

        toolCards.forEach(card => {
            const name = card.querySelector('.tool-name');
            const desc = card.querySelector('.tool-description');
            const tags = card.querySelectorAll('.tool-tag');

            let searchText = '';
            if (name) searchText += name.textContent + ' ';
            if (desc) searchText += desc.textContent + ' ';
            tags.forEach(tag => searchText += tag.textContent + ' ');

            this.index.push({
                element: card,
                section: card.closest('.category-section'),
                text: searchText.toLowerCase()
            });
        });
    },

    bindEvents() {
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.search(), 50);

            // Update clear button visibility
            const wrapper = this.searchInput.closest('.search-wrapper');
            if (this.searchInput.value) {
                wrapper.classList.add('has-value');
            } else {
                wrapper.classList.remove('has-value');
            }
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clear();
            }
        });

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clear());
        }

        // Keyboard shortcut: "/" to focus search
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== this.searchInput) {
                e.preventDefault();
                this.searchInput.focus();
            }
        });
    },

    search() {
        const query = this.searchInput.value.toLowerCase().trim();

        if (!query) {
            this.clearResults();
            return;
        }

        const terms = query.split(/\s+/).filter(t => t.length > 0);
        let matchCount = 0;

        // Track which sections have visible tools
        const sectionHasVisible = new Map();

        this.index.forEach(item => {
            // Match if ALL terms are found
            const matches = terms.every(term => item.text.includes(term));

            if (matches) {
                item.element.classList.remove('search-hidden');
                matchCount++;
                sectionHasVisible.set(item.section, true);
            } else {
                item.element.classList.add('search-hidden');
            }
        });

        // Hide/show sections based on whether they have visible tools
        document.querySelectorAll('.category-section').forEach(section => {
            if (sectionHasVisible.get(section)) {
                section.classList.remove('search-empty');
                section.classList.remove('collapsed'); // Expand to show results
            } else {
                section.classList.add('search-empty');
            }
        });

        // Update results count
        if (this.resultsCount) {
            this.resultsCount.textContent = `${matchCount} found`;
        }
    },

    clearResults() {
        this.index.forEach(item => {
            item.element.classList.remove('search-hidden');
        });

        document.querySelectorAll('.category-section').forEach(section => {
            section.classList.remove('search-empty');
        });

        if (this.resultsCount) {
            this.resultsCount.textContent = '';
        }
    },

    clear() {
        this.searchInput.value = '';
        this.searchInput.closest('.search-wrapper').classList.remove('has-value');
        this.clearResults();
        this.searchInput.focus();
    }
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize shared functionality when DOM is ready
 */
function initShared() {
    ThemeManager.init();
    ToolsCounter.countAndUpdate();
    ToolsSearch.init();
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShared);
} else {
    // DOM is already ready
    initShared();
}

// ============================================
// EXPORTS
// ============================================

// ES Module exports
export { ThemeManager, Clipboard, NumberFormat, ToolsCounter, ToolsSearch };

// Also export as window global for backward compatibility with non-module tools
window.ToolsHub = {
    ThemeManager,
    Clipboard,
    NumberFormat,
    ToolsCounter,
    ToolsSearch
};
