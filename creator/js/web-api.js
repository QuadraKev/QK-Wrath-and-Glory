// Web API shim - replaces Electron's window.api with browser-native equivalents

(function() {
    // Store file reference from open dialog for subsequent importCharacter call
    let _pendingFile = null;
    // Store file handle from File System Access API for save/overwrite
    let _saveFileHandle = null;
    // Chrome Android supports showSaveFilePicker but its implementation is buggy
    // (0-byte files, appends .json to custom extensions) — skip it on Android
    const _isAndroid = /Android/i.test(navigator.userAgent);

    // iOS doesn't recognize custom file extensions (.character) in <input accept="...">
    // — omit accept to let users browse all files
    const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    window.api = {
        // Load game data via fetch (cache-busted with version)
        loadGameData: async (filename) => {
            const response = await fetch('../data/' + filename + '?v=23');
            if (!response.ok) throw new Error(`Failed to load ${filename}`);
            return response.json();
        },

        // Character file operations (legacy - no-ops for web)
        listCharacters: async () => [],
        loadCharacter: async () => ({ success: false, error: 'Not supported in web version' }),
        saveCharacter: async () => ({ success: false, error: 'Not supported in web version' }),
        deleteCharacter: async () => ({ success: false, error: 'Not supported in web version' }),

        // Show save dialog - uses File System Access API for real Save As when available
        showSaveDialog: async (defaultName) => {
            if (window.showSaveFilePicker && !_isAndroid) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: defaultName || 'character.character',
                        types: [{
                            description: 'Character Files',
                            accept: { 'application/json': ['.character'] }
                        }]
                    });
                    _saveFileHandle = handle;
                    return { canceled: false, filePath: handle.name };
                } catch (e) {
                    if (e.name === 'AbortError') {
                        return { canceled: true };
                    }
                    // Some browsers (e.g. Brave) have showSaveFilePicker but block it
                    // with SecurityError — fall through to download fallback
                    console.warn('showSaveFilePicker blocked, using download fallback:', e.name);
                }
            }
            // Fallback for browsers without File System Access API (or that block it)
            return { canceled: false, filePath: defaultName || 'character.character' };
        },

        // Show open dialog - opens file picker and stores file reference
        showOpenDialog: async () => {
            // Use File System Access API when available for handle-based open
            if (window.showOpenFilePicker && !_isAndroid) {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [{
                            description: 'Character Files',
                            accept: { 'application/json': ['.character', '.json'] }
                        }]
                    });
                    _pendingFile = await handle.getFile();
                    _saveFileHandle = handle;
                    return {
                        canceled: false,
                        filePaths: [handle.name]
                    };
                } catch (e) {
                    if (e.name === 'AbortError') {
                        return { canceled: true };
                    }
                    // Some browsers (e.g. Brave) block the File System Access API
                    console.warn('showOpenFilePicker blocked, using input fallback:', e.name);
                }
            }

            // Fallback: use <input type="file">
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                if (!_isIOS) input.accept = '.character,.json';
                input.onchange = () => {
                    if (!input.files || !input.files[0]) {
                        resolve({ canceled: true });
                        return;
                    }
                    _pendingFile = input.files[0];
                    _saveFileHandle = null;
                    resolve({
                        canceled: false,
                        filePaths: [input.files[0].name]
                    });
                };
                input.oncancel = () => resolve({ canceled: true });
                input.click();
            });
        },

        // Export character - writes to file handle if available, otherwise triggers download
        exportCharacter: async (character, filePath) => {
            const json = JSON.stringify(character, null, 2);

            // Safety check: ensure we have valid JSON content
            if (!json || json.length < 2) {
                console.error('exportCharacter: JSON.stringify produced empty/invalid output', typeof character);
                return { success: false, error: 'Failed to serialize character data.' };
            }

            // Use stored file handle from Save As dialog when available
            if (_saveFileHandle) {
                let writable;
                try {
                    writable = await _saveFileHandle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    return { success: true };
                } catch (e) {
                    console.error('File System Access API save failed:', e);
                    // Abort the writable stream to prevent file corruption (0-byte files)
                    if (writable) {
                        try { await writable.abort(); } catch (_) {}
                    }
                    // Clear handle and fall through to download fallback
                    _saveFileHandle = null;
                }
            }

            // Try Web Share API (avoids Chrome Android blob download bugs)
            const fileName = filePath || 'character.character';
            if (navigator.share) {
                try {
                    const file = new File([json], fileName, { type: 'application/json' });
                    await navigator.share({ files: [file] });
                    return { success: true };
                } catch (e) {
                    if (e.name === 'AbortError') {
                        return { success: false, error: 'Save cancelled.' };
                    }
                    console.warn('Web Share API failed, falling back to download:', e.name, e.message);
                }
            }

            // Last resort: blob download (known to produce 0 KB files in Chrome Android)
            const blob = new Blob([json], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
            return { success: true };
        },

        // Import character - reads the file stored by showOpenDialog
        importCharacter: async () => {
            if (!_pendingFile) {
                return { success: false, error: 'No file selected' };
            }
            try {
                const text = await _pendingFile.text();
                const character = JSON.parse(text);
                _pendingFile = null;
                return { success: true, character };
            } catch (e) {
                _pendingFile = null;
                return { success: false, error: 'Failed to read file: ' + e.message };
            }
        },

        // PDF export - use browser print
        exportPDF: async () => {
            window.print();
            return { success: true };
        },

        // Native dialog replacements
        showConfirm: async (message) => {
            return confirm(message);
        },

        showMessage: async (message) => {
            alert(message);
        },

        // Window close handling - use beforeunload instead
        onRequestClose: () => {
            // Handled by beforeunload event below
        },
        confirmClose: () => {
            // No-op in web version
        },
        showUnsavedDialog: async () => {
            // Return 1 ("Don't Save") since beforeunload handles the prompt
            return 1;
        }
    };

    // Set up beforeunload for unsaved changes warning
    window.addEventListener('beforeunload', (e) => {
        if (typeof State !== 'undefined' && State.isDirty) {
            e.preventDefault();
        }
    });
})();
