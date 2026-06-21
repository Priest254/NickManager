document.addEventListener('DOMContentLoaded', () => {
    loadConnections();

    // Modal elements
    const addConnBtn = document.getElementById('add-conn-btn');
    const closeBtn = document.querySelector('.close-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const modal = document.getElementById('conn-modal');
    const connForm = document.getElementById('conn-form');
    const testConnBtn = document.getElementById('test-conn-btn');

    // Import modal elements
    const importBtn = document.getElementById('import-shp-btn');
    const importModal = document.getElementById('import-modal');
    const importCloseBtn = document.getElementById('import-close-btn');
    const importCancelBtn = document.getElementById('import-cancel-btn');
    const importForm = document.getElementById('import-form');
    const importSubmitBtn = document.getElementById('import-submit-btn');
    const importStatus = document.getElementById('import-status');

    // Event listeners for connection modal
    addConnBtn.addEventListener('click', () => {
        connForm.reset();
        modal.classList.add('active');
    });

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));

    // Event listeners for import modal
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importForm.reset();
            importStatus.textContent = '';
            importModal.classList.add('active');
        });
    }

    if (importCloseBtn) importCloseBtn.addEventListener('click', () => importModal.classList.remove('active'));
    if (importCancelBtn) importCancelBtn.addEventListener('click', () => importModal.classList.remove('active'));

    // Import Form submission
    if (importForm) {
        importForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(importForm);
            
            const originalText = importSubmitBtn.textContent;
            importSubmitBtn.textContent = 'Importing...';
            importSubmitBtn.disabled = true;
            importStatus.textContent = 'Uploading and processing, this may take a while...';

            try {
                const res = await fetch('/api/shapefile/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const result = await res.json();
                    showNotification(result.message, 'success');
                    importModal.classList.remove('active');
                    if (window.loadBrowser) window.loadBrowser(); // refresh tree
                } else {
                    const err = await res.json();
                    throw new Error(err.detail || 'Import failed');
                }
            } catch (err) {
                showNotification(err.message, 'error');
                importStatus.textContent = `Error: ${err.message}`;
                importStatus.style.color = 'var(--danger-color)';
            } finally {
                importSubmitBtn.textContent = originalText;
                importSubmitBtn.disabled = false;
            }
        });
    }

    // Form submission
    connForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(connForm);
        const data = Object.fromEntries(formData.entries());
        data.port = parseInt(data.port) || 5432;

        try {
            const res = await fetch('/api/connections/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                showNotification('Connection saved successfully', 'success');
                modal.classList.remove('active');
                loadConnections();
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            showNotification(err.message, 'error');
        }
    });

    // Test connection
    testConnBtn.addEventListener('click', async () => {
        const formData = new FormData(connForm);
        const data = Object.fromEntries(formData.entries());
        data.port = parseInt(data.port) || 5432;

        const originalText = testConnBtn.textContent;
        testConnBtn.textContent = 'Testing...';
        testConnBtn.disabled = true;

        try {
            const res = await fetch('/api/connections/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showNotification('Connection successful!', 'success');
            } else {
                showNotification('Connection failed: ' + result.message, 'error');
            }
        } catch (err) {
            showNotification('Error testing connection', 'error');
        } finally {
            testConnBtn.textContent = originalText;
            testConnBtn.disabled = false;
        }
    });
});

async function loadConnections() {
    const list = document.getElementById('connection-list');
    list.innerHTML = '<div class="text-secondary">Loading...</div>';

    try {
        const res = await fetch('/api/connections/');
        const connections = await res.json();

        if (connections.length === 0) {
            list.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.875rem;">No connections saved.</div>';
            return;
        }

        list.innerHTML = '';
        connections.forEach(conn => {
            const el = document.createElement('div');
            el.className = `connection-item ${conn.is_active ? 'active' : ''}`;
            el.innerHTML = `
                <div>
                    <span class="connection-name">${conn.name}</span>
                    <span class="connection-meta">${conn.host}:${conn.port} | ${conn.db_name}</span>
                </div>
                <div>
                    <button class="btn" onclick="deleteConnection(event, ${conn.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Del</button>
                </div>
            `;
            el.addEventListener('click', () => activateConnection(conn.id));
            list.appendChild(el);

            if (conn.is_active && window.loadBrowser) {
                window.loadBrowser();
            }
        });
    } catch (err) {
        list.innerHTML = '<div class="text-danger">Failed to load connections</div>';
    }
}

