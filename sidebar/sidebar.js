document.addEventListener('DOMContentLoaded', () => {
  const memoInput = document.getElementById('memo-input');
  const saveBtn = document.getElementById('save-btn');
  const memoList = document.getElementById('memo-list');
  const openEditorBtn = document.getElementById('open-editor-btn');
  const showAllTimelineBtn = document.getElementById('show-all-timeline-btn');
  const toggleSavePanelBtn = document.getElementById('toggle-save-panel-btn');
  const toggleTimelinePanelBtn = document.getElementById('toggle-timeline-panel-btn');
  const saveUrlBtn = document.getElementById('save-url-btn');
  const saveBranchSelect = document.getElementById('save-branch-select');
  const branchFilterSelect = document.getElementById('branch-filter');
  const typeFilterSelect = document.getElementById('type-filter');
  const branchCreateRow = document.getElementById('branch-create-row');
  const newBranchNameInput = document.getElementById('new-branch-name');
  const confirmBranchBtn = document.getElementById('confirm-branch-btn');
  const cancelBranchBtn = document.getElementById('cancel-branch-btn');
  const timelineCount = document.getElementById('timeline-count');

  const state = {
    blocks: [],
    branches: [],
    filters: {
      branchId: 'all',
      type: 'all'
    },
    saveBranchId: NoteFragmentsStore.DEFAULT_BRANCH_ID,
    composeCollapsed: false,
    timelineCollapsed: false,
    draggingBlockId: null,
    dropTargetBlockId: null,
    dragActive: false,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    dragSourceContainer: null,
    dragCleanup: null,
    dragGhostEl: null,
    dragPreviewEl: null,
    dragDropResolved: false,
    dropIndicatorEl: null,
    dropMode: null,
    dropTargetBlockId: null,
    branchComposerOpen: false
  };

  // Load existing blocks and branches on startup
  loadState();

  if (branchFilterSelect) {
    branchFilterSelect.addEventListener('change', async () => {
      state.filters.branchId = branchFilterSelect.value;
      await renderBlocks();
    });
  }

  if (typeFilterSelect) {
    typeFilterSelect.addEventListener('change', async () => {
      state.filters.type = typeFilterSelect.value;
      await renderBlocks();
    });
  }

  if (confirmBranchBtn) {
    confirmBranchBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await commitBranchComposer();
    });
  }

  if (cancelBranchBtn) {
    cancelBranchBtn.addEventListener('click', (event) => {
      event.preventDefault();
      closeBranchComposer();
    });
  }

  if (newBranchNameInput) {
    newBranchNameInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await commitBranchComposer();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeBranchComposer();
      }
    });
  }

  if (saveUrlBtn) {
    saveUrlBtn.addEventListener('click', async () => {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          const newBlock = {
            type: 'url',
            branchId: getSaveBranchId(),
            content: {
              url: activeTab.url,
              title: activeTab.title,
              text: activeTab.title || activeTab.url || ''
            },
            source: {
              pageUrl: activeTab.url,
              title: activeTab.title,
              url: activeTab.url
            }
          };
          await NoteFragmentsStore.saveBlock(newBlock);
          await loadState();
        }
      } catch (e) {
        console.error('Failed to save URL', e);
      }
    });
  }

  if (openEditorBtn) {
    openEditorBtn.addEventListener('click', () => {
      browser.windows.create({
        url: browser.runtime.getURL('editor/editor.html'),
        type: 'popup',
        width: 1500,
        height: 950
      });
    });
  }

  if (showAllTimelineBtn) {
    showAllTimelineBtn.addEventListener('click', async () => {
      state.filters.branchId = 'all';
      state.filters.type = 'all';

      if (branchFilterSelect) {
        branchFilterSelect.value = 'all';
      }

      if (typeFilterSelect) {
        typeFilterSelect.value = 'all';
      }

      await renderBlocks();

      const target = document.querySelector('.timeline-section');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (toggleSavePanelBtn) {
    toggleSavePanelBtn.addEventListener('click', () => {
      state.composeCollapsed = !state.composeCollapsed;
      applyPanelState();
    });
  }

  if (toggleTimelinePanelBtn) {
    toggleTimelinePanelBtn.addEventListener('click', () => {
      state.timelineCollapsed = !state.timelineCollapsed;
      applyPanelState();
    });
  }

  if (memoInput) {
    memoInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' || !event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.isComposing) {
        return;
      }

      event.preventDefault();
      await saveCurrentNote();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveCurrentNote();
    });
  }

  async function saveCurrentNote() {
    const text = memoInput.value.trim();
    if (!text) return;

    const newBlock = {
      type: 'text',
      branchId: getSaveBranchId(),
      content: {
        text
      },
      source: {
        pageUrl: null,
        title: 'Manual note'
      }
    };

    await NoteFragmentsStore.saveBlock(newBlock);
    memoInput.value = '';
    await loadState();
  }

  async function loadState() {
    try {
      const [blocks, branches] = await Promise.all([
        NoteFragmentsStore.loadBlocks(),
        NoteFragmentsStore.loadBranches()
      ]);

      state.blocks = blocks;
      state.branches = sortBranches(branches);
      renderFilterOptions();
      renderSaveBranchOptions();
      applyPanelState();
      await renderBlocks();
    } catch (e) {
      console.error('Failed to load NoteFragments state', e);
      renderStartupError('Failed to load NoteFragments state.', e);
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

  function renderFilterOptions() {
    if (branchFilterSelect) {
      const previous = branchFilterSelect.value || state.filters.branchId || 'all';
      branchFilterSelect.innerHTML = '';

      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All branches';
      branchFilterSelect.appendChild(allOption);

      state.branches.forEach((branch) => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.name;
        branchFilterSelect.appendChild(option);
      });

      branchFilterSelect.value = [...branchFilterSelect.options].some((option) => option.value === previous)
        ? previous
        : 'all';
      state.filters.branchId = branchFilterSelect.value;
    }

    if (typeFilterSelect && !typeFilterSelect.dataset.initialized) {
      typeFilterSelect.dataset.initialized = 'true';
      typeFilterSelect.value = state.filters.type;
    }
  }

  function renderSaveBranchOptions() {
    const previous = saveBranchSelect ? saveBranchSelect.value || state.saveBranchId : state.saveBranchId;
    if (!saveBranchSelect) {
      return;
    }

    saveBranchSelect.innerHTML = '';

    state.branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch.id;
      option.textContent = branch.name;
      saveBranchSelect.appendChild(option);
    });

    const fallback = state.branches.some((branch) => branch.id === previous)
      ? previous
      : NoteFragmentsStore.DEFAULT_BRANCH_ID;
    saveBranchSelect.value = fallback;
    state.saveBranchId = fallback;

    saveBranchSelect.onchange = () => {
      state.saveBranchId = saveBranchSelect.value;
    };
  }

  function openBranchComposer() {
    state.branchComposerOpen = true;
    if (newBranchNameInput) {
      window.setTimeout(() => newBranchNameInput.focus(), 0);
    }
  }

  function closeBranchComposer() {
    state.branchComposerOpen = false;
    if (newBranchNameInput) {
      newBranchNameInput.value = '';
    }
  }

  async function commitBranchComposer() {
    const name = newBranchNameInput ? newBranchNameInput.value.trim() : '';
    if (!name) {
      return;
    }

    try {
      const created = await NoteFragmentsStore.createBranch({ name });
      if (!created) {
        return;
      }
      state.filters.branchId = 'all';
      if (branchFilterSelect) {
        branchFilterSelect.value = 'all';
      }
      closeBranchComposer();
      await loadState();
    } catch (e) {
      console.error('Failed to create branch', e);
    }
  }

  function getSaveBranchId() {
    if (saveBranchSelect && saveBranchSelect.value) {
      state.saveBranchId = saveBranchSelect.value;
      return saveBranchSelect.value;
    }
    return state.saveBranchId || NoteFragmentsStore.DEFAULT_BRANCH_ID;
  }

  function applyPanelState() {
    const composePanel = document.querySelector('.compose-panel');
    const timelinePanel = document.querySelector('.timeline-panel');

    if (composePanel) {
      composePanel.classList.toggle('collapsed', state.composeCollapsed);
    }

    if (timelinePanel) {
      timelinePanel.classList.toggle('collapsed', state.timelineCollapsed);
    }

    if (toggleSavePanelBtn) {
      toggleSavePanelBtn.textContent = state.composeCollapsed ? '▸' : '▾';
      toggleSavePanelBtn.setAttribute('aria-expanded', String(!state.composeCollapsed));
      toggleSavePanelBtn.title = state.composeCollapsed ? 'Expand save section' : 'Collapse save section';
    }

    if (toggleTimelinePanelBtn) {
      toggleTimelinePanelBtn.textContent = state.timelineCollapsed ? '▸' : '▾';
      toggleTimelinePanelBtn.setAttribute('aria-expanded', String(!state.timelineCollapsed));
      toggleTimelinePanelBtn.title = state.timelineCollapsed ? 'Expand timeline section' : 'Collapse timeline section';
    }
  }

  function getBranchName(branchId) {
    const branch = state.branches.find((item) => item.id === branchId);
    return branch ? branch.name : NoteFragmentsStore.DEFAULT_BRANCH_NAME;
  }

  function getBlockById(blockId) {
    return state.blocks.find((block) => block && block.id === blockId) || null;
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

  function applyFilters(blocks) {
    return blocks.filter((block) => {
      const branchMatches =
        state.filters.branchId === 'all' || block.branchId === state.filters.branchId;
      const typeMatches =
        state.filters.type === 'all' || block.type === state.filters.type;
      return branchMatches && typeMatches;
    });
  }

  async function renderBlocks() {
    const filtered = applyFilters(state.blocks);
    memoList.innerHTML = '';

    if (timelineCount) {
      timelineCount.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'memo-empty';
      empty.textContent = 'No memos in this view yet.';
      memoList.appendChild(empty);
      return;
    }

    filtered.forEach((block) => addBlockToUI(block));
  }

  function addBlockToUI(block) {
    const el = document.createElement('div');
    el.className = 'memo-item';
    el.dataset.blockId = block.id;
    renderBlockCard(el, block);
    memoList.appendChild(el);
  }

  function renderBlockCard(container, block) {
    container.innerHTML = '';

    if (isMergeableBlock(block)) {
      container.classList.add('memo-item-draggable');
      container.title = 'Drag to move or merge TEXT/URL items';
    } else {
      container.classList.remove('memo-item-draggable');
      container.title = 'Drag to move this item';
    }

    const dragRow = document.createElement('div');
    dragRow.className = 'memo-drag-row';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'memo-drag-handle';
    dragHandle.textContent = 'Drag';
    dragHandle.setAttribute('role', 'button');
    dragHandle.setAttribute('aria-label', 'Drag to move');
    dragHandle.addEventListener('pointerdown', (event) => {
      beginBlockDrag(event, block.id, container, dragHandle);
    });
    dragRow.appendChild(dragHandle);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'memo-body';

    if (block.type === 'image' || (block.content && block.content.imageUrl)) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'memo-image-wrap';

      const imgEl = document.createElement('img');
      imgEl.alt = 'Saved image';
      imgEl.className = 'memo-image';
      imgEl.loading = 'lazy';
      imgEl.decoding = 'async';
      resolvePreviewImageSource(block).then((src) => {
        if (src) {
          imgEl.src = src;
        }
      }).catch((error) => {
        console.error('Failed to resolve timeline image source', error);
      });

      imgWrap.appendChild(imgEl);
      bodyEl.appendChild(imgWrap);
    }

    const textValue = block.content && typeof block.content.text === 'string' ? block.content.text : '';
    const urlValue = block.content && typeof block.content.url === 'string' ? block.content.url : '';
    const titleValue = block.content && typeof block.content.title === 'string' ? block.content.title : '';

    if (textValue || urlValue || titleValue) {
      const textEl = document.createElement('p');
      textEl.className = 'memo-text';
      if (block.type === 'url') {
        textEl.textContent = titleValue || urlValue;
      } else {
        textEl.textContent = textValue || titleValue || urlValue;
      }
      bodyEl.appendChild(textEl);
    }

    container.appendChild(dragRow);
    container.appendChild(bodyEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'memo-meta';

    const branchBadge = document.createElement('span');
    branchBadge.className = 'branch-badge';
    branchBadge.textContent = getBranchName(block.branchId);

    const d = new Date(block.createdAt);
    const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = d.toLocaleDateString();

    const metaText = document.createElement('span');
    metaText.textContent = `${dateString} ${timeString}`;

    const leftMeta = document.createElement('div');
    leftMeta.className = 'memo-meta-left';
    leftMeta.appendChild(branchBadge);
    leftMeta.appendChild(metaText);

    metaEl.appendChild(leftMeta);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'memo-actions';

    if (block.type === 'image' || (block.content && block.content.imageUrl)) {
      const saveImageBtn = document.createElement('button');
      saveImageBtn.type = 'button';
      saveImageBtn.className = 'memo-action-btn';
      saveImageBtn.textContent = 'Save image';
      saveImageBtn.addEventListener('click', async (event) => {
        eventStop(saveImageBtn, event);
        await saveImageBlock(block);
      });
      actionsEl.appendChild(saveImageBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'memo-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (event) => {
      eventStop(editBtn, event);
      renderInlineEditor(container, block);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'memo-action-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async (event) => {
      eventStop(deleteBtn, event);
      await deleteBlock(block);
    });

    actionsEl.appendChild(editBtn);
    actionsEl.appendChild(deleteBtn);
    metaEl.appendChild(actionsEl);

    container.appendChild(metaEl);
  }

  function isMergeableBlock(block) {
    return Boolean(block) && (block.type === 'text' || block.type === 'url');
  }

  function getDropTargetBlock(event) {
    const candidates = [];

    if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
      if (elementAtPoint) {
        candidates.push(elementAtPoint);
      }
    }

    if (event && event.target) {
      candidates.push(event.target);
    }

    for (const candidate of candidates) {
      if (!candidate || typeof candidate.closest !== 'function') {
        continue;
      }

      const item = candidate.closest('.memo-item');
      if (!item) {
        continue;
      }

      const targetId = item.dataset.blockId || '';
      if (!targetId) {
        continue;
      }

      const targetBlock = getBlockById(targetId);
      if (!targetBlock) {
        continue;
      }

      return { element: item, block: targetBlock };
    }

    return null;
  }

  function beginBlockDrag(event, blockId, container, handle) {
    const block = getBlockById(blockId);
    if (!block || !event) {
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.dragCleanup) {
      state.dragCleanup();
      state.dragCleanup = null;
    }

    clearDropTargetState();

    state.draggingBlockId = blockId;
    state.dragPointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    state.dragActive = true;
    state.dragSourceContainer = container;
    state.dragDropResolved = false;
    document.body.classList.add('dragging-block');
    container.classList.add('dragging-source');
    container.classList.add('dragging');

    state.dragPreviewEl = createDragPreview(container);
    updateDragPreviewPosition(event.clientX, event.clientY);

    if (handle && typeof handle.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {
        console.error('Failed to capture pointer for drag', error);
      }
    }

    const onPointerMove = (moveEvent) => {
      if (!state.draggingBlockId || state.dragDropResolved) {
        return;
      }

      updateDragPreviewPosition(moveEvent.clientX, moveEvent.clientY);
      const context = getDropContext(moveEvent);
      if (!context) {
        clearDropTargetState();
        return;
      }

      if (context.mode === 'merge' && context.targetId) {
        setDropMergeTarget(context.targetId);
        return;
      }

      if (typeof context.insertIndex === 'number') {
        setDropInsertTarget(context.insertIndex);
      }
    };

    const finishDrop = async (dropEvent) => {
      if (!state.draggingBlockId || state.dragDropResolved) {
        return;
      }

      const sourceId = state.draggingBlockId;
      const context = getDropContext(dropEvent);
      state.dragDropResolved = true;

      try {
        if (context && context.mode === 'merge' && context.targetId && canMergeBlocks(sourceId, context.targetId)) {
          await mergeBlocks(sourceId, context.targetId);
          return;
        }

        if (context && typeof context.insertIndex === 'number') {
          await insertBlockAtIndex(sourceId, context.insertIndex);
        }
      } finally {
        clearDragState();
      }
    };

    const onPointerUp = (upEvent) => {
      if (upEvent && typeof upEvent.preventDefault === 'function') {
        upEvent.preventDefault();
      }
      finishDrop(upEvent);
    };

    const onPointerCancel = () => {
      clearDragState();
    };

    const detachPointerDragListeners = () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      state.dragCleanup = null;
    };

    state.dragCleanup = detachPointerDragListeners;
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
  }

  function eventStop(element, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (element && typeof element.blur === 'function') {
      element.blur();
    }
  }

  function renderStartupError(message, error) {
    if (!memoList) {
      return;
    }

    memoList.innerHTML = '';

    const errorCard = document.createElement('div');
    errorCard.className = 'memo-item memo-error';

    const title = document.createElement('p');
    title.className = 'memo-text';
    title.textContent = message;
    errorCard.appendChild(title);

    if (error && error.message) {
      const detail = document.createElement('pre');
      detail.className = 'memo-error-detail';
      detail.textContent = error.message;
      errorCard.appendChild(detail);
    }

    memoList.appendChild(errorCard);
  }

  function clearDropTargetState() {
    state.dropTargetBlockId = null;
    state.dropMode = null;
    document.querySelectorAll('.memo-item.drop-target').forEach((item) => {
      item.classList.remove('drop-target');
    });
    document.querySelectorAll('.memo-item.merge-target').forEach((item) => {
      item.classList.remove('merge-target');
    });
    document.querySelectorAll('.memo-item.insert-target').forEach((item) => {
      item.classList.remove('insert-target');
    });
    if (state.dropIndicatorEl && typeof state.dropIndicatorEl.remove === 'function') {
      state.dropIndicatorEl.remove();
    }
    state.dropIndicatorEl = null;
  }

  function clearDragState() {
    if (typeof state.dragCleanup === 'function') {
      const cleanup = state.dragCleanup;
      state.dragCleanup = null;
      cleanup();
    }

    state.draggingBlockId = null;
    state.dragPointerId = null;
    state.dragActive = false;
    state.dragDropResolved = false;
    if (state.dragSourceContainer && typeof state.dragSourceContainer.classList !== 'undefined') {
      state.dragSourceContainer.classList.remove('dragging');
      state.dragSourceContainer.classList.remove('merge-source');
      state.dragSourceContainer.classList.remove('dragging-source');
    }
    state.dragSourceContainer = null;
    if (state.dragPreviewEl && typeof state.dragPreviewEl.remove === 'function') {
      state.dragPreviewEl.remove();
    }
    state.dragPreviewEl = null;
    clearDropTargetState();
    document.body.classList.remove('dragging-block');
    document.querySelectorAll('.memo-item.dragging-source').forEach((item) => {
      item.classList.remove('dragging-source');
    });
    document.querySelectorAll('.memo-item.dragging').forEach((item) => {
      item.classList.remove('dragging');
    });
  }

  function createDragPreview(container) {
    const preview = container.cloneNode(true);
    preview.classList.add('memo-drag-preview');
    preview.classList.remove('dragging-source');
    preview.classList.remove('dragging');
    preview.style.position = 'fixed';
    preview.style.left = '0';
    preview.style.top = '0';
    preview.style.width = `${container.getBoundingClientRect().width}px`;
    preview.style.maxWidth = `${container.getBoundingClientRect().width}px`;
    preview.style.pointerEvents = 'none';
    preview.style.margin = '0';
    preview.style.transform = 'translate(-9999px, -9999px)';
    preview.style.zIndex = '9999';
    document.body.appendChild(preview);
    return preview;
  }

  function updateDragPreviewPosition(clientX, clientY) {
    if (!state.dragPreviewEl) {
      return;
    }

    const nextX = typeof clientX === 'number' ? clientX + 16 : 16;
    const nextY = typeof clientY === 'number' ? clientY + 16 : 16;
    state.dragPreviewEl.style.transform = `translate(${nextX}px, ${nextY}px)`;
  }

  function getVisibleBlockElements(excludeBlockId = '') {
    if (!memoList) {
      return [];
    }

    return Array.from(memoList.querySelectorAll('.memo-item'))
      .filter((item) => item.dataset.blockId && item.dataset.blockId !== excludeBlockId);
  }

  function getDropContext(event) {
    if (!state.draggingBlockId || !event) {
      return null;
    }

    const sourceId = state.draggingBlockId;
    const items = getVisibleBlockElements(sourceId);
    const clientY = typeof event.clientY === 'number' ? event.clientY : null;
    const clientX = typeof event.clientX === 'number' ? event.clientX : null;
    const elementAtPoint = clientX !== null && clientY !== null ? document.elementFromPoint(clientX, clientY) : null;
    const hoveredItem = elementAtPoint && typeof elementAtPoint.closest === 'function'
      ? elementAtPoint.closest('.memo-item')
      : null;

    const pickInsertIndex = () => {
      if (!items.length) {
        return 0;
      }

      for (let index = 0; index < items.length; index += 1) {
        const rect = items[index].getBoundingClientRect();
        if (clientY !== null && clientY < rect.top + rect.height / 2) {
          return index;
        }
      }

      return items.length;
    };

    if (hoveredItem && hoveredItem.dataset.blockId && hoveredItem.dataset.blockId !== sourceId) {
      const targetId = hoveredItem.dataset.blockId;
      const targetBlock = getBlockById(targetId);
      const rect = hoveredItem.getBoundingClientRect();
      const ratio = clientY === null || rect.height <= 0 ? 0.5 : (clientY - rect.top) / rect.height;
      const centerZone = ratio >= 0.3 && ratio <= 0.7;

      if (centerZone && canMergeBlocks(sourceId, targetId)) {
        return {
          mode: 'merge',
          targetId,
          insertIndex: null
        };
      }

      const hoveredIndex = items.findIndex((item) => item.dataset.blockId === targetId);
      const insertIndex = hoveredIndex >= 0 ? hoveredIndex + (ratio > 0.5 ? 1 : 0) : pickInsertIndex();
      return {
        mode: 'insert',
        targetId: null,
        insertIndex
      };
    }

    return {
      mode: 'insert',
      targetId: null,
      insertIndex: pickInsertIndex()
    };
  }

  function renderDropIndicator(insertIndex) {
    if (!memoList) {
      return;
    }

    const indicator = document.createElement('div');
    indicator.className = 'memo-drop-indicator';
    state.dropIndicatorEl = indicator;

    const items = getVisibleBlockElements(state.draggingBlockId);
    const reference = items[insertIndex] || null;
    if (reference && reference.parentNode === memoList) {
      memoList.insertBefore(indicator, reference);
    } else {
      memoList.appendChild(indicator);
    }
  }

  function setDropMergeTarget(targetId) {
    clearDropTargetState();
    state.dropMode = 'merge';
    state.dropTargetBlockId = targetId;
    const target = memoList
      ? Array.from(memoList.querySelectorAll('.memo-item')).find((item) => item.dataset.blockId === targetId) || null
      : null;
    if (target) {
      target.classList.add('drop-target');
      target.classList.add('merge-target');
    }
  }

  function setDropInsertTarget(insertIndex) {
    clearDropTargetState();
    state.dropMode = 'insert';
    renderDropIndicator(insertIndex);
  }

  function handleTimelinePointerMove(event) {
    if (!state.draggingBlockId || state.dragDropResolved) {
      return;
    }

    updateDragPreviewPosition(event.clientX, event.clientY);
    const context = getDropContext(event);
    if (!context) {
      clearDropTargetState();
      return;
    }

    if (context.mode === 'merge' && context.targetId) {
      setDropMergeTarget(context.targetId);
      return;
    }

    if (typeof context.insertIndex === 'number') {
      setDropInsertTarget(context.insertIndex);
    }
  }

  function computeInsertOrder(blocks, insertIndex) {
    const prev = insertIndex > 0 ? blocks[insertIndex - 1] : null;
    const next = insertIndex < blocks.length ? blocks[insertIndex] : null;
    const prevOrder = prev ? (typeof prev.sortOrder === 'number' ? prev.sortOrder : new Date(prev.createdAt).getTime()) : null;
    const nextOrder = next ? (typeof next.sortOrder === 'number' ? next.sortOrder : new Date(next.createdAt).getTime()) : null;

    if (prevOrder !== null && nextOrder !== null) {
      if (prevOrder === nextOrder) {
        return prevOrder;
      }
      return nextOrder + (prevOrder - nextOrder) / 2;
    }

    if (prevOrder !== null) {
      return prevOrder - 1;
    }

    if (nextOrder !== null) {
      return nextOrder + 1;
    }

    return Date.now();
  }

  async function insertBlockAtIndex(sourceId, insertIndex) {
    const source = getBlockById(sourceId);
    if (!source) {
      return;
    }

    const visibleBlocks = applyFilters(state.blocks)
      .filter((block) => block.id !== sourceId)
      .slice()
      .sort((a, b) => {
        const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : new Date(a.createdAt).getTime();
        const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : new Date(b.createdAt).getTime();
        if (bOrder !== aOrder) {
          return bOrder - aOrder;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const safeIndex = Math.max(0, Math.min(insertIndex, visibleBlocks.length));
    const newSortOrder = computeInsertOrder(visibleBlocks, safeIndex);

    await NoteFragmentsStore.updateBlock(sourceId, {
      sortOrder: newSortOrder
    });
    await loadState();
  }

  function canMergeBlocks(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return false;
    }

    const source = getBlockById(sourceId);
    const target = getBlockById(targetId);
    return isMergeableBlock(source) && isMergeableBlock(target);
  }

  function getBlockMergeText(block) {
    if (!block) {
      return '';
    }

    if (block.type === 'text') {
      return block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';
    }

    if (block.type === 'url') {
      const lines = [];
      const title = (block.content && typeof block.content.title === 'string' ? block.content.title.trim() : '')
        || (block.source && typeof block.source.title === 'string' ? block.source.title.trim() : '');
      const url = (block.content && typeof block.content.url === 'string' ? block.content.url.trim() : '')
        || (block.source && typeof block.source.url === 'string' ? block.source.url.trim() : '');
      const note = block.content && typeof block.content.text === 'string' ? block.content.text.trim() : '';

      if (title) {
        lines.push(title);
      }

      if (url && url !== title) {
        lines.push(url);
      }

      if (note && note !== title && note !== url) {
        lines.push(note);
      }

      return lines.join('\n');
    }

    return '';
  }

  async function mergeBlocks(sourceId, targetId) {
    if (!canMergeBlocks(sourceId, targetId)) {
      return;
    }

    const source = getBlockById(sourceId);
    const target = getBlockById(targetId);

    if (!source || !target) {
      return;
    }

    const mergedText = [getBlockMergeText(target), getBlockMergeText(source)]
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!mergedText) {
      return;
    }

    try {
      await NoteFragmentsStore.saveBlock({
        type: 'text',
        branchId: target.branchId || source.branchId || NoteFragmentsStore.DEFAULT_BRANCH_ID,
        sortOrder: typeof target.sortOrder === 'number' ? target.sortOrder : new Date(target.createdAt).getTime(),
        content: {
          text: mergedText
        },
        source: {
          pageUrl: null,
          title: 'Merged text',
          selectionText: mergedText,
          mergedFrom: [source.id, target.id]
        }
      });

      await NoteFragmentsStore.deleteBlock(source.id);
      await NoteFragmentsStore.deleteBlock(target.id);
      await loadState();
    } catch (error) {
      console.error('Failed to merge blocks', error);
    }
  }

  function resolveImageSource(block) {
    return resolveOriginalImageSource(block);
  }

  function resolvePreviewImageSource(block) {
    const imageUrl = block && block.content && typeof block.content.imageUrl === 'string'
      ? block.content.previewImageUrl || block.content.imageUrl
      : (block && block.source && typeof block.source.previewImageUrl === 'string'
        ? block.source.previewImageUrl
        : (block && block.source && typeof block.source.imageUrl === 'string' ? block.source.imageUrl : ''));

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

  function resolveOriginalImageSource(block) {
    const imageUrl = getOriginalImageUrl(block);

    if (!imageUrl) {
      return Promise.resolve('');
    }

    return Promise.resolve(imageUrl);
  }

  function getOriginalImageUrl(block) {
    return (block && block.content && typeof block.content.originalImageUrl === 'string' && block.content.originalImageUrl)
      || (block && block.source && typeof block.source.originalImageUrl === 'string' && block.source.originalImageUrl)
      || (block && block.content && typeof block.content.imageUrl === 'string' && block.content.imageUrl)
      || (block && block.source && typeof block.source.imageUrl === 'string' && block.source.imageUrl)
      || '';
  }

  function getImageFileName(block) {
    const imageUrl = getOriginalImageUrl(block);
    const imageMimeType = (block && block.content && typeof block.content.imageMimeType === 'string' && block.content.imageMimeType)
      || (block && block.source && typeof block.source.imageMimeType === 'string' && block.source.imageMimeType)
      || '';
    const sourceName = (block && block.content && typeof block.content.imageFileName === 'string' && block.content.imageFileName)
      || (block && block.source && typeof block.source.imageFileName === 'string' && block.source.imageFileName)
      || '';

    if (sourceName) {
      return sanitizeFileName(sourceName);
    }

    const ext = guessImageExtension(imageUrl, imageMimeType);
    const baseName = sanitizeFileName(getBlockTitle(block) || 'surfdiary-image');
    return `${baseName}${ext}`;
  }

  function sanitizeFileName(value) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  }

  function guessImageExtension(imageUrl, mimeType = '') {
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime.includes('jpeg')) return '.jpg';
    if (normalizedMime.includes('png')) return '.png';
    if (normalizedMime.includes('gif')) return '.gif';
    if (normalizedMime.includes('webp')) return '.webp';
    if (normalizedMime.includes('bmp')) return '.bmp';
    if (normalizedMime.includes('svg')) return '.svg';
    if (normalizedMime.includes('avif')) return '.avif';

    if (typeof imageUrl === 'string') {
      const extMatch = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(imageUrl);
      if (extMatch) {
        return `.${extMatch[1].toLowerCase()}`;
      }
    }

    return '.png';
  }

  function isDataImageUrl(value) {
    return typeof value === 'string' && /^data:image\//i.test(value);
  }

  async function loadImageBlob(imageUrl) {
    if (!imageUrl) {
      throw new Error('Missing image URL');
    }

    if (isDataImageUrl(imageUrl)) {
      const response = await fetch(imageUrl);
      return response.blob();
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    return response.blob();
  }

  async function saveImageBlock(block) {
    const imageUrl = getOriginalImageUrl(block);
    if (!imageUrl) {
      return;
    }

    const fileName = getImageFileName(block);
    try {
      const blob = await loadImageBlob(imageUrl);
      await saveBlobAsFile(blob, fileName, 'image');
    } catch (error) {
      console.error('Failed to save image as file, falling back to browser download', error);
      await downloadImageFallback(imageUrl, fileName);
    }
  }

  async function saveBlobAsFile(blob, fileName, kind = 'image') {
    if (typeof window.showSaveFilePicker === 'function') {
      const handle = await window.showSaveFilePicker({
        id: `surfdiary-${kind}-save`,
        suggestedName: fileName,
        startIn: 'pictures',
        types: [{
          description: 'Image',
          accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']
          }
        }]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    try {
      if (typeof browser !== 'undefined' && browser.downloads && typeof browser.downloads.download === 'function') {
        await browser.downloads.download({
          url,
          filename: fileName,
          saveAs: true,
          conflictAction: 'uniquify'
        });
        return;
      }

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function downloadImageFallback(imageUrl, fileName) {
    if (typeof browser !== 'undefined' && browser.downloads && typeof browser.downloads.download === 'function') {
      await browser.downloads.download({
        url: imageUrl,
        filename: fileName,
        saveAs: true,
        conflictAction: 'uniquify'
      });
      return;
    }

    throw new Error('No available download mechanism for image export');
  }

  function renderInlineEditor(container, block) {
    container.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'memo-edit-form';

    const heading = document.createElement('div');
    heading.className = 'memo-edit-title';
    heading.textContent = 'Edit fragment';
    form.appendChild(heading);

    const makeField = (labelText, element) => {
      const wrap = document.createElement('label');
      wrap.className = 'memo-field';

      const label = document.createElement('span');
      label.className = 'memo-field-label';
      label.textContent = labelText;

      wrap.appendChild(label);
      wrap.appendChild(element);
      return wrap;
    };

    const currentText = block.content && typeof block.content.text === 'string' ? block.content.text : '';
    const currentUrl = block.content && typeof block.content.url === 'string' ? block.content.url : '';
    const currentTitle = block.content && typeof block.content.title === 'string' ? block.content.title : '';
    const currentImageUrl = block.content && typeof block.content.imageUrl === 'string' ? block.content.imageUrl : '';

    const branchSelect = document.createElement('select');
    branchSelect.className = 'memo-field-input';
    state.branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch.id;
      option.textContent = branch.name;
      branchSelect.appendChild(option);
    });
    branchSelect.value = block.branchId || NoteFragmentsStore.DEFAULT_BRANCH_ID;
    form.appendChild(makeField('Branch', branchSelect));

    let titleInput = null;
    let urlInput = null;
    let imageUrlInput = null;
    let textArea = null;

    if (block.type === 'url') {
      titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = currentTitle || '';
      titleInput.placeholder = 'Title';
      titleInput.className = 'memo-field-input';

      urlInput = document.createElement('input');
      urlInput.type = 'url';
      urlInput.value = currentUrl || block.source.url || '';
      urlInput.placeholder = 'https://example.com';
      urlInput.className = 'memo-field-input';

      const noteInput = document.createElement('textarea');
      noteInput.value = currentText || '';
      noteInput.placeholder = 'Optional note';
      noteInput.className = 'memo-field-textarea';
      textArea = noteInput;

      form.appendChild(makeField('Title', titleInput));
      form.appendChild(makeField('URL', urlInput));
      form.appendChild(makeField('Note', noteInput));
    } else if (block.type === 'image') {
      imageUrlInput = document.createElement('input');
      imageUrlInput.type = 'url';
      imageUrlInput.value = currentImageUrl || block.source.imageUrl || '';
      imageUrlInput.placeholder = 'https://example.com/image.png';
      imageUrlInput.className = 'memo-field-input';

      textArea = document.createElement('textarea');
      textArea.value = currentText || '';
      textArea.placeholder = 'Optional note';
      textArea.className = 'memo-field-textarea';

      form.appendChild(makeField('Image URL', imageUrlInput));
      form.appendChild(makeField('Note', textArea));
    } else {
      textArea = document.createElement('textarea');
      textArea.value = currentText || '';
      textArea.placeholder = 'Write your memo';
      textArea.className = 'memo-field-textarea';

      form.appendChild(makeField('Memo', textArea));
    }

    const actions = document.createElement('div');
    actions.className = 'memo-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'memo-action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      renderBlockCard(container, block);
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'memo-action-btn primary';
    saveBtn.textContent = 'Save';

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    form.appendChild(actions);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        let updates = {
          branchId: branchSelect.value
        };

        if (block.type === 'url') {
          const nextTitle = titleInput.value.trim();
          const nextUrl = urlInput.value.trim();
          const nextNote = textArea.value.trim();
          updates = {
            ...updates,
            type: 'url',
            content: {
              url: nextUrl,
              title: nextTitle,
              text: nextNote || nextTitle || nextUrl
            },
            source: {
              ...block.source,
              title: nextTitle,
              url: nextUrl,
              pageUrl: nextUrl
            }
          };
        } else if (block.type === 'image') {
          const nextImageUrl = imageUrlInput.value.trim();
          const nextText = textArea.value.trim();
          updates = {
            ...updates,
            type: 'image',
            content: {
              imageUrl: nextImageUrl,
              previewImageUrl: nextImageUrl,
              originalImageUrl: nextImageUrl,
              text: nextText
            },
            source: {
              ...block.source,
              imageUrl: nextImageUrl,
              previewImageUrl: nextImageUrl,
              originalImageUrl: nextImageUrl
            }
          };
        } else {
          const nextText = textArea.value.trim();
          updates = {
            ...updates,
            type: 'text',
            content: {
              text: nextText
            },
            source: {
              ...block.source,
              selectionText: nextText
            }
          };
        }

        await NoteFragmentsStore.updateBlock(block.id, updates);
        await loadState();
      } catch (e) {
        console.error('Failed to update block', e);
      }
    });

    container.appendChild(form);
    if (textArea) {
      textArea.focus();
      textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    } else if (urlInput) {
      urlInput.focus();
    }
  }

  async function deleteBlock(block) {
    try {
      await NoteFragmentsStore.deleteBlock(block.id);
      await loadState();
    } catch (e) {
      console.error('Failed to delete block', e);
    }
  }

  // Listen for changes from the background script (Context Menu)
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
});

