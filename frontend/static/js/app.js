// ─── Sidebar toggle ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const openBtn = document.getElementById('sidebar-open-btn');
    const collapsed = localStorage.getItem('nickmanager-sidebar-collapsed') === 'true';
    sidebar.classList.toggle('collapsed', collapsed);
    openBtn.classList.toggle('visible', collapsed);

    collapseBtn.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        openBtn.classList.add('visible');
        localStorage.setItem('nickmanager-sidebar-collapsed', 'true');
    });
    openBtn.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
        openBtn.classList.remove('visible');
        localStorage.setItem('nickmanager-sidebar-collapsed', 'false');
    });

    document.getElementById('topbar-add-connection').addEventListener('click', () => document.getElementById('add-conn-btn').click());
    document.getElementById('welcome-connect-btn').addEventListener('click', () => document.getElementById('add-conn-btn').click());
    document.getElementById('refresh-browser-btn').addEventListener('click', () => window.loadBrowser?.());

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openModal = document.querySelector('.modal-overlay.active');
            if (openModal) {
                openModal.classList.remove('active');
                return;
            }
        }
        if (event.key === '/' && !event.ctrlKey && !event.metaKey &&
            !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            event.preventDefault();
            document.getElementById('browser-search').focus();
        }
    });
});

// ─── Connection Modal ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadConnections();

    const addConnBtn  = document.getElementById('add-conn-btn');
    const closeBtn    = document.getElementById('conn-close-btn');
    const cancelBtn   = document.getElementById('cancel-btn');
    const modal       = document.getElementById('conn-modal');
    const connForm    = document.getElementById('conn-form');
    const testConnBtn = document.getElementById('test-conn-btn');
    const saveConnBtn = document.getElementById('save-conn-btn');
    const feedback    = document.getElementById('connection-feedback');
    let saving = false;

    const openConnModal = () => {
        connForm.reset();
        setConnectionFeedback('');
        modal.classList.add('active');
        connForm.querySelector('[name=name]').focus();
    };
    const closeConnModal = () => modal.classList.remove('active');

    addConnBtn.addEventListener('click', openConnModal);
    closeBtn.addEventListener('click', closeConnModal);
    cancelBtn.addEventListener('click', closeConnModal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) closeConnModal(); });

    connForm.addEventListener('input', () => setConnectionFeedback(''));
    connForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving || !connForm.reportValidity()) return;
        saving = true;
        const data = Object.fromEntries(new FormData(connForm).entries());
        data.port = parseInt(data.port) || 5432;
        saveConnBtn.disabled = true;
        saveConnBtn.textContent = 'Saving…';
        setConnectionFeedback('Saving connection…', 'pending');
        try {
            const res = await fetch('/api/connections/save-and-connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await responseError(res, 'Could not save connection'));
            await res.json();
            closeConnModal();
            await loadConnections();
            showNotification('Connected', 'success');
        } catch (err) {
            setConnectionFeedback(err.message || 'Could not save connection.', 'error');
        } finally {
            saving = false;
            saveConnBtn.disabled = false;
            saveConnBtn.textContent = 'Save & connect';
        }
    });

    testConnBtn.addEventListener('click', async () => {
        if (!connForm.reportValidity()) return;
        const data = Object.fromEntries(new FormData(connForm).entries());
        data.port = parseInt(data.port) || 5432;
        const orig = testConnBtn.textContent;
        testConnBtn.textContent = 'Testing…';
        testConnBtn.disabled = true;
        saveConnBtn.disabled = true;
        setConnectionFeedback('Testing connection…', 'pending');
        try {
            const res = await fetch('/api/connections/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(result.detail || 'Could not test connection.');
            if (result.success) setConnectionFeedback('Connection works. Save to connect.', 'success');
            else setConnectionFeedback(result.message || 'Connection failed.', 'error');
        } catch (err) {
            setConnectionFeedback(err.message || 'Could not test connection.', 'error');
        } finally {
            testConnBtn.textContent = orig;
            testConnBtn.disabled = false;
            saveConnBtn.disabled = false;
        }
    });

    function setConnectionFeedback(message, state = '') {
        feedback.textContent = message;
        feedback.className = `form-feedback${state ? ` ${state}` : ''}`;
    }
});