async function activateConnection(id) {
    try {
        const res = await fetch(`/api/connections/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            loadConnections();
            showNotification('Connection activated', 'success');
            if (window.loadBrowser) window.loadBrowser();
        }
    } catch (err) {
        showNotification('Failed to activate', 'error');
    }
}

async function deleteConnection(e, id) {
    e.stopPropagation(); // Prevent activation
    if (!confirm('Are you sure you want to delete this connection?')) return;

    try {
        const res = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadConnections();
            showNotification('Connection deleted', 'success');
        }
    } catch (err) {
        showNotification('Failed to delete', 'error');
    }
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;

    container.appendChild(notif);
    
    // Trigger animation
    requestAnimationFrame(() => {
        notif.classList.add('show');
    });

    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 400);
    }, 3000);
}

// Backup and Restore Logic
document.addEventListener('DOMContentLoaded', () => {
    const backupBtn = document.getElementById('backup-db-btn');
    const restoreBtn = document.getElementById('restore-db-btn');
    const restoreModal = document.getElementById('restore-db-modal');
    const restoreCloseBtn = document.getElementById('restore-db-close-btn');
    const restoreCancelBtn = document.getElementById('restore-db-cancel-btn');
    const restoreForm = document.getElementById('restore-db-form');
    const restoreSubmitBtn = document.getElementById('restore-db-submit-btn');
    const restoreStatus = document.getElementById('restore-status');
    
    // Backup
    if (backupBtn) {
        backupBtn.addEventListener('click', () => {
            showNotification('Starting backup download...', 'info');
            // Trigger download by setting window location
            window.location.href = '/api/backup/export';
        });
    }

    // Restore Modal Toggles
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            restoreForm.reset();
            restoreStatus.textContent = '';
            restoreModal.classList.add('active');
        });
    }
    
    if (restoreCloseBtn) restoreCloseBtn.addEventListener('click', () => restoreModal.classList.remove('active'));
    if (restoreCancelBtn) restoreCancelBtn.addEventListener('click', () => restoreModal.classList.remove('active'));

    // Restore Submission
    if (restoreSubmitBtn) {
        restoreSubmitBtn.addEventListener('click', async () => {
            const fileInput = document.getElementById('restore-file');
            if (!fileInput.files.length) {
                showNotification('Please select a backup file', 'error');
                return;
            }
            
            if (!confirm('WARNING: Restoring a database will overwrite data. If you selected --clean, existing objects will be deleted. Are you sure you want to proceed?')) {
                return;
            }
            
            const formData = new FormData(restoreForm);
            
            const originalText = restoreSubmitBtn.textContent;
            restoreSubmitBtn.textContent = 'Restoring...';
            restoreSubmitBtn.disabled = true;
            restoreStatus.textContent = 'Uploading and restoring database, please do not close the window...';
            restoreStatus.style.color = 'var(--text-secondary)';

            try {
                const res = await fetch('/api/backup/restore', {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const result = await res.json();
                    showNotification(result.message, 'success');
                    restoreModal.classList.remove('active');
                    if (window.loadBrowser) window.loadBrowser(); // refresh tree
                } else {
                    const err = await res.json();
                    throw new Error(err.detail || 'Restore failed');
                }
            } catch (err) {
                showNotification('Restore encountered an error', 'error');
                restoreStatus.textContent = `Error: ${err.message}`;
                restoreStatus.style.color = 'var(--danger-color)';
            } finally {
                restoreSubmitBtn.textContent = originalText;
                restoreSubmitBtn.disabled = false;
            }
        });
    }
});
