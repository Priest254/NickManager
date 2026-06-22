let currentSchema = '';
let currentTable  = '';
let currentPage   = 1;
let currentColumns   = [];
let currentTotalRows = 0;
let currentPrimaryKey = null;
const PAGE_SIZE = 50;

let hasGeometry  = false;
let leafletMap   = null;
let geoJsonLayer = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function closeAllContextMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
}
document.addEventListener('click', closeAllContextMenus);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllContextMenus(); });

function showContextMenu(x, y, items) {
    closeAllContextMenus();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    items.forEach(item => {
        if (item === 'divider') {
            const d = document.createElement('div');
            d.className = 'context-menu-divider';
            menu.appendChild(d);
        } else {
            const btn = document.createElement('button');
            btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
            btn.innerHTML = `<span>${item.icon || ''}</span><span>${escapeHtml(item.label)}</span>`;
            btn.addEventListener('click', (e) => { e.stopPropagation(); closeAllContextMenus(); item.action(); });
            menu.appendChild(btn);
        }
    });
    document.body.appendChild(menu);

    // Position — keep inside viewport
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = (x + rect.width > vw ? vw - rect.width - 8 : x) + 'px';
    menu.style.top  = (y + rect.height > vh ? vh - rect.height - 8 : y) + 'px';
}

// ─── SQL Query Modal ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const queryBtn           = document.getElementById('query-btn');
    const queryModal         = document.getElementById('query-modal');
    const queryCloseBtn      = document.getElementById('query-close-btn');
    const queryCloseBtnFooter= document.getElementById('query-close-btn-footer');
    const queryRunBtn        = document.getElementById('query-run-btn');
    const queryInput         = document.getElementById('query-input');
    const queryResults       = document.getElementById('query-results');

    const closeQueryModal = () => queryModal.classList.remove('active');

    if (queryBtn)           queryBtn.addEventListener('click', () => { queryModal.classList.add('active'); queryInput.focus(); });
    if (queryCloseBtn)      queryCloseBtn.addEventListener('click', closeQueryModal);
    if (queryCloseBtnFooter)queryCloseBtnFooter.addEventListener('click', closeQueryModal);
    queryModal.addEventListener('click', (e) => { if (e.target === queryModal) closeQueryModal(); });

    if (queryInput) {
        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); queryRunBtn.click(); }
        });
    }

    if (queryRunBtn) {
        queryRunBtn.addEventListener('click', async () => {
            const query = queryInput.value.trim();
            if (!query) return;
            queryRunBtn.textContent = 'Running…';
            queryRunBtn.disabled = true;
            queryResults.innerHTML = '<div style="color:var(--text-secondary);">Executing…</div>';
            try {
                const res = await fetch('/api/crud/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });
                const result = await res.json();
                if (result.success) {
                    if (result.rows != null) {
                        const wrap = document.createElement('div');
                        wrap.style.overflowX = 'auto';
                        const tbl = document.createElement('table');
                        tbl.className = 'data-table';
                        const thead = document.createElement('thead');
                        const htr = document.createElement('tr');
                        result.columns.forEach(c => { const th = document.createElement('th'); th.textContent = c; htr.appendChild(th); });
                        thead.appendChild(htr);
                        const tbody = document.createElement('tbody');
                        result.rows.forEach(row => {
                            const tr = document.createElement('tr');
                            result.columns.forEach(c => {
                                const td = document.createElement('td');
                                const v = row[c];
                                td.textContent = v === null ? 'NULL' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
                                tr.appendChild(td);
                            });
                            tbody.appendChild(tr);
                        });
                        tbl.appendChild(thead);
                        tbl.appendChild(tbody);
                        wrap.appendChild(tbl);
                        queryResults.innerHTML = '';
                        queryResults.appendChild(wrap);
                        const info = document.createElement('div');
                        info.style.cssText = 'color:var(--text-secondary);font-size:0.78rem;margin-top:0.4rem;';
                        info.textContent = `${result.rows.length} row(s) returned.`;
                        queryResults.appendChild(info);
                    } else {
                        queryResults.innerHTML = `<div style="color:var(--success-color);">${escapeHtml(result.message)}</div>`;
                    }
                } else {
                    queryResults.innerHTML = `<div style="color:var(--danger-color);">Error: ${escapeHtml(result.error)}</div>`;
                }
            } catch (err) {
                queryResults.innerHTML = `<div style="color:var(--danger-color);">Error: ${escapeHtml(err.message)}</div>`;
            } finally {
                queryRunBtn.textContent = '▶ Run Query';
                queryRunBtn.disabled = false;
            }
        });
    }
});

