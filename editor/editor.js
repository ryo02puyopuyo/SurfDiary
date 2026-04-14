document.addEventListener('DOMContentLoaded', () => {
  const memoList = document.getElementById('memo-list');
  const documentList = document.getElementById('document-list');
  const blockCount = document.getElementById('block-count');
  const documentCount = document.getElementById('document-count');
  const documentTitleInput = document.getElementById('document-title-input');
  const markdownTextarea = document.getElementById('markdown-textarea');
  const documentStatus = document.getElementById('document-status');
  const attachedCount = document.getElementById('attached-count');
  const attachedBlockList = document.getElementById('attached-block-list');
  const newDocumentBtn = document.getElementById('new-document-btn');
  const saveDocumentBtn = document.getElementById('save-document-btn');
  const exportDocumentBtn = document.getElementById('export-document-btn');
  const insertSelectedBtn = document.getElementById('insert-selected-btn');
  const clearAttachedBtn = document.getElementById('clear-attached-btn');

  const state = {
    blocks: [],
    branches: [],
    documents: [],
    currentDocumentId: null,
    attachedBlockIds: [],
    isDirty: false
  };

  loadState();

  if (documentTitleInput) {
    documentTitleInput.addEventListener('input', markDirty);
  }

  if (markdownTextarea) {
    markdownTextarea.addEventListener('input', markDirty);
  }

  if (newDocumentBtn) {
    newDocumentBtn.addEventListener('click', createNewDocument);
  }

  if (saveDocumentBtn) {
    saveDocumentBtn.addEventListener('click', saveCurrentDocument);
  }

  if (exportDocumentBtn) {
    exportDocumentBtn.addEventListener('click', exportCurrentDocument);
  }

  if (insertSelectedBtn) {
    insertSelectedBtn.addEventListener('click', insertSelectedBlocks);
  }

  if (clearAttachedBtn) {
    clearAttachedBtn.addEventListener('click', () => {
      state.attachedBlockIds = [];
      markDirty();
      renderAttachedBlocks();
      renderBlocks();
    });
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.surfdiaryState) {
      loadState();
    }
  });

  async function loadState() {
    try {
      const [blocks, branches, documents] = await Promise.all([
        SurfDiaryStore.loadBlocks(),
        SurfDiaryStore.loadBranches(),
        SurfDiaryStore.loadDocuments()
      ]);

      state.blocks = blocks;
      state.branches = sortBranches(branches);
      state.documents = sortDocuments(documents);

      renderCounts();
      renderBlocks();
      renderDocuments();
      renderAttachedBlocks();
      refreshStatus();
    } catch (e) {
      console.error('Failed to load editor state', e);
    }
  }

  function sortBranches(branches) {
    const list = Array.isArray(branches) ? branches.slice() : [];
    return list.sort((a, b) => {
      if (a.id === SurfDiaryStore.DEFAULT_BRANCH_ID) return -1;
      if (b.id === SurfDiaryStore.DEFAULT_BRANCH_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function sortDocuments(documents) {
    const list = Array.isArray(documents) ? documents.slice() : [];
    return list.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  function renderCounts() {
    if (blockCount) {
      blockCount.textContent = String(state.blocks.length);
    }
    if (documentCount) {
      documentCount.textContent = String(state.documents.length);
    }
    if (attachedCount) {
      attachedCount.textContent = `${state.attachedBlockIds.length} block${state.attachedBlockIds.length === 1 ? '' : 's'} attached`;
    }
  }

  function renderBlocks() {
    if (!memoList) {
      return;
    }

    memoList.innerHTML = '';

    if (!state.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'memo-empty';
      empty.textContent = 'No saved blocks yet. Save a note, URL, or image from the sidebar first.';
      memoList.appendChild(empty);
      return;
    }

    state.blocks.forEach((block) => {
      memoList.appendChild(createBlockCard(block));
    });
  }

  function createBlockCard(block) {
    const el = document.createElement('article');
    el.className = 'memo-item';
    if (state.attachedBlockIds.includes(block.id)) {
      el.classList.add('attached');
    }
    el.dataset.blockId = block.id;

    const head = document.createElement('div');
    head.className = 'memo-head';

    const titleWrap = document.createElement('div');

    const typeBadge = document.createElement('div');
    typeBadge.className = 'memo-type';
    typeBadge.textContent = block.type || 'text';
    titleWrap.appendChild(typeBadge);

    const title = document.createElement('h3');
    title.className = 'memo-title';
    title.textContent = getBlockTitle(block);
    titleWrap.appendChild(title);

    head.appendChild(titleWrap);

    const branchBadge = document.createElement('div');
    branchBadge.className = 'branch-badge';
    branchBadge.textContent = getBranchName(block.branchId);
    head.appendChild(branchBadge);

    el.appendChild(head);

    const body = document.createElement('div');
    body.className = 'memo-body';

    if (block.type === 'image' || (block.content && block.content.imageUrl)) {
      const wrap = document.createElement('div');
      wrap.className = 'memo-image-wrap';

      const img = document.createElement('img');
      img.className = 'memo-image';
      img.src = block.content && block.content.imageUrl ? block.content.imageUrl : '';
      img.alt = getBlockTitle(block);
      wrap.appendChild(img);
      body.appendChild(wrap);
    }

    const snippet = document.createElement('p');
    snippet.className = 'memo-snippet';
    snippet.textContent = getBlockSnippet(block);
    body.appendChild(snippet);

    const meta = document.createElement('div');
    meta.className = 'memo-meta';

    const metaLeft = document.createElement('div');
    metaLeft.className = 'memo-meta-left';

    const time = document.createElement('span');
    time.textContent = formatDate(block.createdAt);
    metaLeft.appendChild(time);

    meta.appendChild(metaLeft);

    const actions = document.createElement('div');
    actions.className = 'memo-actions';

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'memo-action-btn';
    attachBtn.textContent = state.attachedBlockIds.includes(block.id) ? 'Attached' : 'Attach';
    attachBtn.addEventListener('click', () => {
      toggleAttachedBlock(block.id);
    });

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'memo-action-btn primary';
    insertBtn.textContent = 'Insert';
    insertBtn.addEventListener('click', () => {
      attachBlock(block.id);
      insertSnippet(blockToMarkdown(block));
    });

    actions.appendChild(attachBtn);
    actions.appendChild(insertBtn);
    meta.appendChild(actions);

    body.appendChild(meta);
    el.appendChild(body);
    return el;
  }

  function renderDocuments() {
    if (!documentList) {
      return;
    }

    documentList.innerHTML = '';

    if (!state.documents.length) {
      const empty = document.createElement('div');
      empty.className = 'document-empty';
      empty.textContent = 'No documents yet. Create a diary draft, attach blocks, and save it here.';
      documentList.appendChild(empty);
      return;
    }

    state.documents.forEach((document) => {
      documentList.appendChild(createDocumentCard(document));
    });
  }

  function createDocumentCard(document) {
    const el = document.createElement('article');
    el.className = 'document-item';
    if (document.id === state.currentDocumentId) {
      el.classList.add('is-active');
    }

    const head = document.createElement('div');
    head.className = 'document-head';

    const titleWrap = document.createElement('div');

    const title = document.createElement('h3');
    title.className = 'document-title';
    title.textContent = document.title || 'Untitled Diary';
    titleWrap.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'document-meta';
    meta.textContent = `${document.blockIds.length} linked blocks`;
    titleWrap.appendChild(meta);

    head.appendChild(titleWrap);

    const stateBadge = document.createElement('div');
    stateBadge.className = 'document-state';
    stateBadge.textContent = document.id === state.currentDocumentId ? 'Editing' : 'Saved';
    head.appendChild(stateBadge);

    el.appendChild(head);

    const details = document.createElement('p');
    details.className = 'document-meta';
    details.textContent = `Updated ${formatDate(document.updatedAt || document.createdAt)}`;
    el.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'document-actions';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'memo-action-btn primary';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      loadDocumentIntoEditor(document.id);
    });

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'memo-action-btn';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => {
      exportDocument(document);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'memo-action-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      deleteDocument(document.id);
    });

    actions.appendChild(loadBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);
    el.appendChild(actions);
    return el;
  }

  function renderAttachedBlocks() {
    if (!attachedBlockList) {
      return;
    }

    attachedBlockList.innerHTML = '';
    renderCounts();

    const attachedBlocks = getAttachedBlocks();

    if (!attachedBlocks.length) {
      const empty = document.createElement('div');
      empty.className = 'attached-empty';
      empty.textContent = 'No blocks attached yet. Use Attach or Insert from the left panel.';
      attachedBlockList.appendChild(empty);
      return;
    }

    const chipRow = document.createElement('div');
    chipRow.className = 'attached-chip-row';

    attachedBlocks.forEach((block) => {
      const chip = document.createElement('span');
      chip.className = 'attached-chip';
      chip.textContent = getBlockTitle(block);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.title = 'Remove';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        detachBlock(block.id);
      });

      chip.appendChild(remove);
      chipRow.appendChild(chip);
    });

    attachedBlockList.appendChild(chipRow);

    attachedBlocks.forEach((block) => {
      const item = document.createElement('div');
      item.className = 'attached-item';

      const itemTitle = document.createElement('h3');
      itemTitle.className = 'attached-item-title';
      itemTitle.textContent = getBlockTitle(block);
      item.appendChild(itemTitle);

      const snippet = document.createElement('p');
      snippet.className = 'attached-item-snippet';
      snippet.textContent = getBlockSnippet(block);
      item.appendChild(snippet);

      const actions = document.createElement('div');
      actions.className = 'attached-item-actions';

      const insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.className = 'memo-action-btn primary';
      insertBtn.textContent = 'Insert';
      insertBtn.addEventListener('click', () => {
        insertSnippet(blockToMarkdown(block));
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'memo-action-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        detachBlock(block.id);
      });

      actions.appendChild(insertBtn);
      actions.appendChild(removeBtn);
      item.appendChild(actions);
      attachedBlockList.appendChild(item);
    });
  }

  function getAttachedBlocks() {
    const byId = new Map(state.blocks.map((block) => [block.id, block]));
    return state.attachedBlockIds.map((id) => byId.get(id)).filter(Boolean);
  }

  function getBlockById(blockId) {
    return state.blocks.find((block) => block.id === blockId) || null;
  }

  function getBranchName(branchId) {
    const branch = state.branches.find((item) => item.id === branchId);
    return branch ? branch.name : 'Unknown';
  }

  function getBlockTitle(block) {
    if (!block) {
      return 'Untitled block';
    }

    if (block.type === 'url') {
      return (block.content && block.content.title) || (block.source && block.source.title) || (block.content && block.content.url) || 'URL';
    }

    if (block.type === 'image') {
      return (block.content && block.content.text) || (block.source && block.source.title) || 'Image';
    }

    const text = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
    return text ? text.split('\n')[0].slice(0, 80) : 'Text block';
  }

  function getBlockSnippet(block) {
    if (!block) {
      return '';
    }

    if (block.type === 'url') {
      const title = (block.content && block.content.title) || '';
      const url = (block.content && block.content.url) || (block.source && block.source.url) || '';
      return title && url ? `${title}\n${url}` : title || url;
    }

    if (block.type === 'image') {
      const imageUrl = (block.content && block.content.imageUrl) || (block.source && block.source.imageUrl) || '';
      const note = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
      return note ? `${note}\n${imageUrl}` : imageUrl;
    }

    const text = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
    return text || '(empty)';
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown date';
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function blockToMarkdown(block) {
    if (!block) {
      return '';
    }

    if (block.type === 'image') {
      const imageUrl = (block.content && block.content.imageUrl) || (block.source && block.source.imageUrl) || '';
      const alt = (block.content && block.content.text) || (block.source && block.source.title) || 'image';
      const note = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
      const imageLine = `![${escapeMarkdownLabel(alt)}](${imageUrl})`;
      return note ? `${imageLine}\n\n${note}` : imageLine;
    }

    if (block.type === 'url') {
      const title = (block.content && block.content.title) || (block.source && block.source.title) || 'Link';
      const url = (block.content && block.content.url) || (block.source && block.source.url) || '';
      return `[${escapeMarkdownLabel(title)}](${url})`;
    }

    return (block.content && typeof block.content.text === 'string' ? block.content.text : '').trim();
  }

  function escapeMarkdownLabel(value) {
    return String(value || '')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function attachBlock(blockId) {
    if (!blockId) {
      return;
    }

    if (!state.attachedBlockIds.includes(blockId)) {
      state.attachedBlockIds = state.attachedBlockIds.concat(blockId);
      markDirty();
      renderCounts();
      renderAttachedBlocks();
      renderBlocks();
    }
  }

  function detachBlock(blockId) {
    const nextAttached = state.attachedBlockIds.filter((id) => id !== blockId);
    if (nextAttached.length === state.attachedBlockIds.length) {
      return;
    }

    state.attachedBlockIds = nextAttached;
    markDirty();
    renderCounts();
    renderAttachedBlocks();
    renderBlocks();
  }

  function toggleAttachedBlock(blockId) {
    if (state.attachedBlockIds.includes(blockId)) {
      detachBlock(blockId);
    } else {
      attachBlock(blockId);
    }
  }

  function insertSnippet(snippet) {
    if (!markdownTextarea || !snippet) {
      return;
    }

    const text = String(snippet).trim();
    if (!text) {
      return;
    }

    const value = markdownTextarea.value;
    const start = typeof markdownTextarea.selectionStart === 'number' ? markdownTextarea.selectionStart : value.length;
    const end = typeof markdownTextarea.selectionEnd === 'number' ? markdownTextarea.selectionEnd : value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before.length && !/\n\s*$/.test(before) ? '\n\n' : '';
    const insertText = `${prefix}${text}\n\n`;

    markdownTextarea.value = `${before}${insertText}${after}`;
    const cursor = before.length + insertText.length;
    markdownTextarea.selectionStart = cursor;
    markdownTextarea.selectionEnd = cursor;
    markdownTextarea.focus();
    markDirty();
  }

  function insertSelectedBlocks() {
    const attachedBlocks = getAttachedBlocks();
    if (!attachedBlocks.length) {
      return;
    }

    const snippets = attachedBlocks
      .map((block) => blockToMarkdown(block))
      .filter((snippet) => snippet && snippet.trim());

    if (!snippets.length) {
      return;
    }

    insertSnippet(snippets.join('\n\n'));
  }

  function markDirty() {
    state.isDirty = true;
    refreshStatus();
  }

  function refreshStatus() {
    if (!documentStatus) {
      return;
    }

    if (state.isDirty) {
      documentStatus.textContent = state.currentDocumentId ? 'Unsaved changes' : 'Draft edited';
      return;
    }

    if (state.currentDocumentId) {
      const current = state.documents.find((document) => document.id === state.currentDocumentId);
      documentStatus.textContent = current ? `Editing: ${current.title}` : 'Editing saved diary';
      return;
    }

    documentStatus.textContent = 'Draft ready';
  }

  function createNewDocument() {
    state.currentDocumentId = null;
    state.attachedBlockIds = [];
    state.isDirty = false;
    if (documentTitleInput) {
      documentTitleInput.value = '';
    }
    if (markdownTextarea) {
      markdownTextarea.value = '';
    }
    renderCounts();
    renderAttachedBlocks();
    renderBlocks();
    renderDocuments();
    refreshStatus();
  }

  async function saveCurrentDocument() {
    try {
      const title = documentTitleInput && documentTitleInput.value.trim()
        ? documentTitleInput.value.trim()
        : 'Untitled Diary';
      const markdown = markdownTextarea ? markdownTextarea.value : '';
      const payload = {
        id: state.currentDocumentId || undefined,
        title,
        blockIds: state.attachedBlockIds.slice(),
        markdown
      };

      let saved = state.currentDocumentId
        ? await SurfDiaryStore.updateDocument(state.currentDocumentId, payload)
        : await SurfDiaryStore.saveDocument(payload);

      if (!saved) {
        saved = await SurfDiaryStore.saveDocument(payload);
      }

      if (!saved) {
        return;
      }

      state.currentDocumentId = saved.id;
      state.isDirty = false;
      await loadState();
      refreshStatus();
    } catch (e) {
      console.error('Failed to save document', e);
    }
  }

  async function loadDocumentIntoEditor(documentId) {
    const document = state.documents.find((item) => item.id === documentId);
    if (!document) {
      return;
    }

    state.currentDocumentId = document.id;
    state.attachedBlockIds = Array.isArray(document.blockIds) ? document.blockIds.slice() : [];

    if (documentTitleInput) {
      documentTitleInput.value = document.title || '';
    }
    if (markdownTextarea) {
      markdownTextarea.value = document.markdown || '';
    }

    state.isDirty = false;
    renderCounts();
    renderBlocks();
    renderDocuments();
    renderAttachedBlocks();
    refreshStatus();
  }

  async function deleteDocument(documentId) {
    try {
      const confirmed = window.confirm('Delete this diary?');
      if (!confirmed) {
        return;
      }

      const removed = await SurfDiaryStore.deleteDocument(documentId);
      if (!removed) {
        return;
      }

      if (state.currentDocumentId === documentId) {
        createNewDocument();
      }

      await loadState();
    } catch (e) {
      console.error('Failed to delete document', e);
    }
  }

  function exportDocument(documentData) {
    const title = (documentData && documentData.title) || (documentTitleInput && documentTitleInput.value.trim()) || 'Untitled Diary';
    const markdown = documentData
      ? documentData.markdown || ''
      : (markdownTextarea ? markdownTextarea.value : '');
    const fileName = `${sanitizeFileName(title) || 'untitled-diary'}.md`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportCurrentDocument() {
    const current = state.documents.find((item) => item.id === state.currentDocumentId) || null;
    if (current && !state.isDirty) {
      exportDocument(current);
      return;
    }

    exportDocument({
      title: documentTitleInput && documentTitleInput.value.trim() ? documentTitleInput.value.trim() : 'Untitled Diary',
      markdown: markdownTextarea ? markdownTextarea.value : ''
    });
  }

  function sanitizeFileName(value) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  }
});
