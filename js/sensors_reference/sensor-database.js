/* ============================================
   Sensor Database - JavaScript
   ============================================ */

const SensorDatabase = (() => {
    // Private state
    let sortState = {
        column: -1,
        direction: null // 'asc' or 'desc'
    };
    let searchTimeout = null;

    /**
     * Debounce function to limit execution frequency
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, delay) {
        return function(...args) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Filters the sensor table based on search input.
     * Searches across all columns and updates the results count.
     * Shows/hides the clear button and results indicator based on search state.
     * Sets aria-hidden attribute on filtered rows for accessibility.
     */
    function filterTable() {
        const input = document.getElementById("searchInput");
        const filter = input.value.toUpperCase();
        const table = document.getElementById("sensorTable");
        const tr = table.getElementsByTagName("tr");
        const clearBtn = document.getElementById("clearSearch");
        const resultsCount = document.getElementById("resultsCount");

        let visibleCount = 0;
        const totalCount = tr.length - 1; // Exclude header row

        for (let i = 1; i < tr.length; i++) {
            // Skip category headers
            if (tr[i].classList.contains("category-row")) continue;

            let tds = tr[i].getElementsByTagName("td");
            let found = false;
            // Search all columns
            for (let j = 0; j < tds.length; j++) {
                if (tds[j]) {
                    let txtValue = tds[j].textContent || "";
                    if (txtValue.toUpperCase().indexOf(filter) > -1) {
                        found = true;
                        break;
                    }
                }
            }
            tr[i].style.display = found ? "" : "none";
            tr[i].setAttribute("aria-hidden", (!found).toString());
            if (found) visibleCount++;
        }

        // Update UI based on search state
        const hasSearch = filter.length > 0;
        if (clearBtn) {
            clearBtn.classList.toggle("visible", hasSearch);
        }
        if (resultsCount) {
            if (hasSearch) {
                resultsCount.textContent = `${visibleCount} of ${totalCount} sensors`;
                resultsCount.classList.add("visible");
            } else {
                resultsCount.classList.remove("visible");
            }
        }
    }

    /**
     * Clears the search input and resets the table to show all rows.
     * Hides the clear button and results count indicator.
     * Removes aria-hidden attribute from all rows.
     * Refocuses the search input for continued searching.
     */
    function clearSearch() {
        const input = document.getElementById("searchInput");
        const table = document.getElementById("sensorTable");
        const tr = table.getElementsByTagName("tr");

        input.value = "";
        input.focus();

        // Show all rows
        for (let i = 1; i < tr.length; i++) {
            tr[i].style.display = "";
            tr[i].removeAttribute("aria-hidden");
        }

        // Hide clear button and results count
        const clearBtn = document.getElementById("clearSearch");
        const resultsCount = document.getElementById("resultsCount");
        if (clearBtn) clearBtn.classList.remove("visible");
        if (resultsCount) resultsCount.classList.remove("visible");
    }

    /**
     * Parses a cost tag element into a numeric sort value.
     * Cost levels: $ (<15), $$ (<60), $$$ (<200), $$$$ (>200)
     * @param {HTMLElement} td - The table cell containing a cost tag
     * @returns {number} Numeric value for sorting (15, 60, 200, 201)
     */
    function parseCostValue(td) {
        const costTag = td?.querySelector('.cost-tag');
        if (!costTag) return 999; // Unknown costs sort last

        if (costTag.classList.contains('cost-low')) return 15;      // $
        if (costTag.classList.contains('cost-med')) return 60;      // $$
        if (costTag.classList.contains('cost-high')) return 200;    // $$$$
        if (costTag.classList.contains('cost-extreme')) return 201; // $$$$
        return 999;
    }

    /**
     * Gets the sort value for a table cell.
     * For cost column (index 2), uses numeric cost parsing.
     * For other columns, uses text content.
     * @param {HTMLTableCellElement} td - Table cell to extract value from
     * @param {number} columnIndex - Column index (0-based)
     * @returns {string|number} Sort value
     */
    function getSortValue(td, columnIndex) {
        if (columnIndex === 2) {
            // Cost column - parse numeric value
            return parseCostValue(td);
        }
        return (td?.textContent || "").toLowerCase();
    }

    /**
     * Sorts the table by the specified column index.
     * Maintains category grouping - sorts only within each category section.
     * Updates aria-sort attributes for accessibility.
     * @param {number} n - Column index to sort by (0-based)
     */
    function sortTable(n) {
        const table = document.getElementById("sensorTable");
        const th = table.getElementsByTagName("TH")[n];
        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.rows);

        // Determine sort direction
        let dir = "asc";
        if (sortState.column === n && sortState.direction === "asc") {
            dir = "desc";
        }

        // Update sort state
        sortState.column = n;
        sortState.direction = dir;

        // Update all header classes and aria-sort
        const headers = table.getElementsByTagName("TH");
        for (let i = 0; i < headers.length; i++) {
            headers[i].classList.remove("sort-asc", "sort-desc");
            if (headers[i].hasAttribute("aria-sort")) {
                headers[i].setAttribute("aria-sort", "none");
            }
            const indicator = headers[i].querySelector(".sort-indicator svg");
            if (indicator) {
                indicator.innerHTML = '<polyline points="18 15 12 9 6 15"/>'; // default up arrow
            }
        }

        // Add active class to sorted column, rotate arrow, and update aria-sort
        th.classList.add(dir === "asc" ? "sort-asc" : "sort-desc");
        const ariaSortValue = dir === "asc" ? "ascending" : "descending";
        th.setAttribute("aria-sort", ariaSortValue);
        const activeIndicator = th.querySelector(".sort-indicator svg");
        if (activeIndicator) {
            if (dir === "desc") {
                activeIndicator.innerHTML = '<polyline points="6 9 12 15 18 9"/>'; // down arrow
            }
        }

        // Group rows by category
        const categories = [];
        let currentCategory = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.classList.contains("category-row")) {
                // Start a new category
                currentCategory = {
                    headerRow: row,
                    dataRows: []
                };
                categories.push(currentCategory);
            } else {
                // Add data row to current category
                if (currentCategory) {
                    currentCategory.dataRows.push(row);
                }
            }
        }

        // Sort data rows within each category
        categories.forEach(category => {
            category.dataRows.sort((a, b) => {
                const aVal = getSortValue(a.getElementsByTagName("TD")[n], n);
                const bVal = getSortValue(b.getElementsByTagName("TD")[n], n);
                if (dir === "asc") {
                    return aVal > bVal ? 1 : (aVal < bVal ? -1 : 0);
                } else {
                    return aVal < bVal ? 1 : (aVal > bVal ? -1 : 0);
                }
            });
        });

        // Rebuild the table with sorted rows
        categories.forEach(category => {
            tbody.appendChild(category.headerRow);
            category.dataRows.forEach(row => tbody.appendChild(row));
        });
    }

    /**
     * Initializes the sensor database functionality.
     * Sets up event listeners for search input, clear button, and table sorting.
     * Should be called when the DOM is ready.
     */
    function init() {
        // Search input listener with 150ms debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const debouncedFilter = debounce(filterTable, 150);
            searchInput.addEventListener('input', debouncedFilter);
        }

        // Clear search button listener
        const clearBtn = document.getElementById('clearSearch');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearSearch);
        }

        // Table header sort listeners
        const table = document.getElementById('sensorTable');
        if (table) {
            const headers = table.querySelectorAll('th[data-sort]');
            headers.forEach(th => {
                th.addEventListener('click', () => {
                    const columnIndex = parseInt(th.dataset.sort);
                    sortTable(columnIndex);
                });
            });
        }
    }

    // Public API
    return {
        init,
        filterTable,
        sortTable,
        clearSearch
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', SensorDatabase.init);
