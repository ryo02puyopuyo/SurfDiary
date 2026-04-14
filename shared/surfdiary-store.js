(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const STORAGE_KEY = 'surfdiaryState';
  const LEGACY_KEY = 'memos';
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
    return {
      pageUrl: source.pageUrl || null,
      title: source.title || null,
      selectionText: source.selectionText || null,
      imageUrl: source.imageUrl || null,
      url: source.url || null
    };
  }

  function normalizeContent(type, content) {
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      return clone(content);
    }
    if (type === 'text') {
      return { text: content || '' };
    }
    if (type === 'image') {
      return { imageUrl: content || '' };
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

    return {
      id,
      type,
      branchId: block && block.branchId ? block.branchId : DEFAULT_BRANCH_ID,
      content: normalizeContent(type, block ? block.content : null),
      source: normalizeSource(block ? block.source : null),
      createdAt
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
      imageUrl: memo.imageUrl || null
    };

    if (memo.type === 'image' || memo.imageUrl) {
      return normalizeBlock({
        id: memo.id,
        type: 'image',
        branchId: DEFAULT_BRANCH_ID,
        content: {
          imageUrl: memo.imageUrl || '',
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
    const response = await browser.storage.local.get({ [STORAGE_KEY]: null, [LEGACY_KEY]: [] });
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
      }

      return normalized;
    }

    const migratedBlocks = legacyMemos.map(legacyMemoToBlock).filter(Boolean);
    const migratedState = createDefaultState();
    migratedState.blocks = migratedBlocks;

    await browser.storage.local.set({ [STORAGE_KEY]: migratedState });
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
    return true;
  }

  async function loadBlocks() {
    const state = await readState();
    return state.blocks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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

  root.SurfDiaryStore = {
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
})();