// ─── Browser Tree ─────────────────────────────────────────────────────────────
window.loadBrowser = async function() {
    const container = document.getElementById('db-browser-container');
    container.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;">Loading…</div>';
    try {
        const res = await fetch('/api/browser/schemas');
        if (!res.ok) throw new Error('Failed to load schemas');
        const data = await res.json();
        container.innerHTML = '';
        if (!data.schemas.length) {
            container.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;">No schemas found.</div>';
            return;
        }
        data.schemas.forEach(schema => {
            container.appendChild(_buildSchemaNode(schema));
        });
    } catch (err) {
        container.innerHTML = `<div style="color:var(--danger-color);font-size:0.8rem;">${escapeHtml(err.message)}</div>`;
    }
}

function _buildSchemaNode(schema) {
    const wrapper = document.createElement('div');

    const item = document.createElement('div');
    item.className = 'tree-item';

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = '▶';

    const icon = document.createElement('span');
    icon.textContent = '🗂';
    icon.style.fontSize = '0.9rem';

    const label = document.createElement('span');
    label.textContent = schema;
    label.style.flex = '1';

    item.appendChild(arrow);
    item.appendChild(icon);
    item.appendChild(label);

    const children = document.createElement('div');
    children.className = 'tree-children';
    children.id = `schema-${CSS.escape(schema)}-tables`;

    item.addEventListener('click', () => _toggleSchema(schema, arrow, children));

    wrapper.appendChild(item);
    wrapper.appendChild(children);
    return wrapper;
}

async function _toggleSchema(schema, arrowEl, childrenEl) {
    const open = childrenEl.classList.contains('active');
    if (open) {
        childrenEl.classList.remove('active');
        arrowEl.classList.remove('open');
    } else {
        childrenEl.classList.add('active');
        arrowEl.classList.add('open');
        if (!childrenEl.dataset.loaded) {
            childrenEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.25rem 0.5rem;">Loading…</div>';
            try {
                const res = await fetch(`/api/browser/schemas/${encodeURIComponent(schema)}/tables`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                childrenEl.innerHTML = '';
                childrenEl.dataset.loaded = '1';
                if (!data.tables.length) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'color:var(--text-secondary);font-size:0.75rem;padding:0.25rem 0.5rem;';
                    empty.textContent = 'No tables.';
                    childrenEl.appendChild(empty);
                } else {
                    data.tables.forEach(table => childrenEl.appendChild(_buildTableNode(schema, table)));
                }
            } catch {
                childrenEl.innerHTML = '<div style="color:var(--danger-color);font-size:0.75rem;padding:0.25rem 0.5rem;">Error loading tables</div>';
            }
        }
    }
}

function _buildTableNode(schema, table) {
    const row = document.createElement('div');
    row.className = 'tree-table-item';
    row.dataset.schema = schema;
    row.dataset.table = table;

    const nameWrap = document.createElement('div');
    nameWrap.className = 'tree-table-name';

    const icon = document.createElement('span');
    icon.textContent = '📄';
    icon.style.fontSize = '0.8rem';
    icon.style.flexShrink = '0';

    const lbl = document.createElement('span');
    lbl.textContent = table;

    nameWrap.appendChild(icon);
    nameWrap.appendChild(lbl);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'tree-table-menu-btn';
    menuBtn.textContent = '⋯';
    menuBtn.title = 'Table options';
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, _tableContextMenuItems(schema, table, row));
    });

    row.appendChild(nameWrap);
    row.appendChild(menuBtn);

    // Left-click opens the table
    row.addEventListener('click', (e) => {
        if (e.target === menuBtn) return;
        // Mark active
        document.querySelectorAll('.tree-table-item.active').forEach(el => el.classList.remove('active'));
        row.classList.add('active');
        loadTable(schema, table);
    });

    // Right-click context menu
    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, _tableContextMenuItems(schema, table, row));
    });

    return row;
}

function _tableContextMenuItems(schema, table, rowEl) {
    return [
        { icon: '📂', label: 'Open table', action: () => { document.querySelectorAll('.tree-table-item.active').forEach(el => el.classList.remove('active')); rowEl.classList.add('active'); loadTable(schema, table); } },
        'divider',
        { icon: '🗑', label: 'Drop table…', danger: true, action: () => dropTable(schema, table, rowEl) },
    ];
}

