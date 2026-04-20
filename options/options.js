document.addEventListener('DOMContentLoaded', () => {
  const localRootPath = document.getElementById('local-root-path');
  const localReadAccess = document.getElementById('local-read-access');
  const localWriteAccess = document.getElementById('local-write-access');
  const localTransport = document.getElementById('local-transport');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const settingsStatus = document.getElementById('settings-status');
  const pickerSupport = document.getElementById('picker-support');
  const pickerLog = document.getElementById('picker-log');
  const openSavePickerBtn = document.getElementById('open-save-picker-btn');
  const openFilePickerBtn = document.getElementById('open-file-picker-btn');
  const openDirPickerBtn = document.getElementById('open-dir-picker-btn');
  const downloadExportBtn = document.getElementById('download-export-btn');
  const downloadExportAutoBtn = document.getElementById('download-export-auto-btn');
  const downloadExportRootBtn = document.getElementById('download-export-root-btn');
  const downloadExportNestedBtn = document.getElementById('download-export-nested-btn');

  const state = {
    config: null,
    pickerId: 'notefragments-local-export'
  };

  setPickerLog('Options script loaded.');
  window.addEventListener('error', (event) => {
    setPickerLog(`Window error: ${event.message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason ? describeError(event.reason) : 'Unknown rejection';
    setPickerLog(`Unhandled rejection: ${reason}`);
  });
  loadSettings();
  updatePickerSupport();

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  if (openSavePickerBtn) {
    openSavePickerBtn.addEventListener('click', trySavePicker);
  }

  if (openFilePickerBtn) {
    openFilePickerBtn.addEventListener('click', tryOpenFilePicker);
  }

  if (openDirPickerBtn) {
    openDirPickerBtn.addEventListener('click', tryOpenDirPicker);
  }

  if (downloadExportBtn) {
    downloadExportBtn.addEventListener('click', tryDownloadsExport);
  }

  if (downloadExportAutoBtn) {
    downloadExportAutoBtn.addEventListener('click', tryDownloadsExportAuto);
  }

  if (downloadExportRootBtn) {
    downloadExportRootBtn.addEventListener('click', () => tryDownloadsExportPath('NoteFragments-root-test.md'));
  }

  if (downloadExportNestedBtn) {
    downloadExportNestedBtn.addEventListener('click', () => tryDownloadsExportPath('NoteFragments/tests/picker-test.md'));
  }

  async function loadSettings() {
    try {
      const config = await NoteFragmentsConfig.readConfig();
      state.config = config;

      if (localRootPath) {
        localRootPath.value = config.localFiles.rootPath || '';
      }
      if (localReadAccess) {
        localReadAccess.value = config.localFiles.readAccess || 'manual';
      }
      if (localWriteAccess) {
        localWriteAccess.value = config.localFiles.writeAccess || 'manual';
      }
      if (localTransport) {
        localTransport.value = config.localFiles.transport || 'nativeMessaging';
      }

      setStatus('Settings loaded.');
    } catch (error) {
      console.error('Failed to load settings', error);
      setStatus('Failed to load settings.');
    }
  }

  async function saveSettings() {
    try {
      const nextConfig = {
        ...(state.config || NoteFragmentsConfig.createDefaultConfig()),
        localFiles: {
          rootPath: localRootPath ? localRootPath.value.trim() : '',
          readAccess: localReadAccess ? localReadAccess.value : 'manual',
          writeAccess: localWriteAccess ? localWriteAccess.value : 'manual',
          transport: localTransport ? localTransport.value : 'nativeMessaging'
        }
      };

      state.config = await NoteFragmentsConfig.saveConfig(nextConfig);
      setStatus('Settings saved locally.');
    } catch (error) {
      console.error('Failed to save settings', error);
      setStatus('Failed to save settings.');
    }
  }

  function updatePickerSupport() {
    const hasSavePicker = typeof window.showSaveFilePicker === 'function';
    const hasOpenPicker = typeof window.showOpenFilePicker === 'function';
    const hasDirectoryPicker = typeof window.showDirectoryPicker === 'function';
    const support = [];
    if (hasSavePicker) {
      support.push('showSaveFilePicker');
    }
    if (hasOpenPicker) {
      support.push('showOpenFilePicker');
    }
    if (hasDirectoryPicker) {
      support.push('showDirectoryPicker');
    }
    const downloadsAvailable = typeof browser !== 'undefined'
      && Boolean(browser.downloads && typeof browser.downloads.download === 'function');
    const parts = [];

    if (support.length) {
      parts.push(`File System Access API: ${support.join(', ')}`);
    } else {
      parts.push('File System Access API: unavailable in this browser');
    }

    parts.push(`Downloads API: ${downloadsAvailable ? 'available' : 'unavailable'}`);
    setPickerSupport(parts.join(' | '));

    syncExperimentButton(openSavePickerBtn, hasSavePicker, 'This browser does not support showSaveFilePicker here.');
    syncExperimentButton(openFilePickerBtn, hasOpenPicker, 'This browser does not support showOpenFilePicker here.');
    syncExperimentButton(openDirPickerBtn, hasDirectoryPicker, 'This browser does not support showDirectoryPicker here.');
    syncExperimentButton(downloadExportBtn, downloadsAvailable, 'Downloads API is unavailable in this context.');
    syncExperimentButton(downloadExportAutoBtn, downloadsAvailable, 'Downloads API is unavailable in this context.');
    syncExperimentButton(downloadExportRootBtn, downloadsAvailable, 'Downloads API is unavailable in this context.');
    syncExperimentButton(downloadExportNestedBtn, downloadsAvailable, 'Downloads API is unavailable in this context.');
  }

  async function trySavePicker() {
    setPickerLog('Save dialog button clicked.');
    if (typeof window.showSaveFilePicker !== 'function') {
      setPickerLog('showSaveFilePicker is not available in this browser.');
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        id: state.pickerId,
        suggestedName: 'Untitled Document.md',
        startIn: 'documents',
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'] }
        }]
      });

      const writable = await handle.createWritable();
      const content = [
        '# NoteFragments picker test',
        '',
        `Saved at: ${new Date().toISOString()}`,
        '',
        'If you open this dialog again with the same picker id, the browser may reopen near the last folder.'
      ].join('\n');
      await writable.write(content);
      await writable.close();

      setPickerLog([
        'Saved a test file.',
        `Picker id: ${state.pickerId}`,
        `File name: ${handle.name || '(unknown)'}`,
        'If the dialog remembers its last folder on the next run, the browser is honoring the picker id.'
      ].join('\n'));
    } catch (error) {
      setPickerLog(`Save picker failed: ${describeError(error)}`);
    }
  }

  async function tryOpenFilePicker() {
    setPickerLog('Open file dialog button clicked.');
    if (typeof window.showOpenFilePicker !== 'function') {
      setPickerLog('showOpenFilePicker is not available in this browser.');
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        id: state.pickerId,
        startIn: 'documents',
        multiple: false,
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'] }
        }]
      });

      const file = await handle.getFile();
      const text = await file.text();
      setPickerLog([
        'Opened a file.',
        `Name: ${file.name}`,
        `Size: ${file.size} bytes`,
        `Picker id: ${state.pickerId}`,
        '',
        text.slice(0, 600) || '(file is empty)'
      ].join('\n'));
    } catch (error) {
      setPickerLog(`Open file picker failed: ${describeError(error)}`);
    }
  }

  async function tryOpenDirPicker() {
    setPickerLog('Open folder dialog button clicked.');
    if (typeof window.showDirectoryPicker !== 'function') {
      setPickerLog('showDirectoryPicker is not available in this browser.');
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        id: state.pickerId,
        mode: 'readwrite',
        startIn: 'documents'
      });

      const entries = [];
      for await (const [name, entry] of handle.entries()) {
        entries.push(`${entry.kind}: ${name}`);
        if (entries.length >= 12) {
          break;
        }
      }

      setPickerLog([
        'Opened a directory.',
        `Picker id: ${state.pickerId}`,
        `Entries shown: ${entries.length}`,
        ...entries
      ].join('\n'));
    } catch (error) {
      setPickerLog(`Open directory picker failed: ${describeError(error)}`);
    }
  }

  async function tryDownloadsExport() {
    setPickerLog('Downloads export button clicked.');
    try {
      setPickerLog('Downloads export button clicked. Preparing run...');
      await runDownloadsExport(true);
    } catch (error) {
      setPickerLog(`Downloads export wrapper failed: ${describeError(error)}`);
    }
  }

  async function tryDownloadsExportAuto() {
    setPickerLog('Downloads export auto button clicked.');
    try {
      setPickerLog('Downloads export auto button clicked. Preparing run...');
      await runDownloadsExport(true);
    } catch (error) {
      setPickerLog(`Downloads export auto wrapper failed: ${describeError(error)}`);
    }
  }

  async function tryDownloadsExportPath(filename) {
    setPickerLog(`Downloads export path button clicked: ${filename}`);
    try {
      await runDownloadsExport(true, filename);
    } catch (error) {
      setPickerLog(`Downloads export path wrapper failed: ${describeError(error)}`);
    }
  }

  async function runDownloadsExport(saveAs, filename = 'NoteFragments/exports/picker-test.md') {
    setPickerLog(`runDownloadsExport entered (saveAs=${saveAs}, filename=${filename})`);
    if (typeof browser === 'undefined' || !browser.downloads || typeof browser.downloads.download !== 'function') {
      setPickerLog('browser.downloads.download is not available in this context.');
      return;
    }

    setPickerLog(`downloads API detected (saveAs=${saveAs})`);
    const text = [
      '# NoteFragments downloads test',
      '',
      `Exported at: ${new Date().toISOString()}`,
      '',
      'This path is controlled by the browser downloads flow, not by File System Access API.'
    ].join('\n');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    setPickerLog(`Blob created (saveAs=${saveAs})`);
    const url = URL.createObjectURL(blob);
    setPickerLog(`Object URL created (saveAs=${saveAs})`);
    let pendingNoticeId = null;

    try {
      setPickerLog(`Calling browser.downloads.download(saveAs=${saveAs})...`);
      pendingNoticeId = window.setTimeout(() => {
        setPickerLog([
          `browser.downloads.download(saveAs=${saveAs}) is still pending.`,
          'If no dialog appeared, check the downloads panel or the default download folder.',
          'Some Chromium-based browsers keep the promise pending until the browser finishes its internal flow.'
        ].join('\n'));
      }, 1500);

      const downloadId = await browser.downloads.download({
        url,
        filename,
        saveAs,
        conflictAction: 'uniquify'
      });

      setPickerLog([
        'Started a downloads-based export.',
        `Download id: ${downloadId}`,
        `saveAs: ${saveAs}`,
        saveAs
          ? 'The browser controls the initial folder for this dialog.'
          : 'This path should download directly into the default downloads folder.',
        'This is the practical fallback when showSaveFilePicker is unavailable.'
      ].join('\n'));
    } catch (error) {
      setPickerLog(`Downloads export failed (saveAs=${saveAs}): ${describeError(error)}`);
    } finally {
      if (pendingNoticeId !== null) {
        window.clearTimeout(pendingNoticeId);
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function describeError(error) {
    if (!error) {
      return 'Unknown error';
    }
    return error.name ? `${error.name}: ${error.message || ''}`.trim() : String(error);
  }

  function setPickerSupport(message) {
    if (pickerSupport) {
      pickerSupport.textContent = message;
    }
  }

  function setPickerLog(message) {
    if (pickerLog) {
      pickerLog.textContent = message;
    }
  }

  function syncExperimentButton(button, enabled, disabledLabel) {
    if (!button) {
      return;
    }

    button.disabled = !enabled;
    button.title = enabled ? '' : disabledLabel;
  }

  function setStatus(message) {
    if (settingsStatus) {
      settingsStatus.textContent = message;
    }
  }
});

