document.addEventListener('DOMContentLoaded', () => {
  const memoInput = document.getElementById('memo-input');
  const saveBtn = document.getElementById('save-btn');
  const memoList = document.getElementById('memo-list');
  const openEditorBtn = document.getElementById('open-editor-btn');
  const saveUrlBtn = document.getElementById('save-url-btn');

  // Load existing memos on startup
  loadMemos();

  if (saveUrlBtn) {
    saveUrlBtn.addEventListener('click', async () => {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          const newMemo = {
            id: Date.now().toString(),
            type: "url",
            url: activeTab.url,
            title: activeTab.title,
            text: `🔖 ${activeTab.title}`,
            timestamp: new Date().toISOString()
          };
          await saveMemo(newMemo);
          // UI update is handled by the storage listener since we added it in Phase 2
        }
      } catch (e) {
        console.error("Failed to save URL", e);
      }
    });
  }

  if (openEditorBtn) {
    openEditorBtn.addEventListener('click', () => {
      // Create a pop-out detached window
      browser.windows.create({
        url: browser.runtime.getURL('editor/editor.html'),
        type: 'popup',
        width: 800,
        height: 650
      });
    });
  }

  saveBtn.addEventListener('click', async () => {
    const text = memoInput.value.trim();
    if (!text) return;

    const newMemo = {
      id: Date.now().toString(),
      text: text,
      timestamp: new Date().toISOString()
    };

    await saveMemo(newMemo);
    memoInput.value = ''; // clear input
    addMemoToUI(newMemo, true); // prepend to list
  });

  async function loadMemos() {
    try {
      const data = await browser.storage.local.get({ memos: [] });
      const memos = data.memos || [];
      // Sort in descending order (newest first)
      memos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      memos.forEach(memo => addMemoToUI(memo));
    } catch (e) {
      console.error('Failed to load memos', e);
    }
  }

  async function saveMemo(memo) {
    try {
      const data = await browser.storage.local.get({ memos: [] });
      const memos = data.memos || [];
      memos.push(memo);
      await browser.storage.local.set({ memos });
    } catch (e) {
      console.error('Failed to save memo', e);
    }
  }

  function addMemoToUI(memo, prepend = false) {
    const el = document.createElement('div');
    el.className = 'memo-item';
    
    // Check if it has an image
    if (memo.type === "image" || memo.imageUrl) {
      const imgWrap = document.createElement('div');
      imgWrap.style.marginBottom = '8px';
      
      const imgEl = document.createElement('img');
      imgEl.src = memo.imageUrl;
      imgEl.style.maxWidth = '100%';
      imgEl.style.maxHeight = '200px';
      imgEl.style.objectFit = 'contain';
      imgEl.style.borderRadius = '4px';
      
      imgWrap.appendChild(imgEl);
      el.appendChild(imgWrap);
    }

    if (memo.text) {
      const textEl = document.createElement('p');
      textEl.className = 'memo-text';
      textEl.textContent = memo.text;
      el.appendChild(textEl);
    }

    const metaEl = document.createElement('div');
    metaEl.className = 'memo-meta';
    
    // Format date nicely
    const d = new Date(memo.timestamp);
    const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = d.toLocaleDateString();
    metaEl.textContent = `${dateString} ${timeString}`;

    el.appendChild(metaEl);

    if (prepend) {
      memoList.prepend(el);
    } else {
      memoList.appendChild(el);
    }
  }

  // Listen for changes from the background script (Context Menu)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.memos) {
      // Clear the current list
      memoList.innerHTML = '';
      const newMemos = changes.memos.newValue || [];
      newMemos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      newMemos.forEach(memo => addMemoToUI(memo));
    }
  });
});
