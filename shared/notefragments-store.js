(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const STORAGE_KEY = 'noteFragmentsState';
  const SCHEMA_VERSION = 2;
  const DEFAULT_BRANCH_ID = 'inbox';
  const DEFAULT_BRANCH_NAME = 'Inbox';

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function createDefaultState() {
    return {
      version: SCHEMA_VERSION,
      branches: [
        {
          id: DEFAULT_BRANCH_ID,
          name: DEFAULT_BRANCH_NAME,
          parentId: null,
          createdAt: new Date().toISOString()
        }
      ],
      blocks: [],
      documents: []
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function notifyStateChanged(reason = 'updated') {
    if (!root.browser || !browser.runtime || typeof browser.runtime.sendMessage !== 'function') {
      return;
    }

    try {
      await browser.runtime.sendMessage({
        type: 'notefragments-state-changed',
        reason
      });
    } catch (error) {
      // Ignore delivery failures when no listeners are available.
    }
  }

  function normalizeString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function ensureInboxBranch(branches) {
    const list = Array.isArray(branches) ? branches.slice() : [];
    const exists = list.some((branch) => branch && branch.id === DEFAULT_BRANCH_ID);
    if (!exists) {
      list.unshift({
        id: DEFAULT_BRANCH_ID,
        name: DEFAULT_BRANCH_NAME,
        parentId: null,
        createdAt: new Date().toISOString()
      });
    }
    return list;
  }

  function normalizeBranch(branch) {
    if (!branch || typeof branch !== 'object') {
      return null;
    }

    return {
      id: branch.id || createId('br'),
      name: branch.name || 'Untitled Branch',
      parentId: branch.parentId || null,
      createdAt: branch.createdAt || new Date().toISOString()
    };
  }

  function normalizeSource(source) {
    if (!source || typeof source !== 'object') {
      return {};
    }

    const imageUrl = normalizeString(source.imageUrl);
    const previewImageUrl = normalizeString(source.previewImageUrl) || imageUrl;
    const originalImageUrl = normalizeString(source.originalImageUrl) || imageUrl;

    return {
      pageUrl: normalizeString(source.pageUrl) || null,
      title: normalizeString(source.title) || null,
      selectionText: normalizeString(source.selectionText) || null,
      imageUrl: previewImageUrl || null,
      previewImageUrl: previewImageUrl || null,
      originalImageUrl: originalImageUrl || null,
      imageFileName: normalizeString(source.imageFileName) || null,
      imageMimeType: normalizeString(source.imageMimeType) || null,
      url: normalizeString(source.url) || null
    };
  }

  function normalizeContent(type, content) {
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      const normalized = clone(content);
      if (type === 'image') {
        const imageUrl = normalizeString(normalized.imageUrl);
        const previewImageUrl = normalizeString(normalized.previewImageUrl) || imageUrl;
        const originalImageUrl = normalizeString(normalized.originalImageUrl) || imageUrl;
        return {
          ...normalized,
          imageUrl: previewImageUrl || originalImageUrl,
          previewImageUrl: previewImageUrl || originalImageUrl || '',
          originalImageUrl: originalImageUrl || previewImageUrl || ''
        };
      }
      return normalized;
    }
    if (type === 'text') {
      return { text: content || '' };
    }
    if (type === 'image') {
      const imageUrl = normalizeString(content);
      return {
        imageUrl,
        previewImageUrl: imageUrl,
        originalImageUrl: imageUrl
      };
    }
    if (type === 'url') {
      return { url: content || '' };
    }
    return { value: content ?? null };
  }

  function normalizeBlock(block) {
    const type = block && block.type ? block.type : 'text';
    const createdAt = block && block.createdAt ? block.createdAt : new Date().toISOString();
    const id = block && block.id ? block.id : createId('blk');
    const content = normalizeContent(type, block ? block.content : null);
    const source = normalizeSource(block ? block.source : null);
    const sortOrder = typeof (block && block.sortOrder) === 'number'
      ? block.sortOrder
      : new Date(createdAt).getTime();

    if (type === 'image') {
      const previewImageUrl = normalizeString(content.previewImageUrl) || normalizeString(content.imageUrl) || normalizeString(source.previewImageUrl) || normalizeString(source.imageUrl);
      const originalImageUrl = normalizeString(content.originalImageUrl) || normalizeString(source.originalImageUrl) || normalizeString(content.imageUrl) || normalizeString(source.imageUrl);
      content.imageUrl = previewImageUrl || originalImageUrl;
      content.previewImageUrl = previewImageUrl || originalImageUrl;
      content.originalImageUrl = originalImageUrl || previewImageUrl;
      source.imageUrl = previewImageUrl || originalImageUrl || null;
      source.previewImageUrl = previewImageUrl || originalImageUrl || null;
      source.originalImageUrl = originalImageUrl || previewImageUrl || null;
    }

    return {
      id,
      type,
      branchId: block && block.branchId ? block.branchId : DEFAULT_BRANCH_ID,
      content,
      source,
      createdAt,
      sortOrder
    };
  }

  function normalizeDocument(document) {
    if (!document || typeof document !== 'object') {
      return null;
    }

    const createdAt = document.createdAt || new Date().toISOString();
    const updatedAt = document.updatedAt || createdAt;

    return {
      id: document.id || createId('doc'),
      title: document.title || 'Untitled Diary',
      blockIds: Array.isArray(document.blockIds) ? document.blockIds.slice() : [],
      markdown: typeof document.markdown === 'string' ? document.markdown : '',
      createdAt,
      updatedAt
    };
  }

  function legacyMemoToBlock(memo) {
    if (!memo || typeof memo !== 'object') {
      return null;
    }

    const source = {
      title: memo.title || null,
      pageUrl: memo.url || null,
      url: memo.url || null,
      imageUrl: memo.imageUrl || null,
      previewImageUrl: memo.imageUrl || null,
      originalImageUrl: memo.imageUrl || null
    };

    if (memo.type === 'image' || memo.imageUrl) {
      return normalizeBlock({
        id: memo.id,
        type: 'image',
        branchId: DEFAULT_BRANCH_ID,
        content: {
          imageUrl: memo.imageUrl || '',
          previewImageUrl: memo.imageUrl || '',
          originalImageUrl: memo.imageUrl || '',
          text: memo.text || ''
        },
        source,
        createdAt: memo.timestamp || new Date().toISOString()
      });
    }

    if (memo.type === 'url' || memo.url) {
      return normalizeBlock({
        id: memo.id,
        type: 'url',
        branchId: DEFAULT_BRANCH_ID,
        content: {
          url: memo.url || '',
          title: memo.title || '',
          text: memo.text || ''
        },
        source,
        createdAt: memo.timestamp || new Date().toISOString()
      });
    }

    return normalizeBlock({
      id: memo.id,
      type: 'text',
      branchId: DEFAULT_BRANCH_ID,
      content: {
        text: memo.text || ''
      },
      source,
      createdAt: memo.timestamp || new Date().toISOString()
    });
  }

  async function readState() {
    const response = await browser.storage.local.get({ [STORAGE_KEY]: null });
    const current = response[STORAGE_KEY];
    const legacyMemos = Array.isArray(response[LEGACY_KEY]) ? response[LEGACY_KEY] : [];

    if (current && typeof current === 'object') {
      const normalized = {
        version: typeof current.version === 'number' ? current.version : SCHEMA_VERSION,
        branches: ensureInboxBranch(current.branches),
        blocks: Array.isArray(current.blocks) ? current.blocks.map(normalizeBlock) : [],
        documents: Array.isArray(current.documents) ? current.documents.map(normalizeDocument).filter(Boolean) : []
      };

      if (
        normalized.version !== current.version ||
        normalized.branches.length !== (Array.isArray(current.branches) ? current.branches.length : 0) ||
        normalized.documents.length !== (Array.isArray(current.documents) ? current.documents.length : 0)
      ) {
        await browser.storage.local.set({ [STORAGE_KEY]: normalized });
        await notifyStateChanged('normalized');
      }

      return normalized;
    }

    const migratedBlocks = legacyMemos.map(legacyMemoToBlock).filter(Boolean);
    const migratedState = createDefaultState();
    migratedState.blocks = migratedBlocks;

    await browser.storage.local.set({ [STORAGE_KEY]: migratedState });
    await notifyStateChanged('migrated');
    return migratedState;
  }

  async function saveBlock(blockInput) {
    const state = await readState();
    const block = normalizeBlock(blockInput);
    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      blocks: state.blocks.concat(block)
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('block-saved');
    return block;
  }

  async function updateBlock(blockId, updates) {
    const state = await readState();
    let updatedBlock = null;

    const nextBlocks = state.blocks.map((block) => {
      if (block.id !== blockId) {
        return block;
      }

      updatedBlock = normalizeBlock({
        ...block,
        ...updates,
        id: block.id,
        createdAt: block.createdAt,
        branchId: updates && updates.branchId ? updates.branchId : block.branchId
      });

      return updatedBlock;
    });

    if (!updatedBlock) {
      return null;
    }

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      blocks: nextBlocks
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('block-updated');
    return updatedBlock;
  }

  async function deleteBlock(blockId) {
    const state = await readState();
    const nextBlocks = state.blocks.filter((block) => block.id !== blockId);

    if (nextBlocks.length === state.blocks.length) {
      return false;
    }

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      blocks: nextBlocks
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('block-deleted');
    return true;
  }

  async function loadBlocks() {
    const state = await readState();
    return state.blocks.slice().sort((a, b) => {
      const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : new Date(a.createdAt).getTime();
      const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : new Date(b.createdAt).getTime();
      if (bOrder !== aOrder) {
        return bOrder - aOrder;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async function loadBranches() {
    const state = await readState();
    return state.branches.slice();
  }

  async function createBranch(branchInput) {
    const state = await readState();
    const branch = normalizeBranch(branchInput);

    if (!branch) {
      return null;
    }

    const nextBranches = ensureInboxBranch(state.branches);
    const nameExists = nextBranches.some((item) => item.name.toLowerCase() === branch.name.toLowerCase());
    if (nameExists) {
      return nextBranches.find((item) => item.name.toLowerCase() === branch.name.toLowerCase()) || null;
    }

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: nextBranches.concat(branch)
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('branch-created');
    return branch;
  }

  async function saveDocument(documentInput) {
    const state = await readState();
    const document = normalizeDocument(documentInput);

    if (!document) {
      return null;
    }

    const existingIndex = state.documents.findIndex((item) => item.id === document.id);
    const nextDocuments = existingIndex >= 0
      ? state.documents.map((item) => (item.id === document.id ? document : item))
      : state.documents.concat({
        ...document,
        updatedAt: document.updatedAt || document.createdAt
      });

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      documents: nextDocuments
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('document-saved');
    return document;
  }

  async function updateDocument(documentId, updates) {
    const state = await readState();
    let updatedDocument = null;

    const nextDocuments = state.documents.map((document) => {
      if (document.id !== documentId) {
        return document;
      }

      updatedDocument = normalizeDocument({
        ...document,
        ...updates,
        id: document.id,
        createdAt: document.createdAt,
        updatedAt: new Date().toISOString()
      });

      return updatedDocument;
    });

    if (!updatedDocument) {
      return null;
    }

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      documents: nextDocuments
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('document-updated');
    return updatedDocument;
  }

  async function deleteDocument(documentId) {
    const state = await readState();
    const nextDocuments = state.documents.filter((document) => document.id !== documentId);

    if (nextDocuments.length === state.documents.length) {
      return false;
    }

    const nextState = {
      ...state,
      version: SCHEMA_VERSION,
      branches: ensureInboxBranch(state.branches),
      documents: nextDocuments
    };

    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
    await notifyStateChanged('document-deleted');
    return true;
  }

  async function loadDocuments() {
    const state = await readState();
    return state.documents.slice().sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  const storeApi = {
    DEFAULT_BRANCH_ID,
    DEFAULT_BRANCH_NAME,
    createId,
    createDefaultState,
    ensureInboxBranch,
    normalizeBlock,
    legacyMemoToBlock,
    readState,
    saveBlock,
    updateBlock,
    deleteBlock,
    loadBlocks,
    loadBranches,
    createBranch,
    saveDocument,
    updateDocument,
    deleteDocument,
    loadDocuments
  };

  root.NoteFragmentsStore = storeApi;
})();
