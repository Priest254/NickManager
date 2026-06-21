let currentSchema = '';
let currentTable = '';
let currentPage = 1;
let currentColumns = [];
const PAGE_SIZE = 50;

let hasGeometry = false;
let leafletMap = null;
let geoJsonLayer = null;

// Expose to app.js
window.loadBrowser = async function() {
    const container = document.getElementById('db-browser-container');
    container.innerHTML = '<div class="text-secondary">Loading schemas...</div>';

    try {
        const res = await fetch('/api/browser/schemas');
        if (!res.ok) throw new Error('Failed to load schemas');
        const data = await res.json();
        
        container.innerHTML = '';
        data.schemas.forEach(schema => {
            const el = document.createElement('div');
            el.innerHTML = `
                <div class="tree-item" onclick="toggleSchema('${schema}', this)">
                    <span style="display: inline-block; width: 12px;">▶</span>
                    <span>${schema}</span>
                </div>
                <div class="tree-children" id="schema-${schema}-tables"></div>
            `;
            container.appendChild(el);
        });
    } catch (err) {
        container.innerHTML = `<div class="text-danger">${err.message}</div>`;
    }
}

window.toggleSchema = async function(schema, element) {
    const childrenContainer = document.getElementById(`schema-${schema}-tables`);
    const arrow = element.querySelector('span');

    if (childrenContainer.classList.contains('active')) {
        childrenContainer.classList.remove('active');
        arrow.textContent = '▶';
    } else {
        childrenContainer.classList.add('active');
        arrow.textContent = '▼';
        
        // Load tables if empty
        if (childrenContainer.innerHTML === '') {
            childrenContainer.innerHTML = '<div class="text-secondary" style="font-size: 0.75rem;">Loading...</div>';
            try {
                const res = await fetch(`/api/browser/schemas/${schema}/tables`);
                const data = await res.json();
                
                childrenContainer.innerHTML = '';
                data.tables.forEach(table => {
                    const el = document.createElement('div');
                    el.className = 'tree-item';
                    el.style.fontSize = '0.875rem';
                    el.innerHTML = `<span>&#128196;</span> ${table}`;
                    el.onclick = () => loadTable(schema, table);
                    childrenContainer.appendChild(el);
                });
            } catch (err) {
                childrenContainer.innerHTML = `<div class="text-danger">Error loading tables</div>`;
            }
        }
    }
}

window.loadTable = async function(schema, table, page = 1) {
    currentSchema = schema;
    currentTable = table;
    currentPage = page;
    hasGeometry = false;
    
    document.getElementById('welcome-panel').style.display = 'none';
    document.getElementById('table-panel').style.display = 'flex';
    document.getElementById('table-title').textContent = `${schema}.${table}`;
    
    // Ensure grid view is active initially
    document.getElementById('grid-view-container').style.display = 'block';
    document.getElementById('map-view-container').style.display = 'none';
    document.getElementById('pagination-controls').style.display = 'flex';
    const mapBtn = document.getElementById('map-view-btn');
    mapBtn.textContent = 'Map View';
    mapBtn.style.display = 'none';
    
    const thead = document.getElementById('data-table-head');
    const tbody = document.getElementById('data-table-body');
    const metaContainer = document.getElementById('table-metadata');
    
    thead.innerHTML = '<th>Loading...</th>';
    tbody.innerHTML = '';
    metaContainer.innerHTML = '';
    
    try {
        // 1. Fetch Structure
        const structRes = await fetch(`/api/browser/schemas/${schema}/tables/${table}/columns`);
        const structData = await structRes.json();
        currentColumns = structData.columns;
        
        let headerHTML = '';
        let primaryKey = structData.columns[0].column_name; // Fallback to first column
        
        structData.columns.forEach(col => {
            let meta = col.data_type;
            if (col.is_geometry) {
                meta = `Geometry (${col.geom_type}, SRID: ${col.srid})`;
                hasGeometry = true;
            }
            headerHTML += `<th title="${meta}">${col.column_name}</th>`;
        });
        thead.innerHTML = headerHTML;
        
        metaContainer.innerHTML = `${structData.columns.length} columns found.`;
        
        if (hasGeometry) {
            mapBtn.style.display = 'inline-block';
        }

        // 2. Fetch Data
        const offset = (page - 1) * PAGE_SIZE;
        const dataRes = await fetch(`/api/crud/schemas/${schema}/tables/${table}/rows?limit=${PAGE_SIZE}&offset=${offset}`);
        const data = await dataRes.json();
        
        let bodyHTML = '';
        data.rows.forEach(row => {
            let tr = '<tr>';
            structData.columns.forEach(col => {
                let val = row[col.column_name];
                if (val === null) val = '<i>NULL</i>';
                else if (typeof val === 'object') val = JSON.stringify(val);
                
                // Simple inline edit
                tr += `<td class="editable" onclick="editCell(this, '${col.column_name}', '${primaryKey}', '${row[primaryKey]}')">
                    <div style="max-height: 100px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${val}">${val}</div>
                </td>`;
            });
            tr += '</tr>';
            bodyHTML += tr;
        });
        tbody.innerHTML = bodyHTML;
        
        document.getElementById('page-info').textContent = `Page ${page}`;
        document.getElementById('prev-page-btn').disabled = page === 1;
        
    } catch (err) {
        tbody.innerHTML = `<tr><td class="text-danger" colspan="100%">Error: ${err.message}</td></tr>`;
    }
}