// ─── Drop Table ───────────────────────────────────────────────────────────────
async function dropTable(schema, table, rowEl) {
    const confirmed = confirm(`DROP TABLE ${schema}.${table}\n\nThis permanently deletes the table and all its data. This cannot be undone.\n\nProceed?`);
    if (!confirmed) return;

    try {
        const res = await fetch(
            `/api/crud/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`,
            { method: 'DELETE' }
        );
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to drop table');
        }
        showNotification(`Table ${schema}.${table} dropped`, 'success');
        // Remove from tree
        rowEl.remove();
        // If this was the currently open table, go back to welcome
        if (currentSchema === schema && currentTable === table) {
            document.getElementById('table-panel').style.display = 'none';
            document.getElementById('welcome-panel').style.display = 'flex';
            currentSchema = ''; currentTable = '';
        }
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

// ─── Table View ───────────────────────────────────────────────────────────────
window.loadTable = async function(schema, table, page = 1) {
    currentSchema = schema;
    currentTable  = table;
    currentPage   = page;
    hasGeometry   = false;
    currentPrimaryKey = null;

    document.getElementById('welcome-panel').style.display = 'none';
    const tablePanel = document.getElementById('table-panel');
    tablePanel.style.display = 'flex';

    document.getElementById('table-title').textContent = `${schema}.${table}`;
    document.getElementById('grid-view-container').style.display = 'block';
    document.getElementById('map-view-container').style.display  = 'none';
    document.getElementById('pagination-controls').style.display = 'flex';
    const mapBtn = document.getElementById('map-view-btn');
    mapBtn.textContent = '🗺 Map View';
    mapBtn.style.display = 'none';

    const thead = document.getElementById('data-table-head');
    const tbody = document.getElementById('data-table-body');
    const meta  = document.getElementById('table-metadata');

    // Show skeleton while loading
    _renderSkeleton(thead, tbody);
    meta.innerHTML = '';

    try {
        const [structRes, pkRes] = await Promise.all([
            fetch(`/api/browser/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`),
            fetch(`/api/crud/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/primary-key`)
        ]);
        if (!structRes.ok) throw new Error('Failed to load table structure');
        const structData = await structRes.json();
        currentColumns = structData.columns;

        if (pkRes.ok) {
            const pkData = await pkRes.json();
            if (pkData.primary_key_columns?.length) currentPrimaryKey = pkData.primary_key_columns[0];
        }
        if (!currentPrimaryKey && structData.columns.length) currentPrimaryKey = structData.columns[0].column_name;

        // Render header
        thead.innerHTML = '';
        const htr = document.createElement('tr');
        structData.columns.forEach(col => {
            const th = document.createElement('th');
            if (col.is_geometry) {
                th.title = `Geometry (${col.geom_type}, SRID: ${col.srid})`;
                hasGeometry = true;
            } else {
                th.title = col.data_type;
            }
            if (col.column_name === currentPrimaryKey) {
                th.className = 'pk-col';
                th.title += ' [PK]';
            }
            th.textContent = col.column_name;
            htr.appendChild(th);
        });
        thead.appendChild(htr);

        if (hasGeometry) mapBtn.style.display = 'inline-flex';

        await _fetchAndRenderRows(schema, table, page, structData.columns);

    } catch (err) {
        tbody.innerHTML = `<tr><td style="color:var(--danger-color);padding:1rem;" colspan="100%">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function _renderSkeleton(thead, tbody) {
    thead.innerHTML = '<tr>' + Array(5).fill('<th><div class="skeleton" style="width:80px;height:12px;"></div></th>').join('') + '</tr>';
    tbody.innerHTML = Array(8).fill(null).map(() =>
        '<tr class="skeleton-row">' +
        Array(5).fill('<td><div class="skeleton skeleton-cell" style="width:' + (60 + Math.random()*80|0) + 'px;"></div></td>').join('') +
        '</tr>'
    ).join('');
}

async function _fetchAndRenderRows(schema, table, page, columns) {
    const tbody  = document.getElementById('data-table-body');
    const offset = (page - 1) * PAGE_SIZE;

    const dataRes = await fetch(
        `/api/crud/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/rows?limit=${PAGE_SIZE}&offset=${offset}`
    );
    if (!dataRes.ok) throw new Error('Failed to load rows');
    const data = await dataRes.json();
    currentTotalRows = data.total ?? 0;

    tbody.innerHTML = '';
    if (!data.rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = columns.length;
        td.style.cssText = 'color:var(--text-secondary);text-align:center;padding:2rem;';
        td.textContent = 'No rows found.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    } else {
        data.rows.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td  = document.createElement('td');
                const raw = row[col.column_name];
                if (col.is_geometry) {
                    const span = document.createElement('span');
                    span.className = 'cell-value geom-val';
                    span.textContent = '[geometry]';
                    td.appendChild(span);
                } else {
                    td.className = 'editable';
                    const displayVal = raw === null ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
                    const span = document.createElement('span');
                    span.className = 'cell-value' + (raw === null ? ' null-val' : '');
                    span.textContent = raw === null ? 'NULL' : displayVal;
                    span.title = raw === null ? 'NULL' : displayVal;
                    td.appendChild(span);
                    const pkVal = currentPrimaryKey ? row[currentPrimaryKey] : null;
                    td.addEventListener('click', () => editCell(td, col.column_name, currentPrimaryKey, pkVal, displayVal));
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    const totalPages = currentTotalRows > 0 ? Math.ceil(currentTotalRows / PAGE_SIZE) : 1;
    document.getElementById('page-info').textContent = `Page ${page} of ${totalPages} · ${currentTotalRows.toLocaleString()} rows`;
    document.getElementById('prev-page-btn').disabled = page <= 1;
    document.getElementById('next-page-btn').disabled = page >= totalPages;

    const pkBadge = currentPrimaryKey
        ? `<span style="background:rgba(245,158,11,0.15);color:var(--warning-color);border-radius:4px;padding:0.1rem 0.45rem;font-size:0.75rem;">PK: ${escapeHtml(currentPrimaryKey)}</span>`
        : '';
    document.getElementById('table-metadata').innerHTML =
        `${pkBadge} <span>${columns.length} columns</span> <span>·</span> <span>${currentTotalRows.toLocaleString()} rows</span>`;
}

// ─── Cell Editing ─────────────────────────────────────────────────────────────
window.editCell = function(td, colName, pkCol, pkVal, currentVal) {
    if (td.querySelector('input')) return;
    if (!pkCol || pkVal == null) {
        showNotification('Cannot edit: no primary key for this table', 'error');
        return;
    }

    const input = document.createElement('input');
    input.className = 'cell-input';
    input.type  = 'text';
    input.value = currentVal;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    const restoreDisplay = (val) => {
        td.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'cell-value' + (val === '' ? ' null-val' : '');
        span.textContent = val === '' ? 'NULL' : val;
        span.title = val === '' ? 'NULL' : val;
        td.appendChild(span);
        td.addEventListener('click', () => editCell(td, colName, pkCol, pkVal, val !== '' ? val : currentVal), { once: true });
    };

    const commit = async () => {
        if (committed) return;
        committed = true;
        const newVal = input.value;
        restoreDisplay(newVal);
        if (newVal === currentVal) return;
        try {
            const res = await fetch(
                `/api/crud/schemas/${encodeURIComponent(currentSchema)}/tables/${encodeURIComponent(currentTable)}/cell`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        primary_key_column: pkCol,
                        primary_key_value: pkVal,
                        column_name: colName,
                        new_value: newVal === '' ? null : newVal
                    })
                }
            );
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.detail || 'Update failed');
            }
            showNotification('Cell updated', 'success');
        } catch (err) {
            showNotification(`Update failed: ${err.message}`, 'error');
            restoreDisplay(currentVal); // revert
        }
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        input.removeEventListener('blur', commit);
        restoreDisplay(currentVal);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); input.removeEventListener('blur', commit); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); input.removeEventListener('blur', commit); cancel(); }
    });
}

// ─── Map View ─────────────────────────────────────────────────────────────────
async function loadMap() {
    try {
        const res = await fetch(`/api/spatial/geojson/${encodeURIComponent(currentSchema)}/${encodeURIComponent(currentTable)}`);
        if (!res.ok) throw new Error('Failed to load map data');
        const geojson = await res.json();

        if (!leafletMap) {
            leafletMap = L.map('map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(leafletMap);
        }
        if (geoJsonLayer) leafletMap.removeLayer(geoJsonLayer);

        geoJsonLayer = L.geoJSON(geojson, {
            onEachFeature: (feature, layer) => {
                if (!feature.properties) return;
                const tbl = document.createElement('table');
                tbl.className = 'data-table';
                tbl.style.fontSize = '0.75rem';
                for (const key in feature.properties) {
                    const tr = document.createElement('tr');
                    const th = document.createElement('th'); th.textContent = key;
                    const td = document.createElement('td');
                    const v = feature.properties[key];
                    td.textContent = v === null ? 'NULL' : String(v);
                    tr.appendChild(th); tr.appendChild(td); tbl.appendChild(tr);
                }
                layer.bindPopup(tbl, { maxHeight: 220 });
            }
        }).addTo(leafletMap);

        if (geoJsonLayer.getLayers().length) leafletMap.fitBounds(geoJsonLayer.getBounds());
        setTimeout(() => leafletMap.invalidateSize(), 120);
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

// ─── Manage Columns Modal ─────────────────────────────────────────────────────
window.openManageColsModal = function() {
    const list = document.getElementById('cols-list');
    list.innerHTML = '';
    currentColumns.forEach(col => {
        const el = document.createElement('div');
        el.className = 'connection-item';

        const info = document.createElement('div');
        info.style.minWidth = '0';
        const name = document.createElement('span');
        name.className = 'connection-name';
        name.textContent = col.column_name;
        const meta = document.createElement('span');
        meta.className = 'connection-meta';
        meta.textContent = `${col.data_type}${col.is_nullable === 'YES' ? '' : ' NOT NULL'}`;
        info.appendChild(name);
        info.appendChild(meta);

        const acts = document.createElement('div');
        acts.style.cssText = 'display:flex;gap:0.4rem;flex-shrink:0;';

        const renBtn = document.createElement('button');
        renBtn.className = 'btn btn-sm';
        renBtn.textContent = 'Rename';
        renBtn.addEventListener('click', () => renameColumn(col.column_name));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-danger';
        delBtn.textContent = 'Drop';
        delBtn.addEventListener('click', () => dropColumn(col.column_name));

        acts.appendChild(renBtn);
        acts.appendChild(delBtn);
        el.appendChild(info);
        el.appendChild(acts);
        list.appendChild(el);
    });
    document.getElementById('cols-modal').classList.add('active');
}

window.renameColumn = async function(oldName) {
    const newName = prompt(`New name for column '${oldName}':`, oldName);
    if (!newName?.trim() || newName.trim() === oldName) return;
    try {
        const res = await fetch(
            `/api/crud/schemas/${encodeURIComponent(currentSchema)}/tables/${encodeURIComponent(currentTable)}/columns/rename?old_column=${encodeURIComponent(oldName)}&new_column=${encodeURIComponent(newName.trim())}`,
            { method: 'POST' }
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showNotification('Column renamed', 'success');
        document.getElementById('cols-modal').classList.remove('active');
        loadTable(currentSchema, currentTable, currentPage);
    } catch (err) { showNotification(err.message, 'error'); }
}

window.dropColumn = async function(colName) {
    if (!confirm(`Drop column '${colName}'? This cannot be undone.`)) return;
    try {
        const res = await fetch(
            `/api/crud/schemas/${encodeURIComponent(currentSchema)}/tables/${encodeURIComponent(currentTable)}/columns/${encodeURIComponent(colName)}`,
            { method: 'DELETE' }
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showNotification('Column dropped', 'success');
        document.getElementById('cols-modal').classList.remove('active');
        loadTable(currentSchema, currentTable, 1);
    } catch (err) { showNotification(err.message, 'error'); }
}

// ─── DOMContentLoaded wiring ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (currentPage > 1) loadTable(currentSchema, currentTable, currentPage - 1);
    });
    document.getElementById('next-page-btn').addEventListener('click', () => {
        const totalPages = currentTotalRows > 0 ? Math.ceil(currentTotalRows / PAGE_SIZE) : 1;
        if (currentPage < totalPages) loadTable(currentSchema, currentTable, currentPage + 1);
    });
    document.getElementById('refresh-table-btn').addEventListener('click', () => {
        if (currentSchema && currentTable) loadTable(currentSchema, currentTable, currentPage);
    });

    const mapBtn = document.getElementById('map-view-btn');
    if (mapBtn) {
        mapBtn.addEventListener('click', () => {
            const grid = document.getElementById('grid-view-container');
            const map  = document.getElementById('map-view-container');
            const pag  = document.getElementById('pagination-controls');
            if (grid.style.display !== 'none') {
                grid.style.display = 'none'; pag.style.display = 'none';
                map.style.display = 'block';
                mapBtn.textContent = '⊞ Grid View';
                loadMap();
            } else {
                grid.style.display = 'block'; pag.style.display = 'flex';
                map.style.display = 'none';
                mapBtn.textContent = '🗺 Map View';
            }
        });
    }

    document.getElementById('manage-cols-btn').addEventListener('click', openManageColsModal);
    document.getElementById('cols-close-btn').addEventListener('click',  () => document.getElementById('cols-modal').classList.remove('active'));
    document.getElementById('cols-cancel-btn').addEventListener('click', () => document.getElementById('cols-modal').classList.remove('active'));

    // Close modals on backdrop click
    ['cols-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('active'); });
    });
});
