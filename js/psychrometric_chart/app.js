(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        CHART.init();
        initEventListeners();
        PROCESS.init();
        calculate(); // Initial calculation
    });
})();