window.editCell = function(td, colName, pkCol, pkVal) {
    if (td.querySelector('input')) return; // Already editing
    
    const div = td.querySelector('div');
    const currentVal = div.textContent === 'NULL' ? '' : div.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal;
    
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    
    input.onblur = async () => {
        const newVal = input.value;
        const dispVal = newVal || '<i>NULL</i>';
        td.innerHTML = `<div style="max-height: 100px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${newVal}">${dispVal}</div>`;
        
        if (newVal !== currentVal) {
            try {
                const res = await fetch(`/api/crud/schemas/${currentSchema}/tables/${currentTable}/cell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        primary_key_column: pkCol,
                        primary_key_value: pkVal,
                        column_name: colName,
                        new_value: newVal
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                showNotification('Cell updated', 'success');
            } catch (err) {
                showNotification('Failed to update cell', 'error');
                td.innerHTML = `<div style="max-height: 100px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${currentVal}">${currentVal || '<i>NULL</i>'}</div>`;
            }
        }
    };
    
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            td.innerHTML = `<div style="max-height: 100px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${currentVal}">${currentVal || '<i>NULL</i>'}</div>`;
        }
    };
}

async function loadMap() {
    try {
        const res = await fetch(`/api/spatial/geojson/${currentSchema}/${currentTable}`);
        if (!res.ok) throw new Error("Failed to load map data");
        const geojson = await res.json();
        
        if (!leafletMap) {
            leafletMap = L.map('map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(leafletMap);
        }
        
        if (geoJsonLayer) leafletMap.removeLayer(geoJsonLayer);
        
        geoJsonLayer = L.geoJSON(geojson, {
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    let popupContent = '<table class="data-table" style="font-size:0.75rem;">';
                    for (let key in feature.properties) {
                        popupContent += `<tr><th>${key}</th><td>${feature.properties[key]}</td></tr>`;
                    }
                    popupContent += '</table>';
                    layer.bindPopup(popupContent, {maxHeight: 200});
                }
            }
        }).addTo(leafletMap);
        
        if (geoJsonLayer.getLayers().length > 0) {
            leafletMap.fitBounds(geoJsonLayer.getBounds());
        }
        
        // Fix map rendering issue due to hidden container
        setTimeout(() => leafletMap.invalidateSize(), 100);
        
    } catch(err) {
        showNotification(err.message, 'error');
    }
}

window.openManageColsModal = function() {
    const list = document.getElementById('cols-list');
    list.innerHTML = '';
    
    currentColumns.forEach(col => {
        const el = document.createElement('div');
        el.className = 'connection-item';
        el.innerHTML = `
            <div>
                <span class="connection-name">${col.column_name}</span>
                <span class="connection-meta">${col.data_type} ${col.is_nullable === 'YES' ? '' : 'NOT NULL'}</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn" onclick="renameColumn('${col.column_name}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Rename</button>
                <button class="btn btn-danger" onclick="dropColumn('${col.column_name}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border-color: var(--danger-color); color: var(--danger-color);">Delete</button>
            </div>
        `;
        list.appendChild(el);
    });
    
    document.getElementById('cols-modal').classList.add('active');
}

window.renameColumn = async function(oldName) {
    const newName = prompt(`Enter new name for column '${oldName}':`, oldName);
    if (!newName || newName === oldName) return;
    
    try {
        const res = await fetch(`/api/crud/schemas/${currentSchema}/tables/${currentTable}/columns/rename?old_column=${encodeURIComponent(oldName)}&new_column=${encodeURIComponent(newName)}`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to rename');
        
        showNotification('Column renamed successfully', 'success');
        document.getElementById('cols-modal').classList.remove('active');
        loadTable(currentSchema, currentTable, currentPage);
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

window.dropColumn = async function(colName) {
    if (!confirm(`Are you SURE you want to delete the column '${colName}'? This action cannot be undone and will destroy all data in this column.`)) return;
    
    try {
        const res = await fetch(`/api/crud/schemas/${currentSchema}/tables/${currentTable}/columns/${encodeURIComponent(colName)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete');
        
        showNotification('Column deleted successfully', 'success');
        document.getElementById('cols-modal').classList.remove('active');
        loadTable(currentSchema, currentTable, 1);
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('prev-page-btn').onclick = () => {
        if (currentPage > 1) loadTable(currentSchema, currentTable, currentPage - 1);
    };
    
    document.getElementById('next-page-btn').onclick = () => {
        loadTable(currentSchema, currentTable, currentPage + 1);
    };
    
    document.getElementById('refresh-table-btn').onclick = () => {
        loadTable(currentSchema, currentTable, currentPage);
    };
    
    const mapBtn = document.getElementById('map-view-btn');
    if (mapBtn) {
        mapBtn.onclick = () => {
            const gridContainer = document.getElementById('grid-view-container');
            const mapContainer = document.getElementById('map-view-container');
            const pagination = document.getElementById('pagination-controls');
            
            if (gridContainer.style.display !== 'none') {
                // Switch to Map View
                gridContainer.style.display = 'none';
                pagination.style.display = 'none';
                mapContainer.style.display = 'block';
                mapBtn.textContent = 'Grid View';
                loadMap();
            } else {
                // Switch to Grid View
                gridContainer.style.display = 'block';
                pagination.style.display = 'flex';
                mapContainer.style.display = 'none';
                mapBtn.textContent = 'Map View';
            }
        };
    }
    
    // Manage Columns
    document.getElementById('manage-cols-btn').onclick = openManageColsModal;
    document.getElementById('cols-close-btn').onclick = () => document.getElementById('cols-modal').classList.remove('active');
    document.getElementById('cols-cancel-btn').onclick = () => document.getElementById('cols-modal').classList.remove('active');
});