// ─── Import Shapefile Modal ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const importBtn       = document.getElementById('import-shp-btn');
    const importModal     = document.getElementById('import-modal');
    const importCloseBtn  = document.getElementById('import-close-btn');
    const importCancelBtn = document.getElementById('import-cancel-btn');
    const importForm      = document.getElementById('import-form');
    const importSubmitBtn = document.getElementById('import-submit-btn');
    const importStatus    = document.getElementById('import-status');

    const openImportModal  = () => { importForm.reset(); importStatus.textContent = ''; importModal.classList.add('active'); };
    const closeImportModal = () => importModal.classList.remove('active');

    importBtn.addEventListener('click', openImportModal);
    importCloseBtn.addEventListener('click', closeImportModal);
    importCancelBtn.addEventListener('click', closeImportModal);
    importModal.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); });

    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orig = importSubmitBtn.textContent;
        importSubmitBtn.textContent = 'Importing…';
        importSubmitBtn.disabled = true;
        importStatus.style.color = 'var(--text-secondary)';
        importStatus.textContent = 'Uploading and processing — this may take a moment…';
        try {
            const res = await fetch('/api/shapefile/upload', { method: 'POST', body: new FormData(importForm) });
            if (!res.ok) throw new Error((await res.json()).detail || 'Import failed');
            const result = await res.json();
            showNotification(result.message, 'success');
            closeImportModal();
            if (window.loadBrowser) window.loadBrowser();
        } catch (err) {
            importStatus.style.color = 'var(--danger-color)';
            importStatus.textContent = `Error: ${err.message}`;
            showNotification(err.message, 'error');
        } finally {
            importSubmitBtn.textContent = orig;
            importSubmitBtn.disabled = false;
        }
    });
});

// ─── Backup & Restore ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const backupBtn        = document.getElementById('backup-db-btn');
    const restoreBtn       = document.getElementById('restore-db-btn');
    const restoreModal     = document.getElementById('restore-db-modal');
    const restoreCloseBtn  = document.getElementById('restore-db-close-btn');
    const restoreCancelBtn = document.getElementById('restore-db-cancel-btn');
    const restoreForm      = document.getElementById('restore-db-form');
    const restoreSubmitBtn = document.getElementById('restore-db-submit-btn');
    const restoreStatus    = document.getElementById('restore-status');

    const closeRestoreModal = () => restoreModal.classList.remove('active');

    backupBtn.addEventListener('click', () => {
        showNotification('Starting backup download…', 'info');
        window.location.href = '/api/backup/export';
    });

    restoreBtn.addEventListener('click', () => {
        restoreForm.reset();
        restoreStatus.textContent = '';
        restoreModal.classList.add('active');
    });
    restoreCloseBtn.addEventListener('click', closeRestoreModal);
    restoreCancelBtn.addEventListener('click', closeRestoreModal);
    restoreModal.addEventListener('click', (e) => { if (e.target === restoreModal) closeRestoreModal(); });

    restoreSubmitBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('restore-file');
        if (!fileInput.files.length) { showNotification('Please select a backup file', 'error'); return; }
        if (!confirm('WARNING: Restoring will overwrite existing data. Proceed?')) return;

        const formData = new FormData(restoreForm);
        const cleanCheckbox = document.getElementById('restore-clean');
        formData.set('clean', cleanCheckbox.checked ? 'true' : 'false');

        const orig = restoreSubmitBtn.textContent;
        restoreSubmitBtn.textContent = 'Restoring…';
        restoreSubmitBtn.disabled = true;
        restoreStatus.style.color = 'var(--text-secondary)';
        restoreStatus.textContent = 'Uploading and restoring — do not close this window…';

        try {
            const res = await fetch('/api/backup/restore', { method: 'POST', body: formData });
            if (!res.ok) throw new Error((await res.json()).detail || 'Restore failed');
            const result = await res.json();
            showNotification(result.message, 'success');
            closeRestoreModal();
            if (window.loadBrowser) window.loadBrowser();
        } catch (err) {
            restoreStatus.style.color = 'var(--danger-color)';
            restoreStatus.textContent = `Error: ${err.message}`;
            showNotification('Restore encountered an error', 'error');
        } finally {
            restoreSubmitBtn.textContent = orig;
            restoreSubmitBtn.disabled = false;
        }
    });
});

