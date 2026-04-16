(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const STORAGE_KEY = 'surfdiaryConfig';
  const SCHEMA_VERSION = 2;

  function createDefaultConfig() {
    return {
      version: SCHEMA_VERSION,
      language: 'ja',
      defaultBranchId: 'inbox',
      localSyncMode: 'manual',
      localFiles: {
        rootPath: '',
        readAccess: 'manual',
        writeAccess: 'manual',
        transport: 'nativeMessaging'
      },
      markdownExport: {
        lineBreaks: 'preserve',
        includeBlockLinks: true
      }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeConfig(config) {
    const defaults = createDefaultConfig();
    const input = config && typeof config === 'object' ? config : {};
    const localFiles = input.localFiles && typeof input.localFiles === 'object'
      ? input.localFiles
      : {};
    const markdownExport = input.markdownExport && typeof input.markdownExport === 'object'
      ? input.markdownExport
      : {};

    return {
      version: typeof input.version === 'number' ? input.version : SCHEMA_VERSION,
      language: input.language === 'en' ? 'en' : defaults.language,
      defaultBranchId: typeof input.defaultBranchId === 'string' && input.defaultBranchId.trim()
        ? input.defaultBranchId.trim()
        : defaults.defaultBranchId,
      localSyncMode: input.localSyncMode === 'off' || input.localSyncMode === 'automatic' || input.localSyncMode === 'manual'
        ? input.localSyncMode
        : defaults.localSyncMode,
      localFiles: {
        rootPath: typeof localFiles.rootPath === 'string' ? localFiles.rootPath.trim() : defaults.localFiles.rootPath,
        readAccess: localFiles.readAccess === 'off' || localFiles.readAccess === 'manual' || localFiles.readAccess === 'automatic'
          ? localFiles.readAccess
          : defaults.localFiles.readAccess,
        writeAccess: localFiles.writeAccess === 'off' || localFiles.writeAccess === 'manual' || localFiles.writeAccess === 'automatic'
          ? localFiles.writeAccess
          : defaults.localFiles.writeAccess,
        transport: localFiles.transport === 'downloads' || localFiles.transport === 'nativeMessaging' || localFiles.transport === 'manual'
          ? localFiles.transport
          : defaults.localFiles.transport
      },
      markdownExport: {
        lineBreaks: markdownExport.lineBreaks === 'collapse' ? 'collapse' : defaults.markdownExport.lineBreaks,
        includeBlockLinks: typeof markdownExport.includeBlockLinks === 'boolean'
          ? markdownExport.includeBlockLinks
          : defaults.markdownExport.includeBlockLinks
      }
    };
  }

  async function readConfig() {
    const response = await browser.storage.local.get({ [STORAGE_KEY]: null });
    const current = response[STORAGE_KEY];

    if (!current || typeof current !== 'object') {
      const defaults = createDefaultConfig();
      await browser.storage.local.set({ [STORAGE_KEY]: defaults });
      return defaults;
    }

    const normalized = normalizeConfig(current);
    if (
      normalized.version !== current.version ||
      normalized.language !== current.language ||
      normalized.defaultBranchId !== current.defaultBranchId ||
      normalized.localSyncMode !== current.localSyncMode ||
      JSON.stringify(normalized.localFiles) !== JSON.stringify(current.localFiles || {}) ||
      JSON.stringify(normalized.markdownExport) !== JSON.stringify(current.markdownExport || {})
    ) {
      await browser.storage.local.set({ [STORAGE_KEY]: normalized });
    }

    return normalized;
  }

  async function saveConfig(configInput) {
    const config = normalizeConfig(configInput);
    await browser.storage.local.set({ [STORAGE_KEY]: config });
    return config;
  }

  async function updateConfig(updates) {
    const current = await readConfig();
    const merged = normalizeConfig({
      ...current,
      ...updates,
      localFiles: {
        ...current.localFiles,
        ...(updates && updates.localFiles ? updates.localFiles : {})
      },
      markdownExport: {
        ...current.markdownExport,
        ...(updates && updates.markdownExport ? updates.markdownExport : {})
      }
    });

    await browser.storage.local.set({ [STORAGE_KEY]: merged });
    return merged;
  }

  root.SurfDiaryConfig = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    createDefaultConfig,
    normalizeConfig,
    readConfig,
    saveConfig,
    updateConfig,
    clone
  };
})();
