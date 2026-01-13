// ============================================
// SQLite Viewer Application
// ============================================
const SQLiteViewer = {
    // ============================================
    // SECTION 1: CORE & STATE
    // ============================================

    db: null,
    tables: [],
    views: [],
    currentTable: null,
    queryHistory: [],
    maxHistorySize: 10,
    isDirty: false,  // Track unsaved database modifications

    // DOM Elements
    elements: {},

    init() {
        // Cache DOM elements
        this.cacheElements();
        // Bind event listeners
        this.bindEvents();
        // Load saved queries and query history from localStorage
        this.loadSavedQueries();
        this.loadQueryHistory();
        this.renderHistory();
    },

    cacheElements() {
        this.elements = {
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            fileInfo: document.getElementById('fileInfo'),
            fileName: document.getElementById('fileName'),
            fileSize: document.getElementById('fileSize'),
            closeFile: document.getElementById('closeFile'),
            dbContent: document.getElementById('dbContent'),
            tablesTab: document.getElementById('tablesTab'),
            schemaTab: document.getElementById('schemaTab'),
            queryTab: document.getElementById('queryTab'),
            tablesList: document.getElementById('tablesList'),
            schemaView: document.getElementById('schemaView'),
            queryEditor: document.getElementById('queryEditor'),
            runQuery: document.getElementById('runQuery'),
            clearQuery: document.getElementById('clearQuery'),
            exportResults: document.getElementById('exportResults'),
            resultsContainer: document.getElementById('resultsContainer'),
            resultsInfo: document.getElementById('resultsInfo'),
            rowCount: document.getElementById('rowCount'),
            queryTime: document.getElementById('queryTime'),
            tableView: document.getElementById('tableView'),
            backToTables: document.getElementById('backToTables'),
            currentTableName: document.getElementById('currentTableName'),
            tableResults: document.getElementById('tableResults'),
            tableRowCount: document.getElementById('tableRowCount'),
            exportTableBtn: document.getElementById('exportTableBtn'),
            sqliteVersion: document.getElementById('sqliteVersion'),
            tableCount: document.getElementById('tableCount'),
            viewCount: document.getElementById('viewCount'),
            dbFileSize: document.getElementById('dbFileSize'),
            queryHistory: document.getElementById('queryHistory'),
            errorBanner: document.getElementById('errorBanner'),
            errorText: document.getElementById('errorText'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            attributionsModal: document.getElementById('attributionsModal'),
            openAttributions: document.getElementById('openAttributions'),
            closeAttributions: document.getElementById('closeAttributions'),
            // New elements for quick wins
            templatesBtn: document.getElementById('templatesBtn'),
            templatesMenu: document.getElementById('templatesMenu'),
            exportMenu: document.getElementById('exportMenu'),
            tableExportMenu: document.getElementById('tableExportMenu'),
            savedQueries: document.getElementById('savedQueries'),
            saveQueryName: document.getElementById('saveQueryName'),
            saveQueryBtn: document.getElementById('saveQueryBtn'),
            tableStatsCard: document.getElementById('tableStatsCard'),
            statRowCount: document.getElementById('statRowCount'),
            statColumnCount: document.getElementById('statColumnCount'),
            columnsStatsList: document.getElementById('columnsStatsList'),
            // Schema view button
            viewSchemaBtn: document.getElementById('viewSchemaBtn'),
            // Database export
            exportDbBtn: document.getElementById('exportDbBtn'),
            // Schema navigation
            schemaContainer: document.getElementById('schemaContainer'),
            // Confirmation modal
            confirmModal: document.getElementById('confirmModal'),
            confirmCancel: document.getElementById('confirmCancel'),
            confirmClose: document.getElementById('confirmClose'),
        };
    },

    // Pagination state - separate contexts for different views
    pagination: {
        query: {
            currentPage: 1,
            pageSize: 100,
            totalRows: 0,
            allColumns: [],
            allValues: [],
            container: null,
        },
        table: {
            currentPage: 1,
            pageSize: 100,
            totalRows: 0,
            allColumns: [],
            allValues: [],
            container: null,
        }
    },

    // Get the active pagination context based on container
    getPaginationContext(container) {
        if (container === this.elements.tableResults) {
            return this.pagination.table;
        }
        return this.pagination.query;
    },

    bindEvents() {
        // File upload
        this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('dragover');
        });
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('dragover');
        });
        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.loadDatabase(file);
        });

        // Close file
        this.elements.closeFile.addEventListener('click', () => this.closeDatabase());

        // Tab navigation
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Query actions
        this.elements.runQuery.addEventListener('click', () => this.runQuery());
        this.elements.clearQuery.addEventListener('click', () => {
            this.elements.queryEditor.value = '';
            this.elements.queryEditor.focus();
        });

        // Export dropdown (query results)
        this.elements.exportResults.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.exportMenu.classList.toggle('active');
            this.elements.tableExportMenu?.classList.remove('active');
        });

        // Export dropdown (table view)
        this.elements.exportTableBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.tableExportMenu.classList.toggle('active');
            this.elements.exportMenu?.classList.remove('active');
        });

        // Export menu options (query results)
        this.elements.exportMenu?.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const exportType = option.dataset.export;
                if (exportType === 'csv') {
                    this.exportResultsCSV();
                } else if (exportType === 'json') {
                    this.exportResultsJSON();
                } else if (exportType === 'insert') {
                    this.exportResultsAsInsert();
                }
                this.elements.exportMenu.classList.remove('active');
            });
        });

        // Export menu options (table view)
        this.elements.tableExportMenu?.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const exportType = option.dataset.tableExport;
                if (exportType === 'csv') {
                    this.exportTable();
                } else if (exportType === 'json') {
                    this.exportTableJSON();
                } else if (exportType === 'insert') {
                    this.exportTableAsInsert();
                }
                this.elements.tableExportMenu.classList.remove('active');
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.elements.exportMenu?.classList.remove('active');
            this.elements.tableExportMenu?.classList.remove('active');
            this.elements.templatesMenu?.classList.remove('active');
        });

        // Templates dropdown
        this.elements.templatesBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.templatesMenu.classList.toggle('active');
        });

        // Template items
        this.elements.templatesMenu?.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertTemplate(item.dataset.template);
                this.elements.templatesMenu.classList.remove('active');
            });
        });

        // Saved queries
        this.elements.saveQueryBtn?.addEventListener('click', () => this.saveQuery());
        this.elements.saveQueryName?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveQuery();
            }
        });

        // Schema navigation buttons
        this.elements.schemaContainer?.querySelectorAll('.schema-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchSchemaView(btn.dataset.schemaView);
            });
        });

        // Database export button
        this.elements.exportDbBtn?.addEventListener('click', () => this.exportDatabase());

        // Table view actions
        this.elements.backToTables.addEventListener('click', () => this.showTablesView());
        this.elements.viewSchemaBtn.addEventListener('click', () => this.viewSchemaFromTable());

        // Query editor keyboard shortcut
        this.elements.queryEditor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.runQuery();
            }
        });

        // Attributions modal
        this.elements.openAttributions.addEventListener('click', () => this.openModal());
        this.elements.closeAttributions.addEventListener('click', () => this.closeModal());
        this.elements.attributionsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.attributionsModal) {
                this.closeModal();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.attributionsModal.classList.contains('active')) {
                    this.closeModal();
                }
                if (this.elements.confirmModal?.classList.contains('active')) {
                    this.hideConfirmModal();
                }
            }
        });

        // Confirmation modal events
        this.elements.confirmCancel?.addEventListener('click', () => this.hideConfirmModal());
        this.elements.confirmClose?.addEventListener('click', () => {
            this.hideConfirmModal();
            this.performClose();
        });
        this.elements.confirmModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.confirmModal) {
                this.hideConfirmModal();
            }
        });
    },

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            await this.loadDatabase(file);
        }
    },

    // ============================================
    // SECTION 2: DATABASE OPERATIONS
    // ============================================

    async loadDatabase(file) {
        // File size validation (100MB limit as per disclaimer)
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        if (file.size > MAX_FILE_SIZE) {
            this.showError(`File is too large (${this.formatBytes(file.size)}). Maximum size is 100MB for browser stability.`);
            return;
        }

        this.showLoading('Loading SQLite WASM and database...');

        try {
            // Initialize sql.js
            const config = {
                locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${filename}`
            };

            const SQL = await initSqlJs(config);

            // Read file
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Open database
            this.db = new SQL.Database(uint8Array);

            // Reset state for new database
            this.isDirty = false;
            this.pagination.query = {
                currentPage: 1,
                pageSize: 100,
                totalRows: 0,
                allColumns: [],
                allValues: [],
                container: null,
            };
            this.pagination.table = {
                currentPage: 1,
                pageSize: 100,
                totalRows: 0,
                allColumns: [],
                allValues: [],
                container: null,
            };

            // Update UI
            this.elements.fileName.textContent = file.name;
            this.elements.fileSize.textContent = this.formatBytes(file.size);
            this.elements.dbFileSize.textContent = this.formatBytes(file.size);
            this.elements.uploadArea.classList.add('disabled');
            this.elements.fileInfo.classList.add('active');
            this.elements.dbContent.style.display = 'flex';
            this.elements.exportDbBtn.disabled = false;

            // Get SQLite version
            const versionResult = this.db.exec("SELECT sqlite_version()");
            if (versionResult.length > 0) {
                this.elements.sqliteVersion.textContent = versionResult[0].values[0][0];
            }

            // Load tables and views
            await this.loadSchema();

            this.hideLoading();
            this.hideError();

        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to load database: ${error.message}`);
            console.error('Database load error:', error);
        }
    },

    loadSchema() {
        // Get all tables and views
        const result = this.db.exec(`
            SELECT name, type
            FROM sqlite_master
            WHERE type IN ('table', 'view')
            AND name NOT LIKE 'sqlite_%'
            ORDER BY type, name
        `);

        this.tables = [];
        this.views = [];

        if (result.length > 0) {
            result[0].values.forEach(([name, type]) => {
                if (type === 'table') {
                    this.tables.push(name);
                } else {
                    this.views.push(name);
                }
            });
        }

        // Update counts
        this.elements.tableCount.textContent = this.tables.length;
        this.elements.viewCount.textContent = this.views.length;

        // Populate tables list
        this.renderTablesList();
    },

    renderTablesList() {
        const list = this.elements.tablesList;
        list.innerHTML = '';

        // Render tables
        this.tables.forEach(tableName => {
            const count = this.getRowCount(tableName);
            const card = this.createTableCard(tableName, count, 'table');
            list.appendChild(card);
        });

        // Render views
        this.views.forEach(viewName => {
            const card = this.createTableCard(viewName, null, 'view');
            list.appendChild(card);
        });
    },

    createTableCard(name, rowCount, type) {
        const card = document.createElement('div');
        card.className = 'table-card';
        card.innerHTML = `
            <div class="table-name">
                <svg class="table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${type === 'table'
                        ? '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'
                        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
                </svg>
                ${this.escapeHtml(name)}
            </div>
            <div class="table-count">${rowCount !== null ? rowCount.toLocaleString() + ' rows' : type === 'view' ? 'View' : ''}</div>
        `;

        card.addEventListener('click', () => {
            this.showTableData(name);
        });

        return card;
    },

    getRowCount(tableName) {
        try {
            const result = this.db.exec(`SELECT COUNT(*) FROM "${this.escapeSql(tableName)}"`);
            if (result.length > 0) {
                return result[0].values[0][0];
            }
        } catch (e) {
            // Table might not have rows or be inaccessible
        }
        return null;
    },

    loadTablePage(tableName, page, pageSize) {
        try {
            const offset = (page - 1) * pageSize;
            const result = this.db.exec(`SELECT * FROM "${this.escapeSql(tableName)}" LIMIT ${pageSize} OFFSET ${offset}`);

            const ctx = this.pagination.table;
            ctx.currentPage = page;
            ctx.pageSize = pageSize;
            ctx.container = this.elements.tableResults;
            ctx.mode = 'server'; // Flag for server-side pagination
            ctx.tableName = tableName;

            if (result.length > 0) {
                ctx.allColumns = result[0].columns;
                ctx.allValues = result[0].values; // Only current page values
            } else {
                // If page is empty (e.g. empty table), set empty values
                ctx.allValues = [];
                // Try to get columns from schema if we have no data
                if (page === 1) {
                    try {
                        const pragma = this.db.exec(`PRAGMA table_info("${this.escapeSql(tableName)}")`);
                        if (pragma.length > 0 && pragma[0].values) {
                            ctx.allColumns = pragma[0].values.map(c => c[1]);
                        } else {
                            ctx.allColumns = [];
                        }
                    } catch (e) {
                        ctx.allColumns = [];
                    }
                }
            }

            // Render
            this.renderResultsPage(ctx);

        } catch (error) {
            this.showError(`Failed to load table data: ${error.message}`);
        }
    },

    showTableData(tableName) {
        this.currentTable = tableName;

        try {
            // Get Row Count First
            const count = this.getRowCount(tableName);
            const totalRows = count !== null ? count : 0;

            this.elements.currentTableName.textContent = tableName;
            this.elements.tableRowCount.textContent = totalRows.toLocaleString();

            // Setup pagination context
            const ctx = this.pagination.table;
            ctx.totalRows = totalRows;
            ctx.mode = 'server';
            ctx.tableName = tableName;

            // Load first page
            this.loadTablePage(tableName, 1, ctx.pageSize || 100);

            // Show table view
            this.elements.dbContent.style.display = 'none';
            this.elements.tableView.style.display = 'flex';

            // Show table statistics in sidebar
            this.showTableStats(tableName);

        } catch (error) {
            this.showError(`Failed to load table data: ${error.message}`);
        }
    },

    showTablesView() {
        this.elements.tableView.style.display = 'none';
        this.elements.dbContent.style.display = 'flex';
        this.currentTable = null;
        this.hideTableStats();
    },

    // ============================================
    // SECTION 3: UI RENDERING - TABS & TABLES
    // ============================================

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        this.elements.tablesTab.classList.toggle('active', tabName === 'tables');
        this.elements.schemaTab.classList.toggle('active', tabName === 'schema');
        this.elements.queryTab.classList.toggle('active', tabName === 'query');

        // Handle schema tab special behavior
        if (tabName === 'schema') {
            // If a table is currently being viewed, show its schema
            if (this.currentTable && !this.currentSchemaTable) {
                this.currentSchemaTable = this.currentTable;
                this.currentSchemaView = 'columns';
                // Update nav buttons to show columns as active
                this.elements.schemaContainer?.querySelectorAll('.schema-nav-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.schemaView === 'columns');
                });
            }
            // Render the schema view if we have a table selected
            if (this.currentSchemaTable) {
                this.renderSchemaView();
            }
        } else {
            // Clear schema selection when switching away from schema tab
            this.currentSchemaTable = null;
            this.elements.schemaView.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <p>Select a table to view its schema</p>
                </div>
            `;
        }
    },

    showSchema(tableName) {
        this.currentSchemaTable = tableName;
        this.currentSchemaView = this.currentSchemaView || 'columns';
        this.renderSchemaView();
    },

    switchSchemaView(viewType) {
        this.currentSchemaView = viewType;

        // Update nav buttons
        this.elements.schemaContainer?.querySelectorAll('.schema-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.schemaView === viewType);
        });

        // Render the view
        this.renderSchemaView();
    },

    renderSchemaView() {
        if (!this.currentSchemaTable) return;

        const tableName = this.currentSchemaTable;
        const viewType = this.currentSchemaView;

        try {
            switch (viewType) {
                case 'columns':
                    this.renderSchemaColumns(tableName);
                    break;
                case 'indexes':
                    this.renderSchemaIndexes(tableName);
                    break;
                case 'foreign-keys':
                    this.renderSchemaForeignKeys(tableName);
                    break;
                case 'triggers':
                    this.renderSchemaTriggers(tableName);
                    break;
            }
        } catch (error) {
            this.elements.schemaView.innerHTML = `<p style="color: var(--accent-error); font-family: 'JetBrains Mono', monospace; font-size: 0.875rem;">Error loading schema: ${this.escapeHtml(error.message)}</p>`;
        }
    },

    renderSchemaColumns(tableName) {
        const result = this.db.exec(`PRAGMA table_info("${this.escapeSql(tableName)}")`);

        if (result.length > 0 && result[0].values) {
            const columns = result[0].values;
            const schemaHtml = `
                <div class="schema-table-name">${this.escapeHtml(tableName)}</div>
                <div class="schema-columns">
                    ${columns.map(col => `
                        <div class="schema-column">
                            <span class="schema-column-name">${this.escapeHtml(col[1])}</span>
                            <span class="schema-column-type">${this.escapeHtml(col[2] || '')}</span>
                            <span class="schema-column-flags">
                                ${col[5] ? 'PK' : ''}
                                ${col[3] === 0 ? 'NOT NULL' : ''}
                                ${col[4] ? 'DEFAULT ' + this.escapeHtml(String(col[4])) : ''}
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
            this.elements.schemaView.innerHTML = schemaHtml;
        } else {
            this.elements.schemaView.innerHTML = `<p style="color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.875rem;">No schema information found for "${this.escapeHtml(tableName)}"</p>`;
        }
    },

    renderSchemaIndexes(tableName) {
        // Get list of indexes for this table
        const indexListResult = this.db.exec(`PRAGMA index_list("${this.escapeSql(tableName)}")`);

        if (indexListResult.length === 0 || indexListResult[0].values.length === 0) {
            this.elements.schemaView.innerHTML = `
                <div class="schema-table-name">${this.escapeHtml(tableName)} - Indexes</div>
                <p class="empty-schema-item">No indexes defined for this table</p>
            `;
            return;
        }

        const indexes = indexListResult[0].values;
        let html = `<div class="schema-table-name">${this.escapeHtml(tableName)} - Indexes</div>`;

        indexes.forEach(index => {
            const indexName = index[1];
            const isUnique = index[2] === 1;
            const origin = index[3]; // 0 = primary key, 1 = unique constraint, 2 = created with CREATE INDEX, 3 = generated by UNIQUE constraint

            // Get index info (columns in this index)
            const indexInfoResult = this.db.exec(`PRAGMA index_info("${this.escapeSql(indexName)}")`);
            const columns = indexInfoResult.length > 0 ? indexInfoResult[0].values : [];

            html += `
                <div class="schema-section">
                    <div class="schema-list-item">
                        <div>
                            <div class="schema-list-name">${this.escapeHtml(indexName)}</div>
                            <div class="schema-list-columns">
                                ${columns.map(col => `<span class="schema-column-badge">${this.escapeHtml(col[2])}</span>`).join('')}
                            </div>
                        </div>
                        <div class="schema-list-details">
                            ${isUnique ? 'UNIQUE' : ''}
                            ${origin === 0 ? ' (PK)' : ''}
                            ${origin === 1 ? ' (Constraint)' : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        this.elements.schemaView.innerHTML = html;
    },

    renderSchemaForeignKeys(tableName) {
        const fkResult = this.db.exec(`PRAGMA foreign_key_list("${this.escapeSql(tableName)}")`);

        if (fkResult.length === 0 || fkResult[0].values.length === 0) {
            this.elements.schemaView.innerHTML = `
                <div class="schema-table-name">${this.escapeHtml(tableName)} - Foreign Keys</div>
                <p class="empty-schema-item">No foreign keys defined for this table</p>
            `;
            return;
        }

        const fkeys = fkResult[0].values;
        let html = `<div class="schema-table-name">${this.escapeHtml(tableName)} - Foreign Keys</div>`;

        fkeys.forEach(fk => {
            // fk structure: [id, table, from, to, on_update, on_delete, match]
            const id = fk[0];
            const refTable = fk[1];
            const fromCol = fk[2];
            const toCol = fk[3];
            const onUpdate = fk[4];
            const onDelete = fk[5];

            html += `
                <div class="schema-section">
                    <div class="schema-list-item">
                        <div>
                            <div class="schema-list-name">${this.escapeHtml(fromCol)} → ${this.escapeHtml(refTable)}.${this.escapeHtml(toCol)}</div>
                        </div>
                        <div class="schema-list-details">
                            ON UPDATE: ${this.escapeHtml(onUpdate)} | ON DELETE: ${this.escapeHtml(onDelete)}
                        </div>
                    </div>
                </div>
            `;
        });

        this.elements.schemaView.innerHTML = html;
    },

    renderSchemaTriggers(tableName) {
        // Get triggers for this table from sqlite_master
        // Note: Using parameterized approach by properly quoting the table name
        const safeTableName = this.escapeSql(tableName).replace(/'/g, "''");
        const triggerResult = this.db.exec(`
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'trigger'
            AND tbl_name = '${safeTableName}'
            ORDER BY name
        `);

        if (triggerResult.length === 0 || triggerResult[0].values.length === 0) {
            this.elements.schemaView.innerHTML = `
                <div class="schema-table-name">${this.escapeHtml(tableName)} - Triggers</div>
                <p class="empty-schema-item">No triggers defined for this table</p>
            `;
            return;
        }

        const triggers = triggerResult[0].values;
        let html = `<div class="schema-table-name">${this.escapeHtml(tableName)} - Triggers</div>`;

        triggers.forEach(trigger => {
            const triggerName = trigger[0];
            const triggerSql = trigger[1] || '';

            html += `
                <div class="schema-section">
                    <div class="schema-section-title">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        ${this.escapeHtml(triggerName)}
                    </div>
                    <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-secondary); overflow-x: auto; white-space: pre-wrap;">${this.escapeHtml(triggerSql)}</pre>
                </div>
            `;
        });

        this.elements.schemaView.innerHTML = html;
    },

    // ============================================
    // SECTION 4: QUERY EXECUTION & RESULTS
    // ============================================

    runQuery() {
        const query = this.elements.queryEditor.value.trim();

        if (!query) {
            this.showError('Please enter a SQL query');
            return;
        }

        if (!this.db) {
            this.showError('No database loaded');
            return;
        }

        try {
            const startTime = performance.now();
            const results = this.db.exec(query);
            const endTime = performance.now();

            // Add to history
            this.addToHistory(query);

            // Check if query modified schema and refresh UI if needed
            if (this.isSchemaChangingQuery(query)) {
                this.isDirty = true;  // Mark database as modified
                this.loadSchema();
                // Also hide table view if open, as the table may have changed
                if (this.elements.tableView.style.display !== 'none') {
                    this.showTablesView();
                }
            }

            // Also mark dirty for data modification queries (INSERT, UPDATE, DELETE)
            const normalizedQuery = query.toUpperCase().trim();
            const dataModificationPrefixes = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE'];
            if (dataModificationPrefixes.some(prefix => normalizedQuery.startsWith(prefix))) {
                this.isDirty = true;
            }

            // Display results
            if (results.length > 0) {
                this.renderResults(results[0], this.elements.resultsContainer);
                this.elements.resultsInfo.style.display = 'flex';
                this.elements.rowCount.textContent = results[0].values.length.toLocaleString();
                this.elements.queryTime.textContent = `${(endTime - startTime).toFixed(2)}ms`;
            } else {
                this.elements.resultsContainer.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <p>Query executed successfully. No results returned.</p>
                    </div>
                `;
                this.elements.resultsInfo.style.display = 'flex';
                this.elements.rowCount.textContent = '0';
                this.elements.queryTime.textContent = `${(endTime - startTime).toFixed(2)}ms`;
            }

            this.hideError();

        } catch (error) {
            this.showError(`SQL Error: ${error.message}`);
        }
    },

    renderResults(result, container) {
        if (!result) return;

        const { columns, values } = result;

        // Get the appropriate pagination context for this container
        const ctx = this.getPaginationContext(container);

        // Store all data for pagination
        ctx.allColumns = columns;
        ctx.allValues = values;
        ctx.totalRows = values.length;
        ctx.container = container;
        ctx.currentPage = 1;
        ctx.mode = 'client'; // Default to client-side pagination for generic queries

        // Render first page
        this.renderResultsPage(ctx);
    },

    renderResultsPage(ctx) {
        const { allColumns, allValues, currentPage, pageSize, totalRows, container, mode } = ctx;

        if (!container) return;

        const totalPages = Math.ceil(totalRows / pageSize);
        
        let displayRows;
        if (mode === 'server') {
            // For server-side pagination, allValues contains only the current page
            displayRows = allValues;
        } else {
            // For client-side pagination, slice the full dataset
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalRows);
            displayRows = allValues.slice(startIndex, endIndex);
        }

        let html = '<table class="results-table"><thead><tr>';
        allColumns.forEach(col => {
            html += `<th>${this.escapeHtml(String(col))}</th>`;
        });
        html += '</tr></thead><tbody>';

        displayRows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                const value = cell === null ? '<span class="null-value">NULL</span>' :
                             typeof cell === 'number' ? `<span class="number-value">${this.escapeHtml(String(cell))}</span>` :
                             this.escapeHtml(String(cell));
                html += `<td>${value}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Add pagination controls if there are multiple pages
        if (totalRows > pageSize) {
            html += this.renderPaginationControls(totalRows, currentPage, pageSize, totalPages);
        }

        // Store the table and wrapper for pagination updates
        container.innerHTML = html;

        // Bind pagination events
        this.bindPaginationEvents(container, ctx);
    },

    renderPaginationControls(totalRows, currentPage, pageSize, totalPages) {
        const startRow = ((currentPage - 1) * pageSize) + 1;
        const endRow = Math.min(currentPage * pageSize, totalRows);

        return `
            <div class="pagination-container">
                <div class="pagination-info">
                    Showing <span>${startRow.toLocaleString()} - ${endRow.toLocaleString()}</span> of <span>${totalRows.toLocaleString()}</span> rows
                </div>
                <div class="pagination-controls">
                    <button class="pagination-btn" data-page="first" ${currentPage === 1 ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="11 17 6 12 11 7"/>
                            <polyline points="18 17 13 12 18 7"/>
                        </svg>
                    </button>
                    <button class="pagination-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                    <span style="color: var(--text-secondary); font-size: 0.75rem;">Page ${currentPage} of ${totalPages}</span>
                    <button class="pagination-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                    <button class="pagination-btn" data-page="last" ${currentPage === totalPages ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="13 17 18 12 13 7"/>
                            <polyline points="6 17 11 12 6 7"/>
                        </svg>
                    </button>
                    <div class="pagination-page-size">
                        <label>Rows:</label>
                        <select class="page-size-select">
                            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                            <option value="250" ${pageSize === 250 ? 'selected' : ''}>250</option>
                            <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
                            <option value="1000" ${pageSize === 1000 ? 'selected' : ''}>1000</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    },

    bindPaginationEvents(container, ctx) {
        // Page navigation buttons
        container.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.page;
                const totalPages = Math.ceil(ctx.totalRows / ctx.pageSize);
                let newPage = ctx.currentPage;

                switch (action) {
                    case 'first':
                        newPage = 1;
                        break;
                    case 'prev':
                        if (newPage > 1) {
                            newPage--;
                        }
                        break;
                    case 'next':
                        if (newPage < totalPages) {
                            newPage++;
                        }
                        break;
                    case 'last':
                        newPage = totalPages;
                        break;
                }
                
                if (newPage !== ctx.currentPage) {
                    ctx.currentPage = newPage;
                    if (ctx.mode === 'server') {
                        this.loadTablePage(ctx.tableName, ctx.currentPage, ctx.pageSize);
                    } else {
                        this.renderResultsPage(ctx);
                    }
                }
            });
        });

        // Page size select
        const pageSizeSelect = container.querySelector('.page-size-select');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                const newSize = parseInt(e.target.value, 10);
                if (newSize !== ctx.pageSize) {
                    ctx.pageSize = newSize;
                    // Reset to first page
                    if (ctx.mode === 'server') {
                        this.loadTablePage(ctx.tableName, 1, ctx.pageSize);
                    } else {
                        ctx.currentPage = 1;
                        this.renderResultsPage(ctx);
                    }
                }
            });
        }
    },

    // ============================================
    // SECTION 5: HISTORY & PAGINATION
    // ============================================

    addToHistory(query) {
        // Add to beginning of history
        this.queryHistory.unshift(query);

        // Remove duplicates and limit size
        this.queryHistory = [...new Set(this.queryHistory)].slice(0, this.maxHistorySize);

        // Save to localStorage
        try {
            localStorage.setItem('sqliteQueryHistory', JSON.stringify(this.queryHistory));
        } catch (e) {
            console.error('Failed to save query history:', e);
        }

        // Render history
        this.renderHistory();
    },

    loadQueryHistory() {
        try {
            const saved = localStorage.getItem('sqliteQueryHistory');
            this.queryHistory = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Failed to load query history:', e);
            this.queryHistory = [];
        }
    },

    renderHistory() {
        if (this.queryHistory.length === 0) {
            this.elements.queryHistory.innerHTML = '<p style="font-family: \'JetBrains Mono\', monospace; font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No queries yet</p>';
            return;
        }

        this.elements.queryHistory.innerHTML = this.queryHistory.map(query => `
            <div class="history-item" title="${this.escapeHtml(query)}">${this.escapeHtml(query)}</div>
        `).join('');

        // Add click handlers
        this.elements.queryHistory.querySelectorAll('.history-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.elements.queryEditor.value = this.queryHistory[index];
                this.elements.queryEditor.focus();
            });
        });
    },

    exportTable() {
        if (!this.currentTable) return;

        try {
            const stmt = this.db.prepare(`SELECT * FROM "${this.escapeSql(this.currentTable)}"`);
            const chunks = [];
            
            // Get columns
            const columns = stmt.getColumnNames();
            chunks.push(columns.join(',') + '\n');
            
            // Iterate rows
            while(stmt.step()) {
                const row = stmt.get();
                const rowStr = row.map(cell => {
                    const text = String(cell === null ? 'NULL' : cell);
                    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                        return `"${text.replace(/"/g, '""')}"`;
                    }
                    return text;
                }).join(',') + '\n';
                chunks.push(rowStr);
            }
            stmt.free();

            this.downloadFile(chunks, `${this.currentTable}.csv`, 'text/csv');
            this.showSuccess(`Exported ${this.currentTable}.csv`);
            
        } catch (error) {
            this.showError(`Failed to export table: ${error.message}`);
        }
    },

    downloadFile(content, filename, mimeType) {
        // Support both string content and array of chunks (for streaming)
        const parts = Array.isArray(content) ? content : [content];
        const blob = new Blob(parts, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.sanitizeFilename(filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    closeDatabase() {
        // Check for unsaved changes
        if (this.isDirty) {
            this.showConfirmModal();
            return;
        }

        this.performClose();
    },

    performClose() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        this.tables = [];
        this.views = [];
        this.currentTable = null;
        this.isDirty = false;

        // Reset UI
        this.elements.fileInput.value = '';
        this.elements.uploadArea.classList.remove('disabled');
        this.elements.fileInfo.classList.remove('active');
        this.elements.dbContent.style.display = 'none';
        this.elements.tableView.style.display = 'none';
        this.elements.tablesList.innerHTML = '';
        this.elements.exportDbBtn.disabled = true;
        this.elements.queryEditor.value = '';
        this.elements.resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18"/>
                    <path d="M9 21V9"/>
                </svg>
                <p>Run a query to see results</p>
            </div>
        `;
        this.elements.resultsInfo.style.display = 'none';

        // Reset sidebar
        this.elements.sqliteVersion.textContent = '-';
        this.elements.tableCount.textContent = '0';
        this.elements.viewCount.textContent = '0';
        this.elements.dbFileSize.textContent = '0 KB';

        this.hideError();
    },

    showConfirmModal() {
        this.elements.confirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    hideConfirmModal() {
        this.elements.confirmModal.classList.remove('active');
        document.body.style.overflow = '';
    },

    showLoading(text) {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.add('active');
    },

    hideLoading() {
        this.elements.loadingOverlay.classList.remove('active');
    },

    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.errorBanner.classList.add('active');
    },

    hideError() {
        this.elements.errorBanner.classList.remove('active');
    },

    // ============================================
    // SECTION 6: UTILITY FUNCTIONS
    // ============================================

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    escapeSql(name) {
        // Escape double quotes for SQL identifiers
        return name.replace(/"/g, '""');
    },

    sanitizeFilename(filename) {
        // Remove path traversal sequences and invalid characters
        // Remove any directory paths (../, ./, etc.)
        const cleanName = filename.replace(/^[\/\\\.]+/, '').replace(/[\/\\]/g, '_');
        // Remove control characters and other invalid filename characters
        return cleanName.replace(/[\x00-\x1f\x80-\x9f<>:"|?*]/g, '');
    },

    showSuccess(message) {
        // Create a temporary success notification
        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--accent-success);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            ${this.escapeHtml(message)}
        `;

        // Add animation keyframes if not already present
        if (!document.getElementById('success-anim')) {
            const style = document.createElement('style');
            style.id = 'success-anim';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Remove after 2.5 seconds
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 2500);
    },

    openModal() {
        this.elements.attributionsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        this.elements.attributionsModal.classList.remove('active');
        document.body.style.overflow = '';
    },

    // ============================================
    // SECTION 7: QUERY TEMPLATES
    // ============================================

    insertTemplate(templateType) {
        const tableName = this.tables[0] || 'table_name';
        const templates = {
            'select-all': `SELECT * FROM "${tableName}";`,
            'select-where': `SELECT * FROM "${tableName}"\nWHERE column_name = 'value';`,
            'select-join': `SELECT a.*, b.column_name\nFROM "${tableName}" a\nINNER JOIN other_table b ON a.id = b.${tableName}_id;`,
            'select-group': `SELECT column_name, COUNT(*) as count\nFROM "${tableName}"\nGROUP BY column_name\nORDER BY count DESC;`,
            'insert': `INSERT INTO "${tableName}" (column1, column2, column3)\nVALUES ('value1', 'value2', 'value3');`,
            'update': `UPDATE "${tableName}"\nSET column_name = 'new_value'\nWHERE condition_column = 'condition_value';`,
            'delete': `DELETE FROM "${tableName}"\nWHERE condition_column = 'condition_value';`,
            'create-table': `CREATE TABLE new_table (\n    id INTEGER PRIMARY KEY,\n    column_name TEXT NOT NULL,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`,
            'explain': `EXPLAIN QUERY PLAN\nSELECT * FROM "${tableName}";`
        };

        if (templates[templateType]) {
            this.elements.queryEditor.value = templates[templateType];
            this.elements.queryEditor.focus();
        }
    },

    // ============================================
    // SECTION 8: EXPORT FUNCTIONS
    // ============================================

    // Export Results as CSV
    exportResultsCSV() {
        // Use the full data from pagination state if available
        const ctx = this.pagination.query;
        if (ctx.allValues && ctx.allValues.length > 0) {
            const { allColumns, allValues } = ctx;
            const chunks = [];
            
            // Header
            chunks.push(allColumns.join(',') + '\n');

            // Rows
            allValues.forEach(row => {
                const rowStr = row.map(cell => {
                    const text = String(cell === null ? 'NULL' : cell);
                    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                        return `"${text.replace(/"/g, '""')}"`;
                    }
                    return text;
                }).join(',') + '\n';
                chunks.push(rowStr);
            });

            this.downloadFile(chunks, this.sanitizeFilename('query_results.csv'), 'text/csv');
            this.showSuccess('CSV export complete');
            return;
        }

        // Fallback to DOM parsing
        const table = this.elements.resultsContainer.querySelector('.results-table');
        if (!table) {
            this.showError('No results to export');
            return;
        }

        const chunks = [];
        const rows = table.querySelectorAll('tr');

        rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            const values = Array.from(cells).map(cell => {
                const text = cell.textContent.trim();
                if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                    return `"${text.replace(/"/g, '""')}"`;
                }
                return text;
            });
            chunks.push(values.join(',') + '\n');
        });

        this.downloadFile(chunks, this.sanitizeFilename('query_results.csv'), 'text/csv');
        this.showSuccess('CSV export complete');
    },

    // Export Results as JSON
    exportResultsJSON() {
        // Use the full data from pagination state if available
        const ctx = this.pagination.query;
        if (ctx.allValues && ctx.allValues.length > 0) {
            const { allColumns, allValues } = ctx;
            const chunks = ['[\n'];
            
            allValues.forEach((row, i) => {
                const obj = {};
                allColumns.forEach((col, index) => {
                    obj[col] = row[index];
                });
                
                const suffix = i < allValues.length - 1 ? ',\n' : '\n';
                chunks.push('  ' + JSON.stringify(obj) + suffix);
            });
            chunks.push(']');

            this.downloadFile(chunks, this.sanitizeFilename('query_results.json'), 'application/json');
            this.showSuccess('JSON export complete');
            return;
        }

        // Fallback to DOM parsing
        const table = this.elements.resultsContainer.querySelector('.results-table');
        if (!table) {
            this.showError('No results to export');
            return;
        }

        const rows = table.querySelectorAll('tr');
        const headers = Array.from(rows[0].querySelectorAll('th')).map(th => th.textContent.trim());
        const chunks = ['[\n'];

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            const row = {};
            headers.forEach((header, index) => {
                const cell = cells[index];
                const cellText = cell?.textContent.trim() || '';
                // Check if it's a number
                if (cell?.querySelector('.number-value')) {
                    row[header] = parseFloat(cellText) || 0;
                } else if (cell?.querySelector('.null-value')) {
                    row[header] = null;
                } else {
                    row[header] = cellText;
                }
            });
            
            const suffix = i < rows.length - 1 ? ',\n' : '\n';
            chunks.push('  ' + JSON.stringify(row) + suffix);
        }
        chunks.push(']');

        this.downloadFile(chunks, this.sanitizeFilename('query_results.json'), 'application/json');
        this.showSuccess('JSON export complete');
    },

    // Export Results as INSERT Statements
    exportResultsAsInsert() {
        // Use the full data from pagination state if available
        const ctx = this.pagination.query;
        if (ctx.allValues && ctx.allValues.length > 0) {
            const tableName = this.currentTable || 'table_name';
            const { allColumns, allValues } = ctx;
            const chunks = [`-- INSERT statements for query results\n-- Table: ${tableName}\n-- ${allValues.length} rows\n\n`];

            allValues.forEach(row => {
                const values = [];
                allColumns.forEach((col, index) => {
                    const val = row[index];
                    if (val === null) {
                        values.push('NULL');
                    } else if (typeof val === 'number') {
                        values.push(String(val));
                    } else {
                        // Escape single quotes
                        const escaped = String(val).replace(/'/g, "''");
                        values.push(`'${escaped}'`);
                    }
                });

                const columns = allColumns.map(c => `"${c}"`).join(', ');
                const valuesStr = values.join(', ');
                chunks.push(`INSERT INTO "${tableName}" (${columns})\nVALUES (${valuesStr});\n`);
            });

            this.downloadFile(chunks, this.sanitizeFilename('insert_statements.sql'), 'text/plain');
            this.showSuccess('INSERT statements export complete');
            return;
        }

        // Fallback to DOM parsing if pagination state is not available
        const table = this.elements.resultsContainer.querySelector('.results-table');
        if (!table) {
            this.showError('No results to export');
            return;
        }

        const tableName = this.currentTable || 'table_name';
        const rows = table.querySelectorAll('tr');
        const headers = Array.from(rows[0].querySelectorAll('th')).map(th => th.textContent.trim());

        const chunks = [`-- INSERT statements for query results\n-- Table: ${tableName}\n\n`];

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            const values = [];

            headers.forEach((header, index) => {
                const cell = cells[index];
                const cellText = cell?.textContent.trim() || '';

                if (cell?.querySelector('.null-value')) {
                    values.push('NULL');
                } else if (cell?.querySelector('.number-value')) {
                    values.push(cellText || '0');
                } else {
                    // Escape single quotes
                    const escaped = cellText.replace(/'/g, "''");
                    values.push(`'${escaped}'`);
                }
            });

            const columns = headers.map(h => `"${h}"`).join(', ');
            const valuesStr = values.join(', ');
            chunks.push(`INSERT INTO "${tableName}" (${columns})\nVALUES (${valuesStr});\n`);
        }

        this.downloadFile(chunks, this.sanitizeFilename('insert_statements.sql'), 'text/plain');
        this.showSuccess('INSERT statements export complete');
    },

    // Export Table as JSON
    exportTableJSON() {
        if (!this.currentTable) return;

        try {
            const stmt = this.db.prepare(`SELECT * FROM "${this.escapeSql(this.currentTable)}"`);
            const chunks = ['[\n'];
            
            // Get columns
            const columns = stmt.getColumnNames();
            let isFirst = true;
            
            while(stmt.step()) {
                const row = stmt.get();
                const obj = {};
                
                columns.forEach((col, index) => {
                    obj[col] = row[index];
                });
                
                if (!isFirst) {
                    chunks.push(',\n');
                }
                chunks.push('  ' + JSON.stringify(obj));
                isFirst = false;
            }
            stmt.free();
            chunks.push('\n]');

            this.downloadFile(chunks, `${this.currentTable}.json`, 'application/json');
            this.showSuccess(`Exported ${this.currentTable}.json`);
            
        } catch (error) {
            this.showError(`Failed to export table: ${error.message}`);
        }
    },

    // Export Table as INSERT Statements
    exportTableAsInsert() {
        if (!this.currentTable) return;

        try {
            const stmt = this.db.prepare(`SELECT * FROM "${this.escapeSql(this.currentTable)}"`);
            const chunks = [`-- INSERT statements for table: ${this.currentTable}\n\n`];
            
            // Get columns
            const columns = stmt.getColumnNames();
            const columnsStr = columns.map(c => `"${c}"`).join(', ');
            
            while(stmt.step()) {
                const row = stmt.get();
                const valueStrs = row.map(val => {
                    if (val === null) return 'NULL';
                    if (typeof val === 'number') return String(val);
                    return `'${String(val).replace(/'/g, "''")}'`;
                });
                
                chunks.push(`INSERT INTO "${this.currentTable}" (${columnsStr})\nVALUES (${valueStrs.join(', ')});\n`);
            }
            stmt.free();

            this.downloadFile(chunks, `${this.currentTable}_insert.sql`, 'text/plain');
            this.showSuccess(`Exported ${this.currentTable}_insert.sql`);
            
        } catch (error) {
            this.showError(`Failed to export table: ${error.message}`);
        }
    },

    // ============================================
    // SECTION 9: SAVED QUERIES
    // ============================================

    loadSavedQueries() {
        try {
            const saved = localStorage.getItem('sqliteSavedQueries');
            this.savedQueries = saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Failed to load saved queries:', e);
            this.savedQueries = {};
        }
        this.renderSavedQueries();
    },

    renderSavedQueries() {
        const container = this.elements.savedQueries;
        const queryIds = Object.keys(this.savedQueries);

        if (queryIds.length === 0) {
            container.innerHTML = '<p style="font-family: \'JetBrains Mono\', monospace; font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No saved queries</p>';
            return;
        }

        container.innerHTML = '';
        queryIds.forEach(id => {
            const item = document.createElement('div');
            item.className = 'saved-query-item';
            item.innerHTML = `
                <span class="saved-query-name">${this.escapeHtml(this.savedQueries[id].name)}</span>
                <button class="saved-query-delete" data-id="${id}" title="Delete">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            `;

            // Load query on click
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.saved-query-delete')) {
                    this.elements.queryEditor.value = this.savedQueries[id].query;
                    this.elements.queryEditor.focus();
                }
            });

            // Delete query
            const deleteBtn = item.querySelector('.saved-query-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                delete this.savedQueries[id];
                try {
                    localStorage.setItem('sqliteSavedQueries', JSON.stringify(this.savedQueries));
                } catch (e) {
                    console.error('Failed to update saved queries:', e);
                }
                this.renderSavedQueries();
            });

            container.appendChild(item);
        });
    },

    saveQuery() {
        const query = this.elements.queryEditor.value.trim();
        const name = this.elements.saveQueryName.value.trim();

        if (!query) {
            this.showError('Enter a query to save');
            return;
        }

        if (!name) {
            this.showError('Enter a name for this query');
            return;
        }

        const id = Date.now().toString();
        this.savedQueries[id] = { name, query };

        try {
            localStorage.setItem('sqliteSavedQueries', JSON.stringify(this.savedQueries));
        } catch (e) {
            this.showError('Failed to save query: localStorage might be full');
            console.error('Failed to save query:', e);
            return;
        }

        this.elements.saveQueryName.value = '';
        this.renderSavedQueries();
    },

    // ============================================
    // SECTION 10: TABLE STATISTICS & HELPERS
    // ============================================

    showTableStats(tableName) {
        try {
            // Get column info
            const pragmaResult = this.db.exec(`PRAGMA table_info("${this.escapeSql(tableName)}")`);
            const columns = pragmaResult.length > 0 ? pragmaResult[0].values : [];

            // Get row count
            const countResult = this.db.exec(`SELECT COUNT(*) FROM "${this.escapeSql(tableName)}"`);
            const rowCount = countResult.length > 0 ? countResult[0].values[0][0] : 0;

            // Update stats UI
            this.elements.statRowCount.textContent = rowCount.toLocaleString();
            this.elements.statColumnCount.textContent = columns.length;

            // Build columns stats list
            let columnsHtml = '';
            columns.forEach(col => {
                const colName = col[1];
                const colType = col[2] || 'ANY';
                const isPk = col[5] ? 'PK' : '';

                columnsHtml += `
                    <div class="column-stat">
                        <span class="column-stat-name">${this.escapeHtml(colName)}</span>
                        <span class="column-stat-info">${colType} ${isPk}</span>
                    </div>
                `;
            });

            this.elements.columnsStatsList.innerHTML = columnsHtml;
            this.elements.tableStatsCard.style.display = 'block';
        } catch (error) {
            console.error('Error loading table stats:', error);
        }
    },

    hideTableStats() {
        this.elements.tableStatsCard.style.display = 'none';
    },

    // ============================================
    // IMPLEMENTATION GAPS - New Methods
    // ============================================

    // View schema from table view button
    viewSchemaFromTable() {
        if (this.currentTable) {
            // Switch from table view back to main content view
            this.elements.tableView.style.display = 'none';
            this.elements.dbContent.style.display = 'flex';

            // Reset to columns view when opening from table view
            this.currentSchemaView = 'columns';
            this.showSchema(this.currentTable);
            this.switchTab('schema');

            // Update the schema nav buttons to reflect columns view
            this.elements.schemaContainer?.querySelectorAll('.schema-nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.schemaView === 'columns');
            });
        }
    },

    // Detect if a query modifies the database schema
    isSchemaChangingQuery(query) {
        const normalizedQuery = query.toUpperCase().trim();
        const schemaKeywords = [
            'CREATE TABLE', 'CREATE VIEW', 'CREATE INDEX', 'CREATE UNIQUE INDEX',
            'CREATE TRIGGER', 'CREATE VIRTUAL TABLE',
            'ALTER TABLE', 'DROP TABLE', 'DROP VIEW', 'DROP INDEX', 'DROP TRIGGER',
            'REINDEX', 'RENAME TABLE'
        ];
        return schemaKeywords.some(keyword => normalizedQuery.startsWith(keyword));
    },

    // Refresh table list after schema changes
    refreshSchema() {
        this.loadSchema();
    },

    // Export Database
    exportDatabase() {
        if (!this.db) {
            this.showError('No database loaded');
            return;
        }

        try {
            // Export the database as a Uint8Array
            const data = this.db.export();

            // Create a blob and download
            const blob = new Blob([data], { type: 'application/x-sqlite3' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.sanitizeFilename(this.elements.fileName.textContent || 'database.db');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Reset dirty flag after successful export
            this.isDirty = false;
            this.showSuccess('Database exported successfully');
        } catch (error) {
            this.showError(`Failed to export database: ${error.message}`);
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    SQLiteViewer.init();

    // Add context menu support for schema viewing
    document.addEventListener('contextmenu', (e) => {
        const tableCard = e.target.closest('.table-card');
        if (tableCard && SQLiteViewer.db) {
            e.preventDefault();
            const tableName = tableCard.querySelector('.table-name').textContent.trim();
            // Reset to columns view when opening from context menu
            SQLiteViewer.currentSchemaView = 'columns';
            SQLiteViewer.showSchema(tableName);
            SQLiteViewer.switchTab('schema');

            // Update the schema nav buttons
            SQLiteViewer.elements.schemaContainer?.querySelectorAll('.schema-nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.schemaView === 'columns');
            });
        }
    });
});
