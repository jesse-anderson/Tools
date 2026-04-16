/* ============================================
   TOOLS HUB - FOOTER
   ============================================ */

const Footer = {
    defaults: {
        author: 'Jesse Anderson',
        tagline: 'Built for engineers',
        toolsPath: '../tools.html',
        issueUrl: 'https://github.com/jesse-anderson/Tools/issues/new',
        variant: 'default'
    },

    init() {
        const footers = document.querySelectorAll('footer[data-footer]');
        footers.forEach((footer) => this.initFooter(footer));

        const autoFooters = document.querySelectorAll('footer:not([data-footer])');
        autoFooters.forEach((footer) => this.initFooter(footer));
    },

    initFooter(footer) {
        const config = {
            author: footer.dataset.footerAuthor || this.defaults.author,
            tagline: footer.dataset.footerTagline || this.defaults.tagline,
            toolsPath: footer.dataset.footerToolsPath || this.defaults.toolsPath,
            issueUrl: footer.dataset.footerIssueUrl || this.defaults.issueUrl,
            variant: footer.dataset.footerVariant || this.defaults.variant
        };

        const year = new Date().getFullYear();

        if (footer.children.length === 0 || footer.hasAttribute('data-footer-auto')) {
            footer.innerHTML = this.buildHTML(config, year);
        } else {
            this.updateExisting(footer, config, year);
        }
    },

    buildHTML(config, year) {
        const authorText = config.author ? ` by ${config.author}` : '';
        const taglineText = config.tagline ? ` - ${config.tagline}` : '';

        let linksHTML = '';
        if (config.variant === 'hub') {
            linksHTML = `
                <nav class="footer-links">
                    <a href="#about">About</a>
                    <a href="https://github.com/jesse-anderson/Tools/blob/main/README.md" target="_blank" rel="noopener">Documentation</a>
                    <a href="${config.issueUrl}">Request a Tool</a>
                </nav>
            `;
        } else {
            linksHTML = `
                <nav class="footer-links">
                    <a href="${config.toolsPath}">All Tools</a>
                    <a href="${config.issueUrl}">Report Issue</a>
                </nav>
            `;
        }

        return `
            <div class="footer-content">
                <p class="footer-text">Copyright 2025-${year} Tools Hub${authorText}${taglineText}</p>
                ${linksHTML}
            </div>
        `;
    },

    updateExisting(footer, config, year) {
        const textEl = footer.querySelector('.footer-text');
        if (textEl) {
            const authorText = config.author ? ` by ${config.author}` : '';
            const taglineText = config.tagline ? ` - ${config.tagline}` : '';
            textEl.textContent = `Copyright 2025-${year} Tools Hub${authorText}${taglineText}`;
        }

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

    getYear() {
        return new Date().getFullYear();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Footer.init());
} else {
    Footer.init();
}

window.ToolsHub = window.ToolsHub || {};
window.ToolsHub.Footer = Footer;
