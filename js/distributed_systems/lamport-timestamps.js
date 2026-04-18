// ============================================
// LAMPORT TIMESTAMP VISUALIZER
// ============================================

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#22c55e', '#06b6d4', '#3b82f6', '#6366f1',
    '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'
];

const MODES = {
    simple: {
        name: 'Simple Clock',
        description: 'Simple Lamport timestamps: each process has a single counter that increments on events and messages.'
    },
    vector: {
        name: 'Vector Clock',
        description: 'Vector clocks: each process maintains a vector of counters for precise causality tracking.'
    }
};

const EVENT_TYPES = {
    local: { symbol: 'E', name: 'Local Event', color: 'var(--accent-event)' },
    send: { symbol: 'S', name: 'Send', color: 'var(--accent-send)' },
    receive: { symbol: 'R', name: 'Receive', color: 'var(--accent-receive)' }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class LamportTimestampsVisualizer {
    constructor() {
        this.processes = [];
        this.events = [];
        this.pendingMessages = [];
        this.currentMode = 'simple';
        this.currentView = 'timeline';
        this.selectedEventType = 'local';
        this.isPlaying = false;
        this.currentEventIndex = -1;
        this.showFullSequenceWhenIdle = true;
        this.animationSpeed = 1000;
        this.messageCounter = 1;
        this.nextEventId = 1;
        this.canvas = null;
        this.ctx = null;
        this.animationInterval = null;

        this.init();
    }

    init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.cacheDOM();
        this.bindEvents();

        const restored = this.loadState();

        if (!restored) {
            this.loadExample('basic');
        } else {
            this.switchView(this.currentView);
            this.updateUI();
        }
    }

    cacheDOM() {
        this.dom = {
            // Mode selection
            modeBtns: document.querySelectorAll('.mode-btn'),
            modeDescription: document.getElementById('modeDescription'),

            // Process management
            processList: document.getElementById('processList'),
            processHint: document.getElementById('processHint'),
            addProcessBtn: document.getElementById('addProcessBtn'),

            // Event creation
            eventProcessSelect: document.getElementById('eventProcessSelect'),
            counterpartyGroup: document.getElementById('counterpartyGroup'),
            counterpartyLabel: document.getElementById('counterpartyLabel'),
            counterpartySelect: document.getElementById('counterpartySelect'),
            eventIdInput: document.getElementById('messageIdInput'),
            eventTypes: document.querySelectorAll('.event-type-btn'),
            addEventBtn: document.getElementById('addEventBtn'),

            // Animation
            stepBtn: document.getElementById('stepBtn'),
            playBtn: document.getElementById('playBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            animationProgress: document.getElementById('animationProgress'),
            eventCounter: document.getElementById('eventCounter'),

            // Visualization
            diagramPanel: document.querySelector('.diagram-panel'),
            diagramContainer: document.getElementById('diagramContainer'),
            diagramCanvas: document.getElementById('diagramCanvas'),
            viewToggles: document.querySelectorAll('.view-toggle'),
            exportTimelineBtn: document.getElementById('exportTimelineBtn'),
            clearLogBtn: document.getElementById('clearLogBtn'),
            exportLogBtn: document.getElementById('exportLogBtn'),
            logContainer: document.getElementById('logContainer'),

            // Stats
            currentState: document.getElementById('currentState'),
            statTotalEvents: document.getElementById('statTotalEvents'),
            statMessagesSent: document.getElementById('statMessagesSent'),
            statMessagesReceived: document.getElementById('statMessagesReceived'),
            statMaxTimestamp: document.getElementById('statMaxTimestamp'),
            statVectorSize: document.getElementById('statVectorSize'),
            causalityInfo: document.getElementById('causalityInfo'),

            // View
            diagramView: document.getElementById('diagramView'),
            timelineView: document.getElementById('timelineView'),
            timelineContent: document.querySelector('.timeline-content'),
            timelineContainer: document.getElementById('timelineContainer')
        };

        this.canvas = this.dom.diagramCanvas;
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
    }

    setupCanvas() {
        const resizeCanvas = () => {
            if (!this.dom.diagramCanvas || !this.dom.diagramContainer) return;

            this.canvas.width = this.dom.diagramContainer.clientWidth;
            this.canvas.height = this.dom.diagramContainer.clientHeight || 400;
            this.render();
        };

        window.addEventListener('resize', resizeCanvas);
        // Wait for DOM to fully load before sizing
        setTimeout(resizeCanvas, 100);
    }

    bindEvents() {
        // Mode selection
        this.dom.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        // Process management
        this.dom.addProcessBtn.addEventListener('click', () => this.addProcess());
        this.dom.processList.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.process-remove');
            if (!removeButton) return;

            const processId = parseInt(removeButton.dataset.processId, 10);
            if (processId) {
                this.removeProcess(processId);
            }
        });

        // Load example
        document.getElementById('loadExampleBtn')?.addEventListener('click', () => this.loadExample('basic'));

        this.dom.eventProcessSelect.addEventListener('change', () => {
            this.updateCounterpartyOptions();
            this.updateActionState();
        });

        this.dom.counterpartySelect.addEventListener('change', () => this.updateActionState());
        this.dom.eventIdInput.addEventListener('input', () => this.updateActionState());

        // Event type selection
        this.dom.eventTypes.forEach(btn => {
            btn.addEventListener('click', () => this.setEventType(btn.dataset.type));
        });

        // Event creation
        this.dom.addEventBtn.addEventListener('click', () => this.addEvent());

        // Animation controls
        this.dom.stepBtn.addEventListener('click', () => this.stepAnimation());
        this.dom.playBtn.addEventListener('click', () => this.startAnimation());
        this.dom.pauseBtn.addEventListener('click', () => this.pauseAnimation());
        this.dom.resetBtn.addEventListener('click', () => this.resetAnimation());

        // Speed control
        this.dom.speedSlider.addEventListener('input', (e) => {
            this.animationSpeed = parseInt(e.target.value);
            this.dom.speedValue.textContent = (1000 / this.animationSpeed).toFixed(1) + 'x';
        });

        // View toggles
        this.dom.viewToggles.forEach(toggle => {
            toggle.addEventListener('click', () => this.switchView(toggle.dataset.view));
        });

        // Log actions
        this.dom.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.dom.exportLogBtn.addEventListener('click', () => this.exportLog());
        this.dom.exportTimelineBtn?.addEventListener('click', () => this.exportTimeline());
        this.dom.timelineContainer.addEventListener('click', (event) => {
            const marker = event.target.closest('.timeline-marker');
            if (!marker) return;

            const eventId = parseInt(marker.dataset.eventId, 10);
            if (eventId) {
                this.showEventDetails(eventId);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch(e.key) {
                case ' ': // Space
                    e.preventDefault();
                    this.isPlaying ? this.pauseAnimation() : this.startAnimation();
                    break;
                case 'ArrowRight':
                    this.stepAnimation();
                    break;
                case 'Escape':
                    this.pauseAnimation();
                    break;
            }
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        this.dom.modeDescription.textContent = MODES[mode].description;

        this.dom.modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'vector') {
            this.processes.forEach(process => {
                process.vector = process.vector && process.vector.length === this.processes.length
                    ? process.vector
                    : new Array(this.processes.length).fill(0);
            });
            this.recomputeSequenceData();
        } else {
            this.processes.forEach(process => {
                process.vector = null;
            });
        }

        this.updateUI();
    }

    recomputeSequenceData() {
        const processStates = this.processes.map((process) => ({
            id: process.id,
            timestamp: 0,
            vector: this.currentMode === 'vector' ? new Array(this.processes.length).fill(0) : null
        }));
        const openMessages = [];

        this.events.forEach((event) => {
            const processState = processStates.find((process) => process.id === event.processId);
            if (!processState) {
                return;
            }

            if (event.type === 'local' || event.type === 'send') {
                processState.timestamp += 1;

                if (this.currentMode === 'vector' && processState.vector) {
                    processState.vector[processState.id - 1] += 1;
                    event.vector = [...processState.vector];
                }

                event.timestamp = processState.timestamp;
            }

            if (event.type === 'send' && event.targetProcessId) {
                openMessages.push({
                    id: event.messageId || '',
                    from: event.processId,
                    to: event.targetProcessId,
                    timestamp: event.timestamp,
                    vector: Array.isArray(event.vector) ? [...event.vector] : null,
                    sendEventId: event.id,
                    processed: false
                });
            }

            if (event.type === 'receive') {
                const matchingIndex = openMessages.findIndex((message) =>
                    message.from === event.receiveFrom &&
                    message.to === event.processId &&
                    (!event.messageId || message.id === event.messageId)
                );
                const matchingMessage = matchingIndex >= 0 ? openMessages[matchingIndex] : null;

                processState.timestamp = Math.max(processState.timestamp, matchingMessage?.timestamp || 0) + 1;

                if (this.currentMode === 'vector' && processState.vector) {
                    if (Array.isArray(matchingMessage?.vector)) {
                        for (let index = 0; index < processState.vector.length; index++) {
                            processState.vector[index] = Math.max(
                                processState.vector[index],
                                matchingMessage.vector[index] || 0
                            );
                        }
                    }

                    processState.vector[processState.id - 1] += 1;
                    event.vector = [...processState.vector];
                }

                event.timestamp = processState.timestamp;
                event.pairedSendEventId = matchingMessage?.sendEventId || event.pairedSendEventId || null;

                if (matchingIndex >= 0) {
                    openMessages.splice(matchingIndex, 1);
                }
            }

            if (this.currentMode !== 'vector') {
                event.vector = null;
            }
        });

        this.processes = this.processes.map((process) => {
            const processState = processStates.find((candidate) => candidate.id === process.id);
            return {
                ...process,
                timestamp: processState ? processState.timestamp : process.timestamp,
                vector: this.currentMode === 'vector' && processState?.vector
                    ? [...processState.vector]
                    : null
            };
        });

        this.pendingMessages = openMessages.map((message) => ({
            ...message,
            vector: Array.isArray(message.vector) ? [...message.vector] : null
        }));
    }

    setEventType(type) {
        this.selectedEventType = type;
        this.dom.eventTypes.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        this.updateCounterpartyOptions();

        this.updateActionState();
    }

    addProcess() {
        const id = this.processes.length + 1;
        const color = COLORS[(id - 1) % COLORS.length];

        if (this.currentMode === 'vector') {
            this.processes.forEach((process) => {
                if (!Array.isArray(process.vector)) {
                    process.vector = new Array(id).fill(0);
                    return;
                }

                while (process.vector.length < id) {
                    process.vector.push(0);
                }
            });

            this.events.forEach((event) => {
                if (!Array.isArray(event.vector)) return;
                while (event.vector.length < id) {
                    event.vector.push(0);
                }
            });

            this.pendingMessages.forEach((message) => {
                if (!Array.isArray(message.vector)) return;
                while (message.vector.length < id) {
                    message.vector.push(0);
                }
            });
        }

        this.processes.push({
            id,
            name: `P${id}`,
            color,
            timestamp: 0,
            vector: this.currentMode === 'vector' ? new Array(this.processes.length + 1).fill(0) : null
        });

        this.updateProcessList();
        this.updateProcessSelects();
        if (this.currentMode === 'vector' && this.events.length > 0) {
            this.recomputeSequenceData();
        }
        this.updateUI();
        this.saveState();
    }

    removeProcess(processId) {
        const processIndex = this.processes.findIndex(p => p.id === processId);
        if (processIndex === -1) return;

        // Remove process and shift IDs
        this.processes.splice(processIndex, 1);
        this.processes.forEach((p, i) => {
            p.id = i + 1;
            p.name = `P${i + 1}`;
            if (this.currentMode === 'vector' && Array.isArray(p.vector)) {
                p.vector = p.vector.filter((_, index) => index !== processId - 1);
            }
        });

        this.events = this.events
            .filter(event =>
                event.processId !== processId &&
                event.receiveFrom !== processId &&
                event.targetProcessId !== processId
            )
            .map(event => ({
                ...event,
                processId: event.processId > processId ? event.processId - 1 : event.processId,
                receiveFrom: event.receiveFrom && event.receiveFrom > processId ? event.receiveFrom - 1 : event.receiveFrom,
                targetProcessId: event.targetProcessId && event.targetProcessId > processId
                    ? event.targetProcessId - 1
                    : event.targetProcessId,
                vector: Array.isArray(event.vector)
                    ? event.vector.filter((_, index) => index !== processId - 1)
                    : event.vector
            }));

        this.pendingMessages = this.pendingMessages
            .filter(message => message.from !== processId && message.to !== processId)
            .map(message => ({
                ...message,
                from: message.from > processId ? message.from - 1 : message.from,
                to: message.to > processId ? message.to - 1 : message.to,
                vector: Array.isArray(message.vector)
                    ? message.vector.filter((_, index) => index !== processId - 1)
                    : message.vector
            }));

        this.currentEventIndex = -1;
        this.showFullSequenceWhenIdle = this.events.length > 0;
        this.recomputeSequenceData();
        this.updateProcessList();
        this.updateProcessSelects();
        this.updateUI();
        this.saveState();
    }

    updateProcessList(snapshot = this.buildStateSnapshot()) {
        this.dom.processList.innerHTML = this.processes.map(p => {
            const snapshotProcess = snapshot.processes.find((process) => process.id === p.id) || p;

            return `
            <div class="process-item">
                <div class="process-info">
                    <div class="process-color" style="--process-color: ${p.color}"></div>
                    <div>
                        <div class="process-name">${p.name}</div>
                        <div class="process-timestamp">${this.currentMode === 'vector' && snapshotProcess.vector ? `v=[${snapshotProcess.vector.join(',')}]` : `t=${snapshotProcess.timestamp}`}</div>
                    </div>
                </div>
                <button class="process-remove" data-process-id="${p.id}" type="button" title="Remove process">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
        }).join('');

        this.dom.processHint.style.display = this.processes.length === 0 ? 'block' : 'none';
        this.dom.processHint.textContent = this.processes.length === 0
            ? 'Add processes to start creating events'
            : `You have ${this.processes.length} process${this.processes.length !== 1 ? 'es' : ''}`;
    }

    updateProcessSelects() {
        const selectedProcessId = this.dom.eventProcessSelect.value;
        const options = this.processes.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        this.dom.eventProcessSelect.innerHTML = `
            <option value="">Select process...</option>
            ${options}
        `;
        this.dom.eventProcessSelect.disabled = this.processes.length === 0;

        if (selectedProcessId && this.processes.some(p => String(p.id) === selectedProcessId)) {
            this.dom.eventProcessSelect.value = selectedProcessId;
        }

        this.updateCounterpartyOptions();
        this.updateActionState();
    }

    updateCounterpartyOptions() {
        const needsCounterparty = this.selectedEventType === 'send' || this.selectedEventType === 'receive';
        const selectedProcessId = parseInt(this.dom.eventProcessSelect.value, 10);
        const previousValue = this.dom.counterpartySelect.value;

        this.dom.counterpartyGroup.hidden = !needsCounterparty;

        if (!needsCounterparty) {
            this.dom.counterpartySelect.innerHTML = '<option value="">Select process</option>';
            this.dom.counterpartySelect.disabled = true;
            return;
        }

        const labelText = this.selectedEventType === 'send' ? 'Send To' : 'Receive From';
        this.dom.counterpartyLabel.textContent = labelText;

        const availableProcesses = this.processes.filter(p => p.id !== selectedProcessId);
        const placeholder = this.selectedEventType === 'send' ? 'Select destination' : 'Select sender';
        this.dom.counterpartySelect.innerHTML = `
            <option value="">${placeholder}</option>
            ${availableProcesses.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        `;
        this.dom.counterpartySelect.disabled = !selectedProcessId || availableProcesses.length === 0;

        if (availableProcesses.some(p => String(p.id) === previousValue)) {
            this.dom.counterpartySelect.value = previousValue;
        }
    }

    updateActionState() {
        const hasProcess = this.dom.eventProcessSelect.value !== '';
        const needsCounterparty = this.selectedEventType === 'send' || this.selectedEventType === 'receive';
        const hasCounterparty = !needsCounterparty || this.dom.counterpartySelect.value !== '';

        this.dom.addEventBtn.disabled = !hasProcess || !hasCounterparty;
    }

    addEvent() {
        const processId = parseInt(this.dom.eventProcessSelect.value);
        if (!processId) return;

        const process = this.processes.find(p => p.id === processId);
        if (!process) return;

        const counterpartyId = parseInt(this.dom.counterpartySelect.value, 10) || null;
        const requestedMessageId = this.dom.eventIdInput.value.trim();
        let event = null;

        switch (this.selectedEventType) {
            case 'local':
                event = this.createLocalEvent(process);
                break;
            case 'send':
                if (!counterpartyId) return;
                event = this.createSendEvent(process, counterpartyId, requestedMessageId);
                break;
            case 'receive':
                if (!counterpartyId) return;
                event = this.createReceiveEvent(process, counterpartyId, requestedMessageId);
                break;
        }

        if (!event) return;

        this.events.push(event);
        this.currentEventIndex = -1;
        this.showFullSequenceWhenIdle = true;
        this.updateUI();

        // Clear form
        this.dom.eventIdInput.value = '';

        this.saveState();
    }

    createEventRecord({
        type,
        processId,
        timestamp,
        vector,
        messageId = null,
        receiveFrom = null,
        targetProcessId = null,
        pairedSendEventId = null
    }) {
        return {
            id: this.nextEventId++,
            type,
            processId,
            timestamp,
            vector,
            messageId,
            receiveFrom,
            targetProcessId,
            pairedSendEventId,
            createdAt: Date.now()
        };
    }

    incrementProcessClock(process) {
        process.timestamp++;

        if (this.currentMode === 'vector') {
            if (!process.vector || process.vector.length !== this.processes.length) {
                process.vector = new Array(this.processes.length).fill(0);
            }
            process.vector[process.id - 1] = (process.vector[process.id - 1] || 0) + 1;
        }
    }

    createLocalEvent(process) {
        this.incrementProcessClock(process);

        return this.createEventRecord({
            type: 'local',
            processId: process.id,
            timestamp: process.timestamp,
            vector: this.currentMode === 'vector' ? [...process.vector] : null
        });
    }

    createSendEvent(sender, receiverId, requestedMessageId) {
        this.incrementProcessClock(sender);

        const messageId = requestedMessageId || `M${this.messageCounter++}`;
        const event = this.createEventRecord({
            type: 'send',
            processId: sender.id,
            timestamp: sender.timestamp,
            vector: this.currentMode === 'vector' ? [...sender.vector] : null,
            messageId,
            targetProcessId: receiverId
        });

        this.pendingMessages.push({
            id: messageId,
            from: sender.id,
            to: receiverId,
            timestamp: event.timestamp,
            vector: event.vector ? [...event.vector] : null,
            sendEventId: event.id,
            processed: false
        });

        return event;
    }

    createReceiveEvent(receiver, sourceId, requestedMessageId) {
        const matchingMessage = this.findPendingMessage(sourceId, receiver.id, requestedMessageId);

        if (!matchingMessage) {
            alert(requestedMessageId
                ? `No pending message "${requestedMessageId}" from P${sourceId} to ${receiver.name}.`
                : `No pending message from P${sourceId} to ${receiver.name}.`);
            return null;
        }

        matchingMessage.processed = true;
        receiver.timestamp = Math.max(receiver.timestamp, matchingMessage.timestamp) + 1;

        if (this.currentMode === 'vector') {
            if (!receiver.vector || receiver.vector.length !== this.processes.length) {
                receiver.vector = new Array(this.processes.length).fill(0);
            }

            const messageVector = matchingMessage.vector || new Array(this.processes.length).fill(0);
            for (let i = 0; i < receiver.vector.length; i++) {
                receiver.vector[i] = Math.max(receiver.vector[i], messageVector[i] || 0);
            }
            receiver.vector[receiver.id - 1] = (receiver.vector[receiver.id - 1] || 0) + 1;
        }

        return this.createEventRecord({
            type: 'receive',
            processId: receiver.id,
            timestamp: receiver.timestamp,
            vector: this.currentMode === 'vector' ? [...receiver.vector] : null,
            messageId: matchingMessage.id,
            receiveFrom: sourceId,
            targetProcessId: receiver.id,
            pairedSendEventId: matchingMessage.sendEventId || null
        });
    }

    findPendingMessage(sourceId, receiverId, requestedMessageId) {
        return this.pendingMessages.find(message =>
            message.from === sourceId &&
            message.to === receiverId &&
            !message.processed &&
            (!requestedMessageId || message.id === requestedMessageId)
        ) || null;
    }

    updateStats(snapshot = this.buildStateSnapshot()) {
        const visibleEvents = snapshot.visibleEvents;
        const visibleProcesses = snapshot.processes;

        this.dom.statTotalEvents.textContent = visibleEvents.length;
        this.dom.statMessagesSent.textContent = visibleEvents.filter(e => e.type === 'send').length;
        this.dom.statMessagesReceived.textContent = visibleEvents.filter(e => e.type === 'receive').length;

        if (visibleProcesses.length > 0) {
            const maxTimestamp = Math.max(...visibleProcesses.map(p => p.timestamp));
            this.dom.statMaxTimestamp.textContent = maxTimestamp;
        } else {
            this.dom.statMaxTimestamp.textContent = '-';
        }

        if (this.currentMode === 'vector') {
            const vectorSize = visibleProcesses.length > 0 && visibleProcesses[0].vector ? visibleProcesses[0].vector.length : 0;
            this.dom.statVectorSize.textContent = vectorSize;
        } else {
            this.dom.statVectorSize.textContent = '-';
        }

        this.dom.eventCounter.textContent = visibleEvents.length === this.events.length
            ? `Events: ${visibleEvents.length}`
            : `Events: ${visibleEvents.length} / ${this.events.length}`;
    }

    updateLog(snapshot = this.buildStateSnapshot()) {
        const visibleEvents = snapshot.visibleEvents;

        if (visibleEvents.length === 0) {
            const emptyText = this.events.length > 0
                ? 'Step or play the sequence to reveal events'
                : 'No events yet';
            this.dom.logContainer.innerHTML = `<div class="log-empty">${emptyText}</div>`;
            return;
        }

        this.dom.logContainer.innerHTML = visibleEvents.slice().reverse().map(event => {
            const process = this.processes.find(p => p.id === event.processId);
            const type = EVENT_TYPES[event.type];
            const processName = process ? escapeHtml(process.name) : `P${event.processId}`;

            return `
                <div class="log-entry ${event.type}">
                    <div class="log-entry-header">
                        <span>${processName}</span>
                        <span>${type.symbol} ${event.id}</span>
                    </div>
                    <div class="log-entry-message">${type.name}</div>
                    ${event.receiveFrom ? `<div class="log-entry-id">From: P${event.receiveFrom}</div>` : ''}
                    ${event.targetProcessId && event.type === 'send' ? `<div class="log-entry-id">To: P${event.targetProcessId}</div>` : ''}
                    ${event.messageId ? `<div class="log-entry-id">Message: ${escapeHtml(event.messageId)}</div>` : ''}
                    <div class="log-entry-timestamp">
                        ${this.currentMode === 'vector' && event.vector
                            ? `Vector: [${event.vector.join(', ')}]`
                            : `t = ${event.timestamp}`}
                    </div>
                </div>
            `;
        }).join('');
    }

    getFocusedEvent() {
        if (this.currentEventIndex >= 0 && this.currentEventIndex < this.events.length) {
            return this.events[this.currentEventIndex];
        }

        if (!this.showFullSequenceWhenIdle) {
            return null;
        }

        return this.events.length > 0 ? this.events[this.events.length - 1] : null;
    }

    getPlaybackLimit() {
        if (this.currentEventIndex >= 0) {
            return Math.min(this.currentEventIndex + 1, this.events.length);
        }

        if (this.isPlaying) {
            return 0;
        }

        if (!this.showFullSequenceWhenIdle) {
            return 0;
        }

        return this.events.length;
    }

    buildStateSnapshot(limit = this.getPlaybackLimit()) {
        const boundedLimit = Math.max(0, Math.min(limit, this.events.length));
        const visibleEvents = this.events.slice(0, boundedLimit);
        const snapshotProcesses = this.processes.map((process) => ({
            id: process.id,
            name: process.name,
            color: process.color,
            timestamp: 0,
            vector: this.currentMode === 'vector' ? new Array(this.processes.length).fill(0) : null,
            highlighted: false
        }));
        const openMessages = [];

        visibleEvents.forEach((event) => {
            const snapshotProcess = snapshotProcesses.find((process) => process.id === event.processId);
            if (snapshotProcess) {
                snapshotProcess.timestamp = Number.isFinite(event.timestamp) ? event.timestamp : snapshotProcess.timestamp;

                if (this.currentMode === 'vector' && Array.isArray(event.vector)) {
                    snapshotProcess.vector = [...event.vector];
                }
            }

            if (event.type === 'send' && event.targetProcessId) {
                openMessages.push({
                    id: event.messageId || '',
                    from: event.processId,
                    to: event.targetProcessId,
                    timestamp: event.timestamp,
                    vector: Array.isArray(event.vector) ? [...event.vector] : null,
                    sendEventId: event.id
                });
            }

            if (event.type === 'receive' && event.receiveFrom) {
                const matchingIndex = openMessages.findIndex((message) =>
                    message.from === event.receiveFrom &&
                    message.to === event.processId &&
                    (!event.messageId || message.id === event.messageId)
                );

                if (matchingIndex !== -1) {
                    openMessages.splice(matchingIndex, 1);
                }
            }
        });

        const focusedEvent = visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1] : null;
        if (focusedEvent) {
            const focusedProcess = snapshotProcesses.find((process) => process.id === focusedEvent.processId);
            if (focusedProcess) {
                focusedProcess.highlighted = true;
            }
        }

        return {
            processes: snapshotProcesses,
            visibleEvents,
            focusedEvent,
            openMessages
        };
    }

    getTimelineMetrics(availableWidth = null, events = this.events) {
        const sequenceIndexById = new Map(events.map((event, index) => [event.id, index + 1]));
        const sequenceCount = Math.max(1, events.length);
        const labelWidth = 52;
        const columnGap = 18;
        const trackWidth = Math.max(680, sequenceCount * 112 + 96);
        const frameWidth = trackWidth + 84;
        const framePaddingY = 24;
        const fittedFrameWidth = availableWidth
            ? Math.max(520, availableWidth - 56)
            : frameWidth;
        const fittedTrackWidth = availableWidth
            ? Math.max(420, fittedFrameWidth - 84)
            : trackWidth;

        return {
            sequenceIndexById,
            sequenceCount,
            labelWidth,
            columnGap,
            trackWidth: fittedTrackWidth,
            frameWidth: fittedFrameWidth,
            exportTrackWidth: trackWidth,
            exportFrameWidth: frameWidth,
            framePaddingY,
            scale: 1
        };
    }

    getProcessName(processId) {
        return this.processes.find(process => process.id === processId)?.name || `P${processId}`;
    }

    describeEvent(event) {
        if (!event) return 'No event selected';

        const type = EVENT_TYPES[event.type];
        const processName = this.getProcessName(event.processId);

        if (event.type === 'send' && event.targetProcessId) {
            return `${type.symbol}${event.id} on ${processName} to ${this.getProcessName(event.targetProcessId)}`;
        }

        if (event.type === 'receive' && event.receiveFrom) {
            return `${type.symbol}${event.id} on ${processName} from ${this.getProcessName(event.receiveFrom)}`;
        }

        return `${type.symbol}${event.id} on ${processName}`;
    }

    vectorLessThanOrEqual(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }

        for (let index = 0; index < left.length; index++) {
            if ((left[index] || 0) > (right[index] || 0)) {
                return false;
            }
        }

        return true;
    }

    countConcurrentPairs(events = this.events) {
        if (this.currentMode !== 'vector') {
            return 0;
        }

        let concurrentPairs = 0;

        for (let leftIndex = 0; leftIndex < events.length; leftIndex++) {
            for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex++) {
                const left = events[leftIndex];
                const right = events[rightIndex];
                if (!left.vector || !right.vector) continue;

                const leftBeforeRight = this.vectorLessThanOrEqual(left.vector, right.vector);
                const rightBeforeLeft = this.vectorLessThanOrEqual(right.vector, left.vector);

                if (!leftBeforeRight && !rightBeforeLeft) {
                    concurrentPairs++;
                }
            }
        }

        return concurrentPairs;
    }

    updateCurrentState(snapshot = this.buildStateSnapshot()) {
        if (snapshot.processes.length === 0) {
            this.dom.currentState.innerHTML = `
                <div class="state-empty">
                    <p>Add events to see state</p>
                </div>
            `;
            return;
        }

        const focusedEvent = snapshot.focusedEvent;

        this.dom.currentState.innerHTML = snapshot.processes.map((process) => {
            const processEvents = snapshot.visibleEvents.filter(event => event.processId === process.id);
            const lastEvent = processEvents[processEvents.length - 1] || null;
            const clockLabel = this.currentMode === 'vector' && process.vector
                ? `v = [${process.vector.join(', ')}]`
                : `t = ${process.timestamp}`;
            const vectorHtml = this.currentMode === 'vector' && process.vector
                ? `
                    <div class="state-vector">
                        ${process.vector.map((value, index) => `
                            <div class="vector-item">
                                <span class="vector-label">P${index + 1}</span>
                                <span class="vector-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                `
                : '';

            return `
                <div class="state-card ${focusedEvent?.processId === process.id ? 'current' : ''}">
                    <div class="state-header">
                        <span class="state-process-name">${escapeHtml(process.name)}</span>
                        <span class="state-timestamp">${clockLabel}</span>
                    </div>
                    ${vectorHtml}
                    <div class="state-note">
                        ${processEvents.length} recorded event${processEvents.length === 1 ? '' : 's'}.
                        ${lastEvent ? `Last event: ${escapeHtml(this.describeEvent(lastEvent))}.` : 'No events recorded yet.'}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCausalityInfo(snapshot = this.buildStateSnapshot()) {
        if (snapshot.visibleEvents.length === 0) {
            this.dom.causalityInfo.innerHTML = `
                <div class="causality-empty">
                    Step through the sequence to analyze causality
                </div>
            `;
            return;
        }

        const focusedEvent = snapshot.focusedEvent;
        const completedMessages = snapshot.visibleEvents.filter(event => event.type === 'receive').length;
        const openMessages = snapshot.openMessages;
        const concurrentPairs = this.countConcurrentPairs(snapshot.visibleEvents);
        const recentDependencies = snapshot.visibleEvents
            .filter(event => event.type === 'receive')
            .slice(-4)
            .reverse()
            .map((receiveEvent) => {
                const sendEvent = this.findSendEventForReceive(receiveEvent, snapshot.visibleEvents);

                if (!sendEvent) {
                    return '';
                }

                return `
                    <div class="dependency-item">
                        ${escapeHtml(this.describeEvent(sendEvent))} to ${escapeHtml(this.describeEvent(receiveEvent))}
                    </div>
                `;
            })
            .filter(Boolean)
            .join('');

        const concurrencyNote = this.currentMode === 'vector'
            ? `${concurrentPairs} concurrent event pair${concurrentPairs === 1 ? '' : 's'} detected from the recorded vectors.`
            : 'Simple Lamport clocks preserve causal order, but they do not distinguish true concurrency.';

        const inFlightMarkup = openMessages.length === 0
            ? '<div class="dependency-item">No messages currently in flight.</div>'
            : openMessages.map((message) => `
                <div class="dependency-item">
                    ${escapeHtml(message.id)}: ${escapeHtml(this.getProcessName(message.from))} to ${escapeHtml(this.getProcessName(message.to))}
                </div>
            `).join('');

        this.dom.causalityInfo.innerHTML = `
            <div class="causality-section">
                <div class="causality-title">Current Read</div>
                <div class="dependency-list">
                    <div class="dependency-item">${escapeHtml(this.describeEvent(focusedEvent))}</div>
                    <div class="dependency-item">${completedMessages} completed message edge${completedMessages === 1 ? '' : 's'}</div>
                    <div class="dependency-item">${openMessages.length} message${openMessages.length === 1 ? '' : 's'} in flight</div>
                </div>
            </div>
            <div class="causality-section">
                <div class="causality-title">Recent Happens-Before Links</div>
                <div class="dependency-list">
                    ${recentDependencies || '<div class="dependency-item">Add a send/receive pair to create a causal edge.</div>'}
                </div>
            </div>
            <div class="causality-section">
                <div class="causality-title">Messages In Transit</div>
                <div class="dependency-list">
                    ${inFlightMarkup}
                </div>
            </div>
            <div class="causality-section">
                <div class="causality-title">Interpretation Note</div>
                <div class="dependency-list">
                    <div class="dependency-item">${escapeHtml(concurrencyNote)}</div>
                </div>
            </div>
        `;
    }

    updateUI() {
        const snapshot = this.buildStateSnapshot();

        this.updateProcessList(snapshot);
        this.updateProcessSelects();
        this.updateStats(snapshot);
        this.updateLog(snapshot);
        this.updateCurrentState(snapshot);
        this.updateCausalityInfo(snapshot);
        this.render(snapshot);

        // Update button states
        this.updateActionState();
        this.dom.stepBtn.disabled = this.events.length === 0 || this.currentEventIndex >= this.events.length - 1;
        this.dom.playBtn.disabled = this.events.length === 0 || this.currentEventIndex >= this.events.length - 1;
        this.dom.pauseBtn.disabled = !this.isPlaying;
        if (this.dom.exportTimelineBtn) {
            this.dom.exportTimelineBtn.disabled = this.events.length === 0;
        }
    }

    render(snapshot = this.buildStateSnapshot()) {
        // Hide canvas when timeline view is active
        const isTimelineActive = this.dom.timelineView && !this.dom.timelineView.classList.contains('hidden');

        if (this.dom.diagramCanvas) {
            this.dom.diagramCanvas.style.display = isTimelineActive ? 'none' : 'block';
        }

        if (isTimelineActive) {
            this.renderTimeline(snapshot);
            return;
        }

        if (this.canvas) {
            const { width, height } = this.canvas;
            this.ctx.clearRect(0, 0, width, height);

            if (this.processes.length === 0) {
                this.dom.diagramView.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        <p>Add processes and events to get started</p>
                    </div>
                `;
                this.drawEmptyState();
                return;
            }

            this.dom.diagramView.innerHTML = `
                <div class="diagram-mode-note">
                    Overview view: radial process summary. Use Timeline for the textbook left-to-right event order.
                </div>
            `;
            this.drawProcessDiagram(snapshot);
        }
    }

    drawEmptyState() {
        const { width, height } = this.canvas;
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
        this.ctx.font = '16px Space Grotesk';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Add processes and events to see the diagram', width / 2, height / 2);
    }

    drawProcessDiagram(snapshot = this.buildStateSnapshot()) {
        const { width, height } = this.canvas;
        const padding = 100;
        const availableWidth = width - padding * 2;
        const availableHeight = height - padding * 2;

        const radius = Math.min(availableWidth, availableHeight) / (2 * Math.max(1, snapshot.processes.length));
        const centerX = width / 2;
        const centerY = height / 2;

        const angleStep = (2 * Math.PI) / Math.max(1, snapshot.processes.length);
        const startAngle = -Math.PI / 2;
        const sendEvents = snapshot.visibleEvents.filter(event => event.type === 'send' && event.targetProcessId);

        if (sendEvents.length > 0) {
            sendEvents.forEach((messageEvent) => {
                const fromProcess = snapshot.processes.find(p => p.id === messageEvent.processId);
                const toProcess = snapshot.processes.find(p => p.id === messageEvent.targetProcessId);

                if (fromProcess && toProcess) {
                    const fromAngle = startAngle + (fromProcess.id - 1) * angleStep;
                    const toAngle = startAngle + (toProcess.id - 1) * angleStep;

                    const fromX = centerX + Math.cos(fromAngle) * availableWidth / 2;
                    const fromY = centerY + Math.sin(fromAngle) * availableHeight / 2;
                    const toX = centerX + Math.cos(toAngle) * availableWidth / 2;
                    const toY = centerY + Math.sin(toAngle) * availableHeight / 2;

                    this.drawArrow(
                        fromX,
                        fromY,
                        toX,
                        toY,
                        messageEvent.messageId,
                        messageEvent.timestamp,
                        snapshot.focusedEvent?.id === messageEvent.id
                    );
                }
            });
        }

        // Draw processes
        snapshot.processes.forEach((process, index) => {
            const angle = startAngle + index * angleStep;
            const x = centerX + Math.cos(angle) * availableWidth / 2;
            const y = centerY + Math.sin(angle) * availableHeight / 2;

            this.drawProcess(x, y, process, process.highlighted ? 2 : 1);
        });
    }

    drawProcess(x, y, process, ringSize) {
        const { width, height } = this.canvas;
        const baseRadius = 40;
        const radius = baseRadius + ringSize;

        // Outer ring for current event
        if (ringSize > 1) {
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = process.color;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        // Main circle
        this.ctx.beginPath();
        this.ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = process.color;
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Label
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
        this.ctx.font = 'bold 14px JetBrains Mono';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(process.name, x, y - 10);

        // Timestamp
        const timeLabel = this.currentMode === 'vector'
            ? `v[${process.vector?.join(',')}]`
            : `t=${process.timestamp}`;

        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clock-color');
        this.ctx.font = '12px JetBrains Mono';
        this.ctx.fillText(timeLabel, x, y + 10);
    }

    drawArrow(fromX, fromY, toX, toY, messageId, timestamp, highlighted) {
        const { width, height } = this.canvas;

        // Calculate midpoint
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;

        // Calculate perpendicular offset for text
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const perpAngle = angle + Math.PI / 2;
        const offset = 30;

        // Draw arrow line
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.strokeStyle = highlighted ? getComputedStyle(document.body).getPropertyValue('--accent-lamport') : getComputedStyle(document.body).getPropertyValue('--text-muted');
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw arrowhead
        const headLength = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fillStyle = highlighted ? getComputedStyle(document.body).getPropertyValue('--accent-lamport') : getComputedStyle(document.body).getPropertyValue('--text-muted');
        this.ctx.fill();

        // Draw message ID background
        const text = messageId || '';
        this.ctx.font = 'bold 11px JetBrains Mono';
        const textWidth = this.ctx.measureText(text).width;
        const padding = 6;

        this.ctx.fillStyle = highlighted
            ? getComputedStyle(document.body).getPropertyValue('--bg-card')
            : getComputedStyle(document.body).getPropertyValue('--bg-card');
        this.ctx.fillRect(
            midX - textWidth / 2 - padding,
            midY - 8 - padding,
            textWidth + padding * 2,
            16 + padding * 2
        );

        // Draw message ID
        this.ctx.fillStyle = highlighted
            ? getComputedStyle(document.body).getPropertyValue('--accent-lamport')
            : getComputedStyle(document.body).getPropertyValue('--text-primary');
        this.ctx.fillText(text, midX, midY);

        // Draw timestamp
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
        this.ctx.font = '9px JetBrains Mono';
        this.ctx.fillText(`t${timestamp}`, midX, midY + 12);
    }

    // Animation controls
    stepAnimation() {
        if (this.currentEventIndex < this.events.length - 1) {
            this.showFullSequenceWhenIdle = false;
            this.currentEventIndex++;
            this.highlightEvent(this.currentEventIndex);
            this.updateUI();
        }
    }

    startAnimation() {
        if (this.currentEventIndex >= this.events.length - 1) {
            this.currentEventIndex = -1;
        }

        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }

        this.showFullSequenceWhenIdle = false;
        this.isPlaying = true;
        this.updateUI();

        this.animationInterval = setInterval(() => {
            if (this.currentEventIndex < this.events.length - 1) {
                this.currentEventIndex++;
                this.highlightEvent(this.currentEventIndex);
                this.updateUI();
            } else {
                this.pauseAnimation();
            }
        }, this.animationSpeed);
    }

    pauseAnimation() {
        this.isPlaying = false;
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }
        this.updateUI();
    }

    resetAnimation() {
        this.showFullSequenceWhenIdle = false;
        this.pauseAnimation();
        this.currentEventIndex = -1;
        this.highlightEvent(-1);
        this.updateUI();
    }

    highlightEvent(eventIndex) {
        // Clear previous highlights
        this.processes.forEach((process, index) => {
            process.highlighted = false;
        });

        if (eventIndex >= 0 && eventIndex < this.events.length) {
            const event = this.events[eventIndex];
            const process = this.processes.find(p => p.id === event.processId);
            if (process) {
                process.highlighted = true;
            }
        }

        this.render();

        // Update progress bar
        const progress = eventIndex >= 0 ? (eventIndex + 1) / this.events.length * 100 : 0;
        this.dom.animationProgress.style.width = `${progress}%`;
    }

    switchView(view) {
        this.currentView = view;
        this.dom.viewToggles.forEach(t => {
            t.classList.toggle('active', t.dataset.view === view);
        });
        this.dom.diagramPanel?.classList.toggle('timeline-active', view === 'timeline');
        this.dom.diagramContainer?.classList.toggle('timeline-active', view === 'timeline');

        if (view === 'diagram') {
            this.dom.diagramView.classList.remove('hidden');
            this.dom.timelineView.classList.add('hidden');
            this.render(); // Render the canvas diagram
        } else {
            this.dom.diagramView.classList.add('hidden');
            this.dom.timelineView.classList.remove('hidden');
            setTimeout(() => this.renderTimeline(this.buildStateSnapshot()), 0);
        }

        this.saveState();
    }

    renderTimeline(snapshot = this.buildStateSnapshot()) {
        const container = this.dom.timelineContainer;

        if (!container) return;

        if (this.processes.length === 0) {
            container.innerHTML = '<div class="timeline-empty">Add processes to see the timeline.</div>';
            return;
        }

        const visibleEvents = snapshot.visibleEvents;
        const metrics = this.getTimelineMetrics(
            this.dom.timelineContent?.clientWidth || this.dom.diagramContainer?.clientWidth || container.clientWidth,
            visibleEvents
        );
        const activeEventId = snapshot.focusedEvent?.id || null;

        const rowsHtml = this.processes.map(process => {
            const processEvents = visibleEvents
                .filter(event => event.processId === process.id)
                .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);

            const eventsHtml = processEvents.map(event => {
                const sequenceIndex = metrics.sequenceIndexById.get(event.id) || 1;
                const leftPos = this.getTimelineLeft(sequenceIndex, metrics.sequenceCount, metrics.trackWidth);
                const markerLabel = this.getEventMarkerLabel(event);
                const timeLabel = this.currentMode === 'vector' && event.vector
                    ? `v[${event.vector.join(',')}]`
                    : `t=${event.timestamp}`;

                return `
                    <button class="timeline-marker ${event.id === activeEventId ? 'current' : ''}"
                            data-event-id="${event.id}"
                            type="button"
                            style="left: ${leftPos}px;"
                            aria-label="${markerLabel} on ${process.name}">
                        <span class="timeline-marker-label">${markerLabel}</span>
                        <span class="timeline-marker-time">${timeLabel}</span>
                    </button>
                `;
            }).join('');

            return `
                <div class="timeline-row timeline-process-p${process.id}">
                    <div class="timeline-row-label">${process.name}</div>
                    <div class="timeline-track" style="width: ${metrics.trackWidth}px;">
                        <div class="timeline-axis"></div>
                        ${eventsHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="timeline-scale-shell">
                <div class="timeline-scale-stage" style="width: ${metrics.frameWidth}px; transform: scale(${metrics.scale});">
                    <div class="timeline-frame" style="width: ${metrics.frameWidth}px;">
                <div class="timeline-time-direction">Time →</div>
                <div class="timeline-lanes">${rowsHtml}</div>
                <svg class="timeline-message-layer" aria-hidden="true"></svg>
                    </div>
                </div>
            </div>
        `;

        const timeDirection = container.querySelector('.timeline-time-direction');
        if (timeDirection) {
            timeDirection.textContent = 'Time ->';
        }

        const frame = container.querySelector('.timeline-frame');
        if (frame) {
            frame.insertAdjacentHTML('beforeend', `
                <div class="timeline-legend-box" aria-hidden="true">
                    <div class="timeline-legend-row">
                        <span class="timeline-legend-dot"></span>
                        <span>Instruction or step</span>
                    </div>
                    <div class="timeline-legend-row">
                        <span class="timeline-legend-arrow"></span>
                        <span>Message</span>
                    </div>
                </div>
            `);
        }

        const scaleShell = container.querySelector('.timeline-scale-shell');
        const scaleStage = container.querySelector('.timeline-scale-stage');
        if (frame && scaleShell && scaleStage) {
            const frameHeight = frame.scrollHeight;
            scaleStage.style.height = `${frameHeight}px`;
            scaleShell.style.height = `${Math.ceil(frameHeight * metrics.scale)}px`;
        }

        this.renderTimelineMessageLayer(container, visibleEvents);
    }

    getTimelineLeft(timestamp, maxTimestamp, trackWidth) {
        const minLeft = 18;
        const maxLeft = trackWidth - 18;
        const ratio = maxTimestamp <= 1 ? 0.12 : (timestamp - 1) / Math.max(1, maxTimestamp - 1);
        return Math.round(minLeft + ratio * Math.max(0, maxLeft - minLeft));
    }

    getEventMarkerLabel(event) {
        return `${EVENT_TYPES[event.type].symbol}${event.id}`;
    }

    findReceiveEventForSend(sendEvent, events = this.events) {
        return events.find(event =>
            event.type === 'receive' &&
            (
                event.pairedSendEventId === sendEvent.id ||
                (
                    !event.pairedSendEventId &&
                    event.messageId === sendEvent.messageId &&
                    event.receiveFrom === sendEvent.processId
                )
            )
        ) || null;
    }

    findSendEventForReceive(receiveEvent, events = this.events) {
        return events.find(event =>
            event.type === 'send' &&
            (
                event.id === receiveEvent.pairedSendEventId ||
                (
                    !receiveEvent.pairedSendEventId &&
                    event.messageId === receiveEvent.messageId &&
                    event.processId === receiveEvent.receiveFrom
                )
            )
        ) || null;
    }

    renderTimelineMessageLayer(container, events = this.events) {
        const frame = container.querySelector('.timeline-frame');
        const svg = container.querySelector('.timeline-message-layer');

        if (!frame || !svg) return;

        const width = Math.max(1, Math.ceil(frame.clientWidth));
        const height = Math.max(1, Math.ceil(frame.clientHeight));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));

        const defs = `
            <defs>
                <marker id="timelineArrowHead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>
                </marker>
            </defs>
        `;

        const frameBox = frame.getBoundingClientRect();
        const paths = events
            .filter(event => event.type === 'send')
            .map(sendEvent => {
                const receiveEvent = this.findReceiveEventForSend(sendEvent, events);
                if (!receiveEvent) return '';

                const startMarker = frame.querySelector(`[data-event-id="${sendEvent.id}"]`);
                const endMarker = frame.querySelector(`[data-event-id="${receiveEvent.id}"]`);
                if (!startMarker || !endMarker) return '';

                const startBox = startMarker.getBoundingClientRect();
                const endBox = endMarker.getBoundingClientRect();

                let startX = startBox.left - frameBox.left + startBox.width / 2;
                let startY = startBox.top - frameBox.top + startBox.height / 2;
                let endX = endBox.left - frameBox.left + endBox.width / 2;
                let endY = endBox.top - frameBox.top + endBox.height / 2;

                const angle = Math.atan2(endY - startY, endX - startX);
                const inset = 12;
                startX += Math.cos(angle) * inset;
                startY += Math.sin(angle) * inset;
                endX -= Math.cos(angle) * inset;
                endY -= Math.sin(angle) * inset;

                const controlX = (startX + endX) / 2;
                const pathD = `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
                const labelX = (startX + endX) / 2;
                const labelY = (startY + endY) / 2 - 8;
                const messageLabel = escapeHtml(sendEvent.messageId || '');

                return `
                    <path class="timeline-message-path" d="${pathD}" marker-end="url(#timelineArrowHead)"></path>
                    ${messageLabel ? `<text class="timeline-message-label" x="${labelX}" y="${labelY}" text-anchor="middle">${messageLabel}</text>` : ''}
                `;
            })
            .join('');

        svg.style.color = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();
        svg.innerHTML = `${defs}${paths}`;
    }

    showEventDetails(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        const process = this.processes.find(p => p.id === event.processId);
        const type = EVENT_TYPES[event.type];

        // Remove existing popup
        const existingPopup = document.querySelector('.timeline-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Add new popup
        const marker = document.querySelector(`[data-event-id="${eventId}"]`);
        if (marker) {
            const popup = document.createElement('div');
            popup.className = 'timeline-popup';
            popup.innerHTML = `
                <div class="timeline-popup-title">${type.symbol} ${event.id}: ${type.name}</div>
                <div class="timeline-popup-content">
                    <div class="timeline-event-info">
                        <div class="timeline-event-type">${process ? process.name : 'Unknown process'}</div>
                        <div class="timeline-event-process">
                            ${event.type === 'send' && event.targetProcessId ? `To P${event.targetProcessId}` : ''}
                            ${event.type === 'receive' && event.receiveFrom ? `From P${event.receiveFrom}` : ''}
                            ${event.type === 'local' ? 'Local event' : ''}
                        </div>
                        <div class="timeline-event-time">
                            ${this.currentMode === 'vector' && event.vector
                                ? `Vector: [${event.vector.join(', ')}]`
                                : `t = ${event.timestamp}`}
                        </div>
                        ${event.messageId ? `<div>Message: ${escapeHtml(event.messageId)}</div>` : ''}
                    </div>
                </div>
            `;
            marker.appendChild(popup);

            // Click outside to close
            setTimeout(() => {
                document.addEventListener('click', function closePopup(e) {
                    if (!e.target.closest('.timeline-marker')) {
                        popup.remove();
                        document.removeEventListener('click', closePopup);
                    }
                });
            }, 100);
        }
    }

    // Log and export
    clearLog() {
        this.events = [];
        this.pendingMessages = [];
        this.messageCounter = 1;
        this.nextEventId = 1;
        this.currentEventIndex = -1;
        this.showFullSequenceWhenIdle = false;
        this.recomputeSequenceData();
        this.pauseAnimation();
        this.updateUI();
        this.saveState();
    }

    exportLog() {
        if (this.events.length === 0) {
            alert('No events to export');
            return;
        }

        const data = {
            mode: this.currentMode,
            exportTime: new Date().toISOString(),
            view: this.currentView,
            nextEventId: this.nextEventId,
            processes: this.processes.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                timestamp: p.timestamp,
                vector: p.vector
            })),
            events: this.events.map(e => ({
                id: e.id,
                type: e.type,
                processId: e.processId,
                timestamp: e.timestamp,
                vector: e.vector,
                messageId: e.messageId,
                receiveFrom: e.receiveFrom,
                targetProcessId: e.targetProcessId,
                pairedSendEventId: e.pairedSendEventId,
                createdAt: e.createdAt
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lamport-timestamps-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportTimeline() {
        if (this.events.length === 0) {
            alert('No timeline to export');
            return;
        }

        const svg = this.buildTimelineExportSvg();
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lamport-timeline-${Date.now()}.svg`;
        link.click();
        URL.revokeObjectURL(url);
    }

    buildTimelineExportSvg() {
        const metrics = this.getTimelineMetrics(null);
        const outerPaddingX = 28;
        const outerPaddingTop = 28;
        const timeDirectionHeight = 26;
        const rowHeight = 86;
        const rowGap = 34;
        const legendWidth = 220;
        const legendHeight = 88;
        const axisInsetRight = 18;
        const axisStartX = outerPaddingX + metrics.labelWidth + metrics.columnGap;
        const rowsHeight = this.processes.length * rowHeight + Math.max(0, this.processes.length - 1) * rowGap;
        const frameHeight = outerPaddingTop + timeDirectionHeight + rowsHeight + legendHeight + 40;
        const svgWidth = outerPaddingX * 2 + metrics.frameWidth;
        const svgHeight = frameHeight;

        const markerPositions = new Map();
        const laneMarkup = this.processes.map((process, rowIndex) => {
            const axisY = outerPaddingTop + timeDirectionHeight + rowIndex * (rowHeight + rowGap) + rowHeight / 2;
            const labelX = outerPaddingX;
            const axisEndX = axisStartX + metrics.trackWidth - axisInsetRight;
            const processEvents = this.events
                .filter((event) => event.processId === process.id)
                .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);

            const eventsMarkup = processEvents.map((event) => {
                const sequenceIndex = metrics.sequenceIndexById.get(event.id) || 1;
                const x = axisStartX + this.getTimelineLeft(sequenceIndex, metrics.sequenceCount, metrics.trackWidth);
                const markerLabel = escapeHtml(this.getEventMarkerLabel(event));
                const timeLabel = escapeHtml(
                    this.currentMode === 'vector' && event.vector
                        ? `v[${event.vector.join(',')}]`
                        : `t=${event.timestamp}`
                );

                markerPositions.set(event.id, { x, y: axisY });

                return `
                    <circle cx="${x}" cy="${axisY}" r="9" fill="#111827" stroke="#ffffff" stroke-width="3"></circle>
                    <text x="${x}" y="${axisY - 18}" font-family="Georgia, 'Times New Roman', serif" font-size="17" font-style="italic" text-anchor="middle" fill="#111827">${markerLabel}</text>
                    <text x="${x}" y="${axisY + 28}" font-family="'JetBrains Mono', monospace" font-size="11" text-anchor="middle" fill="#6b7280">${timeLabel}</text>
                `;
            }).join('');

            return `
                <text x="${labelX}" y="${axisY + 6}" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="700" fill="#111827">${escapeHtml(process.name)}</text>
                <line x1="${axisStartX}" y1="${axisY}" x2="${axisEndX}" y2="${axisY}" stroke="#111827" stroke-width="2"></line>
                <path d="M ${axisEndX - 10} ${axisY - 6} L ${axisEndX} ${axisY} L ${axisEndX - 10} ${axisY + 6}" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                ${eventsMarkup}
            `;
        }).join('');

        const messageMarkup = this.events
            .filter((event) => event.type === 'send')
            .map((sendEvent) => {
                const receiveEvent = this.findReceiveEventForSend(sendEvent);
                if (!receiveEvent) {
                    return '';
                }

                const start = markerPositions.get(sendEvent.id);
                const end = markerPositions.get(receiveEvent.id);
                if (!start || !end) {
                    return '';
                }

                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                const inset = 12;
                const startX = start.x + Math.cos(angle) * inset;
                const startY = start.y + Math.sin(angle) * inset;
                const endX = end.x - Math.cos(angle) * inset;
                const endY = end.y - Math.sin(angle) * inset;
                const controlX = (startX + endX) / 2;
                const labelX = (startX + endX) / 2;
                const labelY = (startY + endY) / 2 - 8;

                return `
                    <path d="M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}" fill="none" stroke="#6b7280" stroke-width="1.4" marker-end="url(#timelineArrowHead)"></path>
                    ${sendEvent.messageId ? `<text x="${labelX}" y="${labelY}" font-family="'JetBrains Mono', monospace" font-size="11" text-anchor="middle" fill="#6b7280">${escapeHtml(sendEvent.messageId)}</text>` : ''}
                `;
            })
            .join('');

        const legendX = svgWidth - outerPaddingX - legendWidth;
        const legendY = svgHeight - legendHeight - 12;
        const timeLabelX = svgWidth - outerPaddingX - 10;

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
    <defs>
        <marker id="timelineArrowHead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#6b7280"></path>
        </marker>
    </defs>
    <rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff"></rect>
    <text x="${timeLabelX}" y="${outerPaddingTop}" font-family="'JetBrains Mono', monospace" font-size="12" text-anchor="end" fill="#6b7280">Time -&gt;</text>
    ${laneMarkup}
    ${messageMarkup}
    <g transform="translate(${legendX}, ${legendY})">
        <rect x="0" y="0" width="${legendWidth}" height="${legendHeight}" fill="#ffffff" stroke="#9ca3af" stroke-width="1.2" rx="8"></rect>
        <circle cx="22" cy="24" r="7" fill="#111827"></circle>
        <text x="54" y="31" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-style="italic" fill="#111827">Instruction or step</text>
        <line x1="8" y1="56" x2="58" y2="56" stroke="#9ca3af" stroke-width="1.4"></line>
        <path d="M 50 50 L 58 56 L 50 62" fill="none" stroke="#9ca3af" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
        <text x="70" y="63" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-style="italic" fill="#111827">Message</text>
    </g>
</svg>`;
    }

    // State persistence
    saveState() {
        const state = {
            mode: this.currentMode,
            view: this.currentView,
            processes: this.processes.map(process => ({
                id: process.id,
                name: process.name,
                color: process.color,
                timestamp: process.timestamp,
                vector: process.vector
            })),
            events: this.events,
            pendingMessages: this.pendingMessages,
            messageCounter: this.messageCounter,
            nextEventId: this.nextEventId
        };

        try {
            localStorage.setItem('lamportTimestampsState', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem('lamportTimestampsState');
            if (!saved) return false;

            const state = JSON.parse(saved);

            // Load mode
            if (state.mode && MODES[state.mode]) {
                this.currentMode = state.mode;
            }

            this.currentView = state.view === 'diagram' ? 'diagram' : 'timeline';

            if (Array.isArray(state.processes) && state.processes.length > 0) {
                this.processes = state.processes.map(process => ({
                    id: process.id,
                    name: process.name || `P${process.id}`,
                    color: process.color || COLORS[(process.id - 1) % COLORS.length],
                    timestamp: Number.isFinite(process.timestamp) ? process.timestamp : 0,
                    vector: this.currentMode === 'vector'
                        ? (Array.isArray(process.vector) ? process.vector : new Array(state.processes.length).fill(0))
                        : null
                }));
            }

            // Load events
            this.events = this.normalizeLoadedEvents(Array.isArray(state.events) ? state.events : []);
            this.pendingMessages = [];

            // Load message counter
            if (state.messageCounter) {
                this.messageCounter = state.messageCounter;
            } else {
                this.messageCounter = Math.max(...this.events.map(e => parseInt(String(e.messageId || '').replace('M', ''), 10) || 0), 0) + 1;
            }

            if (Number.isFinite(state.nextEventId) && state.nextEventId > 0) {
                this.nextEventId = state.nextEventId;
            } else {
                this.nextEventId = Math.max(...this.events.map(event => event.id || 0), 0) + 1;
            }

            this.dom.modeDescription.textContent = MODES[this.currentMode].description;
            this.dom.modeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
            });

            if (this.events.length > 0) {
                this.recomputeSequenceData();
            }
            this.currentEventIndex = -1;
            this.showFullSequenceWhenIdle = this.events.length > 0;
            this.updateUI();
            return true;
        } catch (e) {
            console.warn('Failed to load state:', e);
            return false;
        }
    }

    loadExample(type) {
        if (type === 'basic') {
            // Clear existing events and processes
            this.events = [];
            this.pendingMessages = [];
            this.currentEventIndex = -1;
            this.messageCounter = 1;
            this.nextEventId = 1;
            this.showFullSequenceWhenIdle = true;

            // Add P1, P2, P3
            this.processes = [];
            this.addProcess();
            this.addProcess();
            this.addProcess();
            const p1 = this.processes.find(process => process.id === 1);
            const p2 = this.processes.find(process => process.id === 2);
            const p3 = this.processes.find(process => process.id === 3);

            if (p1 && p2 && p3) {
                this.events.push(this.createLocalEvent(p1));
                this.events.push(this.createSendEvent(p1, p2.id, 'M1'));
                this.events.push(this.createLocalEvent(p1));
                this.events.push(this.createLocalEvent(p3));
                this.events.push(this.createSendEvent(p3, p2.id, 'M2'));
                this.events.push(this.createReceiveEvent(p2, p1.id, 'M1'));
                this.events.push(this.createSendEvent(p2, p1.id, 'M3'));
                this.events.push(this.createReceiveEvent(p1, p2.id, 'M3'));
                this.events.push(this.createReceiveEvent(p2, p3.id, 'M2'));
            }

            this.updateUI();
            this.switchView('timeline');
            this.saveState();
        }
    }

    normalizeLoadedEvents(events) {
        const oldToNewId = new Map();

        return events.map((event, index) => {
            const nextId = index + 1;
            if (Number.isFinite(event?.id) && !oldToNewId.has(event.id)) {
                oldToNewId.set(event.id, nextId);
            }

            return {
                ...event,
                id: nextId,
                pairedSendEventId: Number.isFinite(event?.pairedSendEventId)
                    ? oldToNewId.get(event.pairedSendEventId) ?? null
                    : null,
                createdAt: Number.isFinite(event?.createdAt) ? event.createdAt : Date.now() + index
            };
        });
    }
}

// Initialize the application
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new LamportTimestampsVisualizer();
    window.app = app;
});
