/* ============================================
   TOOLS HUB - FOOTER
   ============================================ */

const Footer = {
    /**
     * Default configuration
     */
    defaults: {
        author: 'Jesse Anderson',
        tagline: 'Built for engineers',
        toolsPath: '../tools.html',
        issueUrl: 'https://github.com/jesse-anderson/Tools/issues/new'
    },

    /**
     * Initialize footer on all footer elements with data-footer attribute
     * Call Footer.init() to initialize all footers, or use specific element
     */
    init() {
        const footers = document.querySelectorAll('footer[data-footer]');
        footers.forEach(footer => this.initFooter(footer));

        // Also auto-initialize footers without the attribute (for backwards compatibility)
        const autoFooters = document.querySelectorAll('footer:not([data-footer])');
        autoFooters.forEach(footer => this.initFooter(footer));
    },

    /**
     * Initialize a single footer element
     * @param {HTMLElement} footer - The footer element to initialize
     */
    initFooter(footer) {
        // Get config from data attributes or use defaults
        const config = {
            author: footer.dataset.footerAuthor || this.defaults.author,
            tagline: footer.dataset.footerTagline || this.defaults.tagline,
            toolsPath: footer.dataset.footerToolsPath || this.defaults.toolsPath,
            issueUrl: footer.dataset.footerIssueUrl || this.defaults.issueUrl
        };

        const year = new Date().getFullYear();

        // Build footer HTML if empty or has data-footer-auto
        if (footer.children.length === 0 || footer.hasAttribute('data-footer-auto')) {
            footer.innerHTML = this.buildHTML(config, year);
        } else {
            // Update existing footer elements
            this.updateExisting(footer, config, year);
        }
    },

    /**
     * Build the complete footer HTML
     * @param {Object} config - Configuration object
     * @param {number} year - Current year
     * @returns {string} Footer HTML
     */
    buildHTML(config, year) {
        const authorText = config.author ? ` by ${config.author}` : '';
        const taglineText = config.tagline ? ` — ${config.tagline}` : '';

        return `
            <div class="footer-content">
                <p class="footer-text">© ${year} Tools Hub${authorText}${taglineText}</p>
                <nav class="footer-links">
                    <a href="${config.toolsPath}">All Tools</a>
                    <a href="${config.issueUrl}">Report Issue</a>
                </nav>
            </div>
        `;
    },

    /**
     * Update existing footer elements without rebuilding HTML
     * @param {HTMLElement} footer - The footer element
     * @param {Object} config - Configuration object
     * @param {number} year - Current year
     */
    updateExisting(footer, config, year) {
        // Update footer text with dynamic year
        const textEl = footer.querySelector('.footer-text');
        if (textEl) {
            const authorText = config.author ? ` by ${config.author}` : '';
            const taglineText = config.tagline ? ` — ${config.tagline}` : '';
            textEl.textContent = `© ${year} Tools Hub${authorText}${taglineText}`;
        }

        // Update links if needed
        const linksEl = footer.querySelector('.footer-links');
        if (linksEl) {
            const allToolsLink = linksEl.querySelector('a[href*="tools.html"]');
            if (allToolsLink && config.toolsPath !== this.defaults.toolsPath) {
                allToolsLink.href = config.toolsPath;
            }

            const issueLink = linksEl.querySelectorAll('a')[1];
            if (issueLink && config.issueUrl !== this.defaults.issueUrl) {
                issueLink.href = config.issueUrl;
            }
        }
    },

    /**
     * Manually render a footer with custom options
     * @param {string|HTMLElement} target - Selector or element
     * @param {Object} options - Optional config overrides
     */
    render(target, options = {}) {
        const footer = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!footer) {
            console.warn('Footer: target element not found');
            return;
        }

        const config = { ...this.defaults, ...options };
        const year = new Date().getFullYear();

        footer.innerHTML = this.buildHTML(config, year);
    },

    /**
     * Get the current year
     * @returns {number} Current year
     */
    getYear() {
        return new Date().getFullYear();
    }
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Footer.init());
} else {
    Footer.init();
}

// Export for use in other scripts
window.ToolsHub = window.ToolsHub || {};
window.ToolsHub.Footer = Footer;