// ─── Connections ─────────────────────────────────────────────────────────────
async function loadConnections() {
    const list = document.getElementById('connection-list');
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;">Loading…</div>';
    try {
        const res = await fetch('/api/connections/');
        if (!res.ok) throw new Error(await responseError(res, 'Failed to load connections'));
        const connections = await res.json();

        if (connections.length === 0) {
            list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;">No connections saved.</div>';
            setConnectionStatus(null);
            if (window.loadBrowser) await window.loadBrowser();
            return;
        }

        list.innerHTML = '';
        connections.forEach(conn => {
            const el = document.createElement('div');
            el.className = 'connection-item' + (conn.is_active ? ' active' : '');

            const info = document.createElement('div');
            info.style.minWidth = '0';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'connection-name';
            nameSpan.textContent = conn.name;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'connection-meta';
            metaSpan.textContent = `${conn.host}:${conn.port} / ${conn.db_name}`;
            info.appendChild(nameSpan);
            info.appendChild(metaSpan);
            if (conn.is_active) {
                const badge = document.createElement('span');
                badge.className = 'active-connection-badge';
                badge.textContent = 'ACTIVE';
                info.appendChild(badge);
            }

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-sm btn-danger';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete connection';
            delBtn.addEventListener('click', (e) => deleteConnection(e, conn.id));

            el.appendChild(info);
            el.appendChild(delBtn);
            el.addEventListener('click', () => activateConnection(conn.id));
            list.appendChild(el);

        });

        setConnectionStatus(connections.find(conn => conn.is_active) || null);
        if (window.loadBrowser) await window.loadBrowser();
    } catch (err) {
        list.textContent = err.message;
        list.style.color = 'var(--danger-color)';
        setConnectionStatus(null);
    }
}

async function activateConnection(id) {
    try {
        const res = await fetch(`/api/connections/${id}/activate`, { method: 'POST' });
        if (!res.ok) throw new Error(await responseError(res, 'Failed to activate connection'));
        await loadConnections();
        showNotification('Connection activated', 'success');
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function deleteConnection(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this connection profile?')) return;
    try {
        const res = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await responseError(res, 'Failed to delete connection'));
        await loadConnections();
        showNotification('Connection deleted', 'success');
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function responseError(response, fallback) {
    try {
        const body = await response.json();
        return body.detail || body.message || fallback;
    } catch {
        return fallback;
    }
}

function setConnectionStatus(connection) {
    const status = document.getElementById('connection-status');
    const label = document.getElementById('active-connection-label');
    const connectionLabel = connection ? `${connection.name} · ${connection.db_name}` : '';
    const changedConnection = Boolean(connection && status.dataset.connectionId && status.dataset.connectionId !== String(connection.id));
    if (!connection || changedConnection) {
        window.resetTableView?.();
        document.getElementById('table-panel').style.display = 'none';
        document.getElementById('welcome-panel').style.display = 'flex';
    }
    status.classList.toggle('connected', Boolean(connection));
    status.innerHTML = connection ? '<i></i> Active profile' : '<i></i> No connection';
    if (connection) status.dataset.connectionId = connection.id;
    else delete status.dataset.connectionId;
    label.textContent = connection ? connectionLabel : 'No active connection';
    document.getElementById('topbar-add-connection').textContent = connection ? 'Add connection' : 'Connect database';
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    requestAnimationFrame(() => requestAnimationFrame(() => notif.classList.add('show')));
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 400);
    }, 3500);
}
