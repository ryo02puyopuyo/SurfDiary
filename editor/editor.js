document.addEventListener('DOMContentLoaded', () => {
  const blockList = document.getElementById('memo-list');
  const documentList = document.getElementById('document-list');
  const blockCount = document.getElementById('block-count');
  const documentCount = document.getElementById('document-count');
  const documentTitleInput = document.getElementById('document-title-input');
  const todayTitleBtn = document.getElementById('today-title-btn');
  const documentStatus = document.getElementById('document-status');
  const attachedCount = document.getElementById('attached-count');
  const documentBody = document.getElementById('document-body');
  const markdownPreview = document.getElementById('markdown-preview');
  const editorBody = document.querySelector('.editor-body');
  const previewPanel = document.querySelector('.preview-panel');
  const editorSplitter = document.getElementById('editor-splitter');
  const togglePreviewBtn = document.getElementById('toggle-preview-btn');
  const newDocumentBtn = document.getElementById('new-document-btn');
  const saveDocumentBtn = document.getElementById('save-document-btn');
  const exportDocumentBtn = document.getElementById('export-document-btn');
  const exportHelpBtn = document.getElementById('export-help-btn');
  const exportHelpOverlay = document.getElementById('export-guidance-overlay');
  const exportHelpCloseBtn = document.getElementById('export-guidance-close-btn');
  const exportHelpConfirmBtn = document.getElementById('export-guidance-confirm-btn');
  const exportHelpDontShowAgain = document.getElementById('export-guidance-dont-show-again');
  const exportHelpActions = document.querySelector('.export-help-actions');
  const previewObjectUrls = [];
  const EXPORT_FILE_PICKER_ID = 'notefragments-document-export-file';
  const EXPORT_DIR_PICKER_ID = 'notefragments-document-export-dir';
  const ASSET_DIR_NAME = 'NFAssets';
  const SENSITIVE_EXPORT_DIRECTORY_NAMES = new Set(['desktop', 'downloads']);
  const LAYOUT_STORAGE_KEY = 'notefragments-editor-layout';
  const EXPORT_HELP_STORAGE_KEY = 'notefragments-export-help-hidden';
  const EDITOR_SPLITTER_WIDTH = 10;
  const EDITOR_SPLITTER_GAP = 16;
  const MIN_PANEL_RATIO = 30;
  const MAX_PANEL_RATIO = 75;
  const DEFAULT_PANEL_RATIO = 60;

  const state = {
    blocks: [],
    branches: [],
    documents: [],
    currentDocumentId: null,
    currentDocumentBlockIds: [],
    isDirty: false,
    draggingBlockId: null,
    layout: {
      previewCollapsed: false,
      splitRatio: DEFAULT_PANEL_RATIO
    }
  };

  loadLayoutState();
  applyLayoutState();
  loadExportHelpState();
  loadState();

  if (documentTitleInput) {
    documentTitleInput.addEventListener('input', markDirty);
  }

  if (todayTitleBtn && documentTitleInput) {
    todayTitleBtn.addEventListener('click', () => {
      documentTitleInput.value = formatTodayYyyyMmDd();
      markDirty();
      documentTitleInput.focus();
      documentTitleInput.setSelectionRange(documentTitleInput.value.length, documentTitleInput.value.length);
    });
  }

  if (documentBody) {
    documentBody.addEventListener('input', () => {
      markDirty();
      renderMarkdownPreview();
    });

    documentBody.addEventListener('dragover', (event) => {
      event.preventDefault();
      documentBody.classList.add('dragover');
    });

    documentBody.addEventListener('dragleave', () => {
      documentBody.classList.remove('dragover');
    });

    documentBody.addEventListener('drop', (event) => {
      event.preventDefault();
      documentBody.classList.remove('dragover');
      handleDocumentDrop(event);
    });
  }

  if (newDocumentBtn) {
    newDocumentBtn.addEventListener('click', createNewDocument);
  }

  if (saveDocumentBtn) {
    saveDocumentBtn.addEventListener('click', saveCurrentDocument);
  }

  if (exportDocumentBtn) {
    exportDocumentBtn.addEventListener('click', () => {
      if (shouldShowExportHelp()) {
        openExportHelp({ showActions: true });
        return;
      }

      exportCurrentDocument().catch((error) => {
        console.error('Failed to export current document', error);
      });
    });
  }

  if (exportHelpBtn) {
    exportHelpBtn.addEventListener('click', () => {
      openExportHelp({ showActions: false });
    });
  }

  if (exportHelpCloseBtn) {
    exportHelpCloseBtn.addEventListener('click', () => {
      closeExportHelp();
    });
  }

  if (exportHelpConfirmBtn) {
    exportHelpConfirmBtn.addEventListener('click', () => {
      if (exportHelpDontShowAgain && exportHelpDontShowAgain.checked) {
        setExportHelpSuppressed(true);
      }

      closeExportHelp();
      exportCurrentDocument().catch((error) => {
        console.error('Failed to export current document', error);
      });
    });
  }

  if (exportHelpDontShowAgain) {
    exportHelpDontShowAgain.addEventListener('change', () => {
      setExportHelpSuppressed(exportHelpDontShowAgain.checked);
    });
  }

  if (exportHelpOverlay) {
    exportHelpOverlay.addEventListener('click', (event) => {
      if (event.target === exportHelpOverlay) {
        closeExportHelp();
      }
    });
  }

  if (togglePreviewBtn) {
    togglePreviewBtn.addEventListener('click', () => {
      togglePreviewCollapsed();
    });
  }

  if (editorSplitter) {
    editorSplitter.addEventListener('pointerdown', beginSplitDrag);
    editorSplitter.addEventListener('keydown', handleSplitterKeydown);
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && exportHelpOverlay && !exportHelpOverlay.hidden) {
      closeExportHelp();
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.noteFragmentsState) {
      loadState();
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'notefragments-state-changed') {
      loadState();
    }
  });

  async function loadState() {
    try {
      const [blocks, branches, documents] = await Promise.all([
        NoteFragmentsStore.loadBlocks(),
        NoteFragmentsStore.loadBranches(),
        NoteFragmentsStore.loadDocuments()
      ]);

      state.blocks = blocks;
      state.branches = sortBranches(branches);
      state.documents = sortDocuments(documents);

      renderCounts();
      renderBlockList();
      renderDocumentList();

      if (state.currentDocumentId) {
        const currentExists = state.documents.some((item) => item.id === state.currentDocumentId);
        if (!currentExists) {
          createNewDocument();
          return;
        }
      }

      syncEditorState();
      refreshStatus();
    } catch (error) {
      console.error('Failed to load editor state', error);
    }
  }

  function sortBranches(branches) {
    const list = Array.isArray(branches) ? branches.slice() : [];
    return list.sort((a, b) => {
      if (a.id === NoteFragmentsStore.DEFAULT_BRANCH_ID) return -1;
      if (b.id === NoteFragmentsStore.DEFAULT_BRANCH_ID) return 1;
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

  function loadLayoutState() {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) {
        state.layout.previewCollapsed = false;
        state.layout.splitRatio = DEFAULT_PANEL_RATIO;
        return;
      }

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.layout.previewCollapsed = false;

        if (typeof parsed.splitRatio === 'number' && Number.isFinite(parsed.splitRatio)) {
          state.layout.splitRatio = clampPanelRatio(parsed.splitRatio);
        }
      }
    } catch (error) {
      console.warn('Failed to load editor layout preferences', error);
    }
  }

  function saveLayoutState() {
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
        splitRatio: state.layout.splitRatio
      }));
    } catch (error) {
      console.warn('Failed to save editor layout preferences', error);
    }
  }

  function loadExportHelpState() {
    if (!exportHelpDontShowAgain) {
      return;
    }

    try {
      exportHelpDontShowAgain.checked = window.localStorage.getItem(EXPORT_HELP_STORAGE_KEY) === 'true';
    } catch (error) {
      console.warn('Failed to load export help preferences', error);
    }
  }

  function setExportHelpSuppressed(hidden) {
    try {
      window.localStorage.setItem(EXPORT_HELP_STORAGE_KEY, hidden ? 'true' : 'false');
    } catch (error) {
      console.warn('Failed to save export help preferences', error);
    }
  }

  function shouldShowExportHelp() {
    try {
      return window.localStorage.getItem(EXPORT_HELP_STORAGE_KEY) !== 'true';
    } catch (error) {
      console.warn('Failed to read export help preferences', error);
      return true;
    }
  }

  function applyLayoutState() {
    if (!editorBody) {
      return;
    }

    editorBody.classList.toggle('preview-collapsed', state.layout.previewCollapsed);
    if (previewPanel) {
      previewPanel.hidden = state.layout.previewCollapsed;
    }
    if (editorSplitter) {
      editorSplitter.hidden = state.layout.previewCollapsed;
    }

    if (!state.layout.previewCollapsed) {
      editorBody.style.setProperty('--draft-panel-size', `${state.layout.splitRatio}fr`);
      editorBody.style.setProperty('--preview-panel-size', `${100 - state.layout.splitRatio}fr`);
    }

    if (togglePreviewBtn) {
      togglePreviewBtn.textContent = state.layout.previewCollapsed ? '▸' : '◂';
      togglePreviewBtn.setAttribute('aria-pressed', String(!state.layout.previewCollapsed));
      togglePreviewBtn.setAttribute('aria-label', state.layout.previewCollapsed ? 'Expand preview' : 'Collapse preview');
      togglePreviewBtn.title = state.layout.previewCollapsed ? 'Expand preview' : 'Collapse preview';
    }

    if (editorSplitter) {
      editorSplitter.setAttribute('aria-hidden', String(state.layout.previewCollapsed));
    }
  }

  function setPreviewCollapsed(collapsed) {
    state.layout.previewCollapsed = Boolean(collapsed);
    applyLayoutState();
    saveLayoutState();
  }

  function togglePreviewCollapsed() {
    setPreviewCollapsed(!state.layout.previewCollapsed);
  }

  function clampPanelRatio(value) {
    return Math.min(MAX_PANEL_RATIO, Math.max(MIN_PANEL_RATIO, Math.round(value)));
  }

  function setPanelRatio(value, persist = true) {
    state.layout.splitRatio = clampPanelRatio(value);
    if (!state.layout.previewCollapsed) {
      applyLayoutState();
    }
    if (persist) {
      saveLayoutState();
    }
  }

  function getSplitMetrics() {
    if (!editorBody) {
      return null;
    }

    const rect = editorBody.getBoundingClientRect();
    const availableWidth = rect.width - EDITOR_SPLITTER_WIDTH - (EDITOR_SPLITTER_GAP * 2);
    if (availableWidth <= 0) {
      return null;
    }

    return {
      rect,
      availableWidth
    };
  }

  function beginSplitDrag(event) {
    if (!editorSplitter || state.layout.previewCollapsed) {
      return;
    }

    event.preventDefault();
    editorSplitter.setPointerCapture(event.pointerId);

    const metrics = getSplitMetrics();
    if (!metrics) {
      try {
        editorSplitter.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore release errors if capture was not established.
      }
      return;
    }

    const dragState = {
      pointerId: event.pointerId,
      rectLeft: metrics.rect.left,
      availableWidth: metrics.availableWidth
    };

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== dragState.pointerId) {
        return;
      }

      const relativeX = moveEvent.clientX - dragState.rectLeft;
      const ratio = (relativeX / dragState.availableWidth) * 100;
      setPanelRatio(ratio, true);
    };

    const onPointerUp = (upEvent) => {
      if (upEvent.pointerId !== dragState.pointerId) {
        return;
      }

      editorSplitter.removeEventListener('pointermove', onPointerMove);
      editorSplitter.removeEventListener('pointerup', onPointerUp);
      editorSplitter.removeEventListener('pointercancel', onPointerUp);
      try {
        editorSplitter.releasePointerCapture(dragState.pointerId);
      } catch (error) {
        // Ignore release errors if the pointer is already gone.
      }
    };

    editorSplitter.addEventListener('pointermove', onPointerMove);
    editorSplitter.addEventListener('pointerup', onPointerUp);
    editorSplitter.addEventListener('pointercancel', onPointerUp);
  }

  function handleSplitterKeydown(event) {
    if (state.layout.previewCollapsed) {
      return;
    }

    let nextRatio = state.layout.splitRatio;
    if (event.key === 'ArrowLeft') {
      nextRatio -= 5;
    } else if (event.key === 'ArrowRight') {
      nextRatio += 5;
    } else if (event.key === 'Home') {
      nextRatio = MIN_PANEL_RATIO;
    } else if (event.key === 'End') {
      nextRatio = MAX_PANEL_RATIO;
    } else {
      return;
    }

    event.preventDefault();
    setPanelRatio(nextRatio, true);
  }

  function renderCounts() {
    if (blockCount) {
      blockCount.textContent = String(state.blocks.length);
    }
    if (documentCount) {
      documentCount.textContent = String(state.documents.length);
    }
    if (attachedCount) {
      attachedCount.textContent = `${state.currentDocumentBlockIds.length} fragment${state.currentDocumentBlockIds.length === 1 ? '' : 's'} placed`;
    }
  }

  function renderBlockList() {
    if (!blockList) {
      return;
    }

    blockList.innerHTML = '';

    if (!state.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'memo-empty';
      empty.textContent = 'No saved fragments yet. Use the sidebar to save notes, URLs, or images.';
      blockList.appendChild(empty);
      return;
    }

    state.blocks.forEach((block) => {
      blockList.appendChild(createBlockCard(block));
    });
  }

  function createBlockCard(block) {
    const el = document.createElement('article');
    el.className = 'memo-item';
    el.draggable = true;
    el.dataset.blockId = block.id;

    if (state.currentDocumentBlockIds.includes(block.id)) {
      el.classList.add('attached');
    }

    el.addEventListener('dragstart', (event) => {
      state.draggingBlockId = block.id;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', block.id);
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
      state.draggingBlockId = null;
      renderBlockList();
    });

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
      img.alt = getBlockTitle(block);
      img.loading = 'lazy';
      img.decoding = 'async';
      resolveImageSource(block).then((src) => {
        if (src) {
          img.src = src;
        }
      }).catch((error) => {
        console.error('Failed to resolve editor image source', error);
      });
      wrap.appendChild(img);
      body.appendChild(wrap);
    }

    const snippet = document.createElement('p');
    snippet.className = 'memo-snippet';
    snippet.textContent = getBlockSnippet(block);
    body.appendChild(snippet);

    const meta = document.createElement('div');
    meta.className = 'memo-meta';

    const leftMeta = document.createElement('div');
    leftMeta.className = 'memo-meta-left';

    const time = document.createElement('span');
    time.textContent = formatDate(block.createdAt);
    leftMeta.appendChild(time);
    meta.appendChild(leftMeta);

    const actions = document.createElement('div');
    actions.className = 'memo-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'memo-action-btn primary';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      insertBlockIntoDocument(block.id, getTextInsertionPoint());
    });

    actions.appendChild(addBtn);
    meta.appendChild(actions);
    body.appendChild(meta);
    el.appendChild(body);

    return el;
  }

  function renderDocumentList() {
    if (!documentList) {
      return;
    }

    documentList.innerHTML = '';

    if (!state.documents.length) {
      const empty = document.createElement('div');
      empty.className = 'document-empty';
      empty.textContent = 'No documents yet. Create a new document and type directly into it.';
      documentList.appendChild(empty);
      return;
    }

    state.documents.forEach((savedDocument) => {
      documentList.appendChild(createDocumentCard(savedDocument));
    });
  }

  function createDocumentCard(savedDocument) {
    const el = document.createElement('article');
    el.className = 'memo-item document-item';
    if (savedDocument.id === state.currentDocumentId) {
      el.classList.add('is-active');
    }

    const head = document.createElement('div');
    head.className = 'memo-head';

    const titleWrap = document.createElement('div');

    const title = document.createElement('h3');
    title.className = 'memo-title';
    title.textContent = savedDocument.title || 'Untitled Document';
    titleWrap.appendChild(title);

    const excerptMeta = document.createElement('p');
    excerptMeta.className = 'document-meta';
    excerptMeta.textContent = `${Array.isArray(savedDocument.blockIds) ? savedDocument.blockIds.length : 0} placed fragments`;
    titleWrap.appendChild(excerptMeta);

    head.appendChild(titleWrap);

    const stateBadge = document.createElement('div');
    stateBadge.className = 'branch-badge';
    stateBadge.textContent = savedDocument.id === state.currentDocumentId ? 'Editing' : 'Saved';
    head.appendChild(stateBadge);
    el.appendChild(head);

    const excerpt = document.createElement('p');
    excerpt.className = 'memo-snippet';
    excerpt.textContent = getDocumentExcerpt(savedDocument);

    const body = document.createElement('div');
    body.className = 'memo-body';
    body.appendChild(excerpt);

    const details = document.createElement('p');
    details.className = 'document-meta';
    details.textContent = `Updated ${formatDate(savedDocument.updatedAt || savedDocument.createdAt)}`;
    body.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'memo-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'memo-action-btn primary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => {
      await openDocumentForEditing(savedDocument.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'memo-action-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      deleteDocument(savedDocument.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    const meta = document.createElement('div');
    meta.className = 'memo-meta';

    const leftMeta = document.createElement('div');
    leftMeta.className = 'memo-meta-left';
    meta.appendChild(leftMeta);
    meta.appendChild(actions);

    body.appendChild(meta);
    el.appendChild(body);
    return el;
  }

  function getDocumentExcerpt(savedDocument) {
    const text = String(savedDocument && savedDocument.markdown ? savedDocument.markdown : '')
      .replace(/\r/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image]')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^#+\s*/gm, '')
      .trim();

    if (!text) {
      return 'No content yet.';
    }

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);

    return lines.join('\n');
  }

  function syncEditorState() {
    if (documentTitleInput) {
      const current = state.documents.find((doc) => doc.id === state.currentDocumentId);
      documentTitleInput.value = current ? current.title || '' : '';
    }
    if (documentBody) {
      const current = state.documents.find((doc) => doc.id === state.currentDocumentId);
      documentBody.value = current ? current.markdown || '' : '';
    }
    renderMarkdownPreview();
    renderCounts();
  }

  function renderMarkdownPreview() {
    if (!markdownPreview) {
      return;
    }

    markdownPreview.textContent = documentBody && documentBody.value.trim()
      ? documentBody.value
      : 'Markdown preview will appear here.';
  }

  function markDirty() {
    state.isDirty = true;
    refreshStatus();
  }

  function formatTodayYyyyMmDd() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
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
      documentStatus.textContent = current ? `Editing: ${current.title}` : 'Editing saved document';
      return;
    }

    documentStatus.textContent = 'Draft ready';
  }

  function createNewDocument() {
    state.currentDocumentId = null;
    state.currentDocumentBlockIds = [];
    state.isDirty = false;

    if (documentTitleInput) {
      documentTitleInput.value = '';
    }
    if (documentBody) {
      documentBody.value = '';
    }

    renderCounts();
    renderBlockList();
    renderMarkdownPreview();
    refreshStatus();
  }

  async function openDocumentForEditing(documentId) {
    if (!documentId) {
      return;
    }

    if (documentId === state.currentDocumentId && !state.isDirty) {
      return;
    }

    const shouldContinue = confirmDiscardUnsavedChanges();
    if (!shouldContinue) {
      return;
    }

    await loadDocumentIntoEditor(documentId);
  }

  function confirmDiscardUnsavedChanges() {
    if (!state.isDirty) {
      return true;
    }

    return window.confirm('現在のドキュメントは未保存です。保存せずに別のドキュメントを開きますか?');
  }

  function insertBlockIntoDocument(blockId, cursorIndex) {
    if (!blockId || !documentBody) {
      return;
    }

    const block = getBlockById(blockId);
    if (!block) {
      return;
    }

    const snippet = blockToMarkdown(block).trim();
    if (!snippet) {
      return;
    }

    const value = documentBody.value;
    const selectionStart = typeof cursorIndex === 'number'
      ? cursorIndex
      : (typeof documentBody.selectionStart === 'number' ? documentBody.selectionStart : value.length);
    const selectionEnd = typeof documentBody.selectionEnd === 'number' ? documentBody.selectionEnd : selectionStart;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const needsPrefix = before.length > 0 && !/\n\s*$/.test(before);
    const insertText = `${needsPrefix ? '\n\n' : ''}${snippet}\n\n`;

    documentBody.value = `${before}${insertText}${after}`;
    const cursor = before.length + insertText.length;
    documentBody.selectionStart = cursor;
    documentBody.selectionEnd = cursor;
    state.currentDocumentBlockIds = pushUnique(state.currentDocumentBlockIds, blockId);
    markDirty();
    renderCounts();
    renderBlockList();
    renderMarkdownPreview();
    documentBody.focus();
  }

  function pushUnique(list, value) {
    const next = Array.isArray(list) ? list.slice() : [];
    if (!next.includes(value)) {
      next.push(value);
    }
    return next;
  }

  function getTextInsertionPoint() {
    if (documentBody && typeof documentBody.selectionStart === 'number') {
      return documentBody.selectionStart;
    }
    return documentBody ? documentBody.value.length : 0;
  }

  function getDragBlockId(event) {
    return event.dataTransfer.getData('text/plain') || state.draggingBlockId || '';
  }

  function getDroppedText(event) {
    if (!event || !event.dataTransfer) {
      return '';
    }

    return event.dataTransfer.getData('text/plain')
      || event.dataTransfer.getData('text/uri-list')
      || '';
  }

  function isImageFile(file) {
    return Boolean(file && typeof file.type === 'string' && file.type.startsWith('image/'));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async function createImageBlockFromUrl(imageUrl, label) {
    if (!imageUrl) {
      return null;
    }

    const storedImageUrl = isDataImageUrl(imageUrl)
      ? await resizeDataImageUrl(imageUrl)
      : imageUrl;

    const block = await NoteFragmentsStore.saveBlock({
      type: 'image',
      branchId: NoteFragmentsStore.DEFAULT_BRANCH_ID,
      content: {
        imageUrl: storedImageUrl,
        previewImageUrl: storedImageUrl,
        originalImageUrl: imageUrl,
        text: label || 'Image'
      },
      source: {
        imageUrl: storedImageUrl,
        previewImageUrl: storedImageUrl,
        originalImageUrl: imageUrl,
        title: label || 'Image'
      }
    });

    state.blocks = [block].concat(state.blocks);
    renderCounts();
    renderBlockList();
    return block;
  }

  async function handleDocumentDrop(event) {
    const blockId = getDragBlockId(event);
    const existingBlock = getBlockById(blockId);
    if (existingBlock) {
      insertBlockIntoDocument(existingBlock.id, documentBody.selectionStart ?? documentBody.value.length);
      return;
    }

    const droppedText = getDroppedText(event).trim();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];

    if (isImageFile(file)) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const label = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Image';
        const created = await createImageBlockFromUrl(dataUrl, label);
        if (created) {
          insertBlockIntoDocument(created.id, documentBody.selectionStart ?? documentBody.value.length);
        }
      } catch (error) {
        console.error('Failed to import dropped image file', error);
      }
      return;
    }

    if (droppedText && /^data:image\//i.test(droppedText)) {
      try {
        const created = await createImageBlockFromUrl(droppedText, 'Dropped image');
        if (created) {
          insertBlockIntoDocument(created.id, documentBody.selectionStart ?? documentBody.value.length);
        }
      } catch (error) {
        console.error('Failed to import dropped image data', error);
      }
      return;
    }

    if (droppedText && /^https?:\/\//i.test(droppedText)) {
      try {
        const created = await createImageBlockFromUrl(droppedText, 'Dropped image');
        if (created) {
          insertBlockIntoDocument(created.id, documentBody.selectionStart ?? documentBody.value.length);
        }
      } catch (error) {
        console.error('Failed to import dropped image URL', error);
      }
    }
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
      return 'Untitled fragment';
    }

    if (block.type === 'url') {
      return (block.content && block.content.title) || (block.source && block.source.title) || (block.content && block.content.url) || 'URL';
    }

    if (block.type === 'image') {
      return (block.content && block.content.text) || (block.source && block.source.title) || 'Image';
    }

    const text = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
    return text ? text.split('\n')[0].slice(0, 80) : 'Text fragment';
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
      const note = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
      const title = (block.content && block.content.text) || (block.source && block.source.title) || 'Image';
      return note ? `Image: ${title}\n${note}` : `Image: ${title}`;
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
      const imageUrl = (block.content && block.content.originalImageUrl)
        || (block.source && block.source.originalImageUrl)
        || (block.content && block.content.imageUrl)
        || (block.source && block.source.imageUrl)
        || '';
      const alt = (block.content && block.content.text) || (block.source && block.source.title) || 'image';
      const note = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
      if (shouldInlineImageUrl(imageUrl)) {
        const imageLine = `![${escapeMarkdownLabel(alt)}](${imageUrl})`;
        return note ? `${imageLine}\n\n${note}` : imageLine;
      }

      return note ? `Image: ${escapeMarkdownLabel(alt)}\n\n${note}` : `Image: ${escapeMarkdownLabel(alt)}`;
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

  function isDataImageUrl(value) {
    return typeof value === 'string' && /^data:image\//i.test(value);
  }

  function resolveImageSource(block) {
    const imageUrl = block && block.content && typeof block.content.imageUrl === 'string'
      ? block.content.imageUrl
      : (block && block.source && typeof block.source.imageUrl === 'string' ? block.source.imageUrl : '');

    if (!imageUrl) {
      return Promise.resolve('');
    }

    if (!/^data:image\//i.test(imageUrl)) {
      return Promise.resolve(imageUrl);
    }

    return fetch(imageUrl)
      .then((response) => response.blob())
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => imageUrl);
  }

  function shouldInlineImageUrl(value) {
    return typeof value === 'string' && (!isDataImageUrl(value) || value.length <= 18000);
  }

  function resizeDataImageUrl(imageUrl, maxSize = 320, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(imageUrl);
            return;
          }

          const scale = Math.min(1, maxSize / Math.max(width, height));
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext('2d');

          if (!context) {
            resolve(imageUrl);
            return;
          }

          context.drawImage(img, 0, 0, targetWidth, targetHeight);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = imageUrl;
    });
  }

  function markdownForCurrentDocument() {
    return documentBody ? documentBody.value : '';
  }

  function saveBlockPlacementState() {
    state.currentDocumentBlockIds = state.currentDocumentBlockIds.filter((id) => getBlockById(id));
  }

  function renderMarkdownPreview() {
    if (!markdownPreview) {
      return;
    }

    clearPreviewObjectUrls();
    markdownPreview.innerHTML = '';

    const markdown = markdownForCurrentDocument().trim();
    if (!markdown) {
      markdownPreview.textContent = 'Markdown preview will appear here.';
      return;
    }

    const sections = splitMarkdownSections(markdown);
    sections.forEach((section) => {
      renderMarkdownSection(section, markdownPreview);
    });
  }

  function clearPreviewObjectUrls() {
    while (previewObjectUrls.length > 0) {
      const url = previewObjectUrls.pop();
      URL.revokeObjectURL(url);
    }
  }

  function splitMarkdownSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let buffer = [];
    let inFence = false;

    lines.forEach((line) => {
      if (/^```/.test(line.trim())) {
        if (inFence) {
          buffer.push(line);
          sections.push({ type: 'code', text: buffer.join('\n') });
          buffer = [];
          inFence = false;
        } else {
          if (buffer.length > 0) {
            sections.push({ type: 'text', text: buffer.join('\n') });
            buffer = [];
          }
          buffer.push(line);
          inFence = true;
        }
        return;
      }

      if (!inFence && line.trim() === '') {
        if (buffer.length > 0) {
          sections.push({ type: 'text', text: buffer.join('\n') });
          buffer = [];
        }
        return;
      }

      buffer.push(line);
    });

    if (buffer.length > 0) {
      sections.push({ type: inFence ? 'code' : 'text', text: buffer.join('\n') });
    }

    return sections;
  }

  function renderMarkdownSection(section, container) {
    if (!section || !section.text) {
      return;
    }

    if (section.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = section.text.replace(/^```[^\n]*\n?/, '').replace(/\n```$/, '');
      pre.appendChild(code);
      container.appendChild(pre);
      return;
    }

    const trimmed = section.text.trim();
    if (!trimmed) {
      return;
    }

    const lines = trimmed.split(/\r?\n/);
    const headingMatch = lines.length === 1 ? /^(#{1,6})\s+(.+)$/.exec(lines[0].trim()) : null;
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const heading = document.createElement(`h${level}`);
      appendInlineMarkdown(heading, headingMatch[2]);
      container.appendChild(heading);
      return;
    }

    if (lines.every((line) => /^>\s?/.test(line.trim()))) {
      const blockquote = document.createElement('blockquote');
      lines.forEach((line, index) => {
        appendInlineMarkdown(blockquote, line.replace(/^>\s?/, ''));
        if (index < lines.length - 1) {
          blockquote.appendChild(document.createElement('br'));
        }
      });
      container.appendChild(blockquote);
      return;
    }

    const listMatch = lines.every((line) => /^(\-|\*|\+)\s+/.test(line.trim()));
    if (listMatch) {
      const ul = document.createElement('ul');
      lines.forEach((line) => {
        const li = document.createElement('li');
        appendInlineMarkdown(li, line.replace(/^(\-|\*|\+)\s+/, ''));
        ul.appendChild(li);
      });
      container.appendChild(ul);
      return;
    }

    const paragraph = document.createElement('p');
    lines.forEach((line, index) => {
      appendInlineMarkdown(paragraph, line);
      if (index < lines.length - 1) {
        paragraph.appendChild(document.createElement('br'));
      }
    });
    container.appendChild(paragraph);
  }

  function appendInlineMarkdown(parent, text) {
    if (!text) {
      return;
    }

    const pattern = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const token = match[0];
      const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);

      if (imageMatch) {
        const img = document.createElement('img');
        img.alt = imageMatch[1] || 'image';
        img.loading = 'lazy';
        img.decoding = 'async';
        resolvePreviewImageSource(imageMatch[2]).then((src) => {
          if (src) {
            img.src = src;
          }
        }).catch((error) => {
          console.error('Failed to render preview image', error);
        });
        parent.appendChild(img);
      } else if (linkMatch) {
        const a = document.createElement('a');
        a.href = linkMatch[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkMatch[1];
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(token));
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function resolvePreviewImageSource(imageUrl) {
    if (!imageUrl) {
      return Promise.resolve('');
    }

    if (!/^data:image\//i.test(imageUrl)) {
      return Promise.resolve(imageUrl);
    }

    return fetch(imageUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        previewObjectUrls.push(url);
        return url;
      })
      .catch(() => imageUrl);
  }

  async function saveCurrentDocument() {
    try {
      saveBlockPlacementState();
      const title = documentTitleInput && documentTitleInput.value.trim()
        ? documentTitleInput.value.trim()
        : 'Untitled Document';
      const markdown = markdownForCurrentDocument();
      const payload = {
        id: state.currentDocumentId || undefined,
        title,
        blockIds: state.currentDocumentBlockIds.slice(),
        markdown
      };

      let saved = state.currentDocumentId
        ? await NoteFragmentsStore.updateDocument(state.currentDocumentId, payload)
        : await NoteFragmentsStore.saveDocument(payload);

      if (!saved) {
        saved = await NoteFragmentsStore.saveDocument(payload);
      }

      if (!saved) {
        return;
      }

      state.currentDocumentId = saved.id;
      state.isDirty = false;
      await loadState();
      refreshStatus();
    } catch (error) {
      console.error('Failed to save document', error);
    }
  }

  async function loadDocumentIntoEditor(documentId) {
    const document = state.documents.find((item) => item.id === documentId);
    if (!document) {
      return;
    }

    state.currentDocumentId = document.id;
    state.currentDocumentBlockIds = Array.isArray(document.blockIds) ? document.blockIds.slice() : [];

    if (documentTitleInput) {
      documentTitleInput.value = document.title || '';
    }
    if (documentBody) {
      documentBody.value = document.markdown || '';
    }

    state.isDirty = false;
    renderBlockList();
    renderMarkdownPreview();
    renderCounts();
    renderDocumentList();
    refreshStatus();
  }

  async function deleteDocument(documentId) {
    try {
      const confirmed = window.confirm('Delete this document?');
      if (!confirmed) {
        return;
      }

      const removed = await NoteFragmentsStore.deleteDocument(documentId);
      if (!removed) {
        return;
      }

      if (state.currentDocumentId === documentId) {
        createNewDocument();
      }

      await loadState();
    } catch (error) {
      console.error('Failed to delete document', error);
    }
  }

  async function exportDocument(documentData) {
    const title = (documentData && documentData.title) || (documentTitleInput && documentTitleInput.value.trim()) || 'Untitled Document';
    const markdown = documentData
      ? documentData.markdown || ''
      : markdownForCurrentDocument();
    const exportBlocks = getDocumentExportBlocks(documentData);
    const fileName = `${sanitizeFileName(title) || 'untitled-document'}.md`;

    // Always use a folder-based export so the same save flow works with or without images.
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const directoryHandle = await window.showDirectoryPicker({
          id: EXPORT_DIR_PICKER_ID,
          mode: 'readwrite'
        });

        if (shouldWarnAboutSensitiveExportDirectory(directoryHandle)) {
          showSensitiveExportDirectoryWarning(directoryHandle);
          return;
        }

        const exportResult = await exportMarkdownWithAssets(markdown, directoryHandle, exportBlocks);
        const finalMarkdown = exportResult && typeof exportResult.markdown === 'string'
          ? exportResult.markdown
          : markdown;
        const uniqueFileName = await ensureUniqueDirectoryFileName(directoryHandle, fileName);

        // Always write the markdown file, even if asset export partially fails.
        await writeTextFile(directoryHandle, uniqueFileName, finalMarkdown);
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          if (isSensitiveExportDirectoryError(error)) {
            showSensitiveExportDirectoryWarning(null, error);
          }
          return;
        }

        if (isSensitiveExportDirectoryError(error)) {
          showSensitiveExportDirectoryWarning(null, error);
          return;
        }

        console.error('showDirectoryPicker export failed, falling back to file save', error);
      }
    }

    // Plain markdown can be saved directly as a file, which works better on Desktop.
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          id: EXPORT_FILE_PICKER_ID,
          suggestedName: fileName,
          types: [{
            description: 'Markdown',
            accept: { 'text/markdown': ['.md', '.markdown'] }
          }]
        });

        const writable = await handle.createWritable();
        await writable.write(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
        await writable.close();
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return;
        }

        console.error('showSaveFilePicker export failed, falling back to download', error);
      }
    }

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

  async function exportMarkdownWithAssets(markdown, directoryHandle, sourceBlocks = []) {
    const assetMap = new Map();
    const imageSources = collectExportImageSources(markdown, sourceBlocks);

    if (imageSources.length === 0) {
      return { markdown, assetMap };
    }

    try {
      const assetDirectory = await directoryHandle.getDirectoryHandle(ASSET_DIR_NAME, { create: true });

      for (const imageSource of imageSources) {
        const exported = await exportMarkdownImageAsset(imageSource.sourceUrl, assetDirectory, imageSource);
        if (exported) {
          for (const aliasUrl of imageSource.aliasUrls) {
            assetMap.set(aliasUrl, `${ASSET_DIR_NAME}/${exported.fileName}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to prepare asset directory, saving markdown without asset rewrites', error);
      return { markdown, assetMap };
    }

    return {
      markdown: rewriteMarkdownImageUrls(markdown, assetMap),
      assetMap
    };
  }

  async function ensureUniqueDirectoryFileName(directoryHandle, desiredFileName) {
    const normalizedName = sanitizeFileName(desiredFileName).trim();
    if (!normalizedName) {
      return 'untitled-document.md';
    }

    const { baseName, extension } = splitFileName(normalizedName);
    let candidate = normalizedName;
    let counter = 1;

    while (await directoryEntryExists(directoryHandle, candidate)) {
      candidate = `${baseName} (${counter})${extension}`;
      counter += 1;
    }

    return candidate;
  }

  function shouldWarnAboutSensitiveExportDirectory(directoryHandle) {
    const directoryName = normalizeDirectoryHandleName(directoryHandle);
    return directoryName ? SENSITIVE_EXPORT_DIRECTORY_NAMES.has(directoryName) : false;
  }

  function showSensitiveExportDirectoryWarning(directoryHandle, error = null) {
    const directoryName = normalizeDirectoryHandleName(directoryHandle) || 'Desktop/Downloads';
    const message = [
      `${directoryName} 直下は、ブラウザの制限で保存に失敗しやすいです。`,
      error && error.message ? `理由: ${error.message}` : '',
      '',
      '回避方法:',
      '・Desktop / Downloads の中に新しい通常フォルダを作る',
      '・そのサブフォルダを選んで保存する',
      '・例: Desktop\\NoteFragments や Downloads\\Notes',
      '',
      'NFAssets も、そのサブフォルダの中に作成されます。'
    ].filter(Boolean).join('\n');

    if (typeof window.alert === 'function') {
      window.alert(message);
    } else {
      console.warn(message);
    }
  }

  function isSensitiveExportDirectoryError(error) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const name = String(error.name || '').toLowerCase();
    const message = String(error.message || '').toLowerCase();
    if (name !== 'aborterror') {
      return false;
    }

    return (
      message.includes('system files')
      || message.includes('sensitive')
      || message.includes('dangerous')
      || message.includes('desktop')
      || message.includes('downloads')
    );
  }

  function normalizeDirectoryHandleName(directoryHandle) {
    const name = directoryHandle && typeof directoryHandle.name === 'string'
      ? directoryHandle.name.trim().toLowerCase()
      : '';

    if (name === 'desktop' || name === 'downloads') {
      return name;
    }

    return '';
  }

  function setExportHelpActionVisibility(showActions) {
    if (exportHelpConfirmBtn) {
      exportHelpConfirmBtn.hidden = !showActions;
    }

    if (exportHelpDontShowAgain) {
      exportHelpDontShowAgain.closest('.export-help-checkbox')?.toggleAttribute('hidden', !showActions);
    }

    if (exportHelpActions) {
      exportHelpActions.hidden = !showActions;
    }

    if (exportHelpOverlay) {
      exportHelpOverlay.dataset.showActions = showActions ? 'true' : 'false';
    }
  }

  function openExportHelp(options = {}) {
    if (!exportHelpOverlay) {
      return;
    }

    const showActions = options.showActions !== false;
    setExportHelpActionVisibility(showActions);
    exportHelpOverlay.hidden = false;
    if (showActions && exportHelpDontShowAgain) {
      loadExportHelpState();
    }

    const focusTarget = showActions && exportHelpConfirmBtn ? exportHelpConfirmBtn : exportHelpCloseBtn;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      window.setTimeout(() => focusTarget.focus(), 0);
    }
  }

  function closeExportHelp() {
    if (!exportHelpOverlay) {
      return;
    }

    exportHelpOverlay.hidden = true;
    if (exportHelpBtn && typeof exportHelpBtn.focus === 'function') {
      exportHelpBtn.focus();
    }
  }

  async function directoryEntryExists(directoryHandle, fileName) {
    try {
      await directoryHandle.getFileHandle(fileName, { create: false });
      return true;
    } catch (error) {
      return false;
    }
  }

  function collectExportImageSources(markdown, sourceBlocks = []) {
    const sources = [];
    const seen = new Set();
    const blockList = Array.isArray(sourceBlocks) ? sourceBlocks : [];

    blockList.forEach((block) => {
      if (!block || block.type !== 'image') {
        return;
      }

      const sourceUrl = getExportImageSourceUrl(block);
      if (!sourceUrl || seen.has(sourceUrl)) {
        return;
      }

      seen.add(sourceUrl);
      sources.push({
        block,
        sourceUrl,
        aliasUrls: getExportImageAliasUrls(block)
      });
    });

    const markdownUrls = extractMarkdownImageUrls(markdown);
    markdownUrls.forEach((sourceUrl) => {
      if (!sourceUrl || seen.has(sourceUrl)) {
        return;
      }

      seen.add(sourceUrl);
      sources.push({
        block: null,
        sourceUrl,
        aliasUrls: [sourceUrl]
      });
    });

    return sources;
  }

  function extractMarkdownImageUrls(markdown) {
    const result = [];
    const seen = new Set();
    const pattern = /!\[[^\]]*\]\(([^)]+)\)/g;
    let match;

    while ((match = pattern.exec(markdown)) !== null) {
      const url = normalizeMarkdownImageUrl(match[1]);
      if (!url || isLocalMarkdownImageUrl(url) || seen.has(url)) {
        continue;
      }

      seen.add(url);
      result.push(url);
    }

    return result;
  }

  function rewriteMarkdownImageUrls(markdown, assetMap) {
    return markdown.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (fullMatch, prefix, rawUrl, suffix) => {
      const url = normalizeMarkdownImageUrl(rawUrl);
      const replacement = assetMap.get(url);
      if (!replacement) {
        return fullMatch;
      }
      return `${prefix}${replacement}${suffix}`;
    });
  }

  function normalizeMarkdownImageUrl(value) {
    return String(value || '')
      .trim()
      .replace(/^<|>$/g, '');
  }

  function splitFileName(fileName) {
    const normalized = String(fileName || '').trim();
    const lastDotIndex = normalized.lastIndexOf('.');
    if (lastDotIndex <= 0) {
      return {
        baseName: normalized || 'untitled-document',
        extension: ''
      };
    }

    return {
      baseName: normalized.slice(0, lastDotIndex),
      extension: normalized.slice(lastDotIndex)
    };
  }

  function isLocalMarkdownImageUrl(value) {
    return typeof value === 'string' && !/^(?:https?:|data:|blob:|file:|\/\/)/i.test(value);
  }

  async function exportMarkdownImageAsset(sourceUrl, assetDirectory, imageSource = null) {
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = imageSource && imageSource.block
        ? await createAssetFileName(getExportImageSourceUrl(imageSource.block), blob)
        : await createAssetFileName(sourceUrl, blob);
      await writeBinaryFile(assetDirectory, fileName, blob);
      return { fileName, mimeType: blob.type || '' };
    } catch (error) {
      console.error('Failed to export markdown image asset', sourceUrl, error);
      return null;
    }
  }

  async function createAssetFileName(sourceUrl, blob) {
    const hash = await sha256Hex(sourceUrl);
    const ext = guessAssetExtension(sourceUrl, blob && blob.type ? blob.type : '');
    return `img-${hash.slice(0, 12)}${ext}`;
  }

  function guessAssetExtension(sourceUrl, mimeType = '') {
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime.includes('jpeg')) return '.jpg';
    if (normalizedMime.includes('png')) return '.png';
    if (normalizedMime.includes('gif')) return '.gif';
    if (normalizedMime.includes('webp')) return '.webp';
    if (normalizedMime.includes('bmp')) return '.bmp';
    if (normalizedMime.includes('svg')) return '.svg';
    if (normalizedMime.includes('avif')) return '.avif';

    const extMatch = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(sourceUrl || ''));
    if (extMatch) {
      return `.${extMatch[1].toLowerCase()}`;
    }

    return '.png';
  }

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function getDocumentExportBlocks(documentData) {
    const blockIds = Array.isArray(documentData && documentData.blockIds)
      ? documentData.blockIds
      : Array.isArray(state.currentDocumentBlockIds)
        ? state.currentDocumentBlockIds
        : [];

    if (!blockIds.length) {
      return [];
    }

    return blockIds
      .map((blockId) => getBlockById(blockId))
      .filter((block) => block && block.type === 'image');
  }

  function getExportImageSourceUrl(block) {
    return (block && block.content && typeof block.content.originalImageUrl === 'string' && block.content.originalImageUrl)
      || (block && block.source && typeof block.source.originalImageUrl === 'string' && block.source.originalImageUrl)
      || (block && block.content && typeof block.content.imageUrl === 'string' && block.content.imageUrl)
      || (block && block.source && typeof block.source.imageUrl === 'string' && block.source.imageUrl)
      || '';
  }

  function getExportImageAliasUrls(block) {
    const urls = [];
    const values = [
      block && block.content && block.content.originalImageUrl,
      block && block.source && block.source.originalImageUrl,
      block && block.content && block.content.imageUrl,
      block && block.source && block.source.imageUrl,
      block && block.content && block.content.previewImageUrl,
      block && block.source && block.source.previewImageUrl
    ];

    values.forEach((value) => {
      const url = normalizeMarkdownImageUrl(value);
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    });

    return urls;
  }

  async function writeTextFile(directoryHandle, fileName, content) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    await writable.close();
  }

  async function writeBinaryFile(directoryHandle, fileName, blob) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function exportCurrentDocument() {
    const current = state.documents.find((item) => item.id === state.currentDocumentId) || null;
    if (current && !state.isDirty) {
      await exportDocument(current);
      return;
    }

    await exportDocument({
      title: documentTitleInput && documentTitleInput.value.trim() ? documentTitleInput.value.trim() : 'Untitled Document',
      markdown: markdownForCurrentDocument()
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


