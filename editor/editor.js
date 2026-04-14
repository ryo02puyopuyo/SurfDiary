document.addEventListener('DOMContentLoaded', () => {
  const memoList = document.getElementById('memo-list');
  const mainTextarea = document.getElementById('main-textarea');
  const saveBtn = document.getElementById('save-btn');

  loadMemos();

  saveBtn.addEventListener('click', async () => {
    const text = mainTextarea.value.trim();
    if (!text) return;

    const newMemo = {
      id: Date.now().toString(),
      text: text,
      timestamp: new Date().toISOString()
    };

    await saveMemo(newMemo);
    mainTextarea.value = '';
  });

  async function loadMemos() {
    try {
      const data = await browser.storage.local.get({ memos: [] });
      const memos = data.memos || [];
      memos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      memoList.innerHTML = '';
      memos.forEach(memo => addMemoToUI(memo));
    } catch (e) {
      console.error('Failed to load memos', e);
    }
  }

  async function saveMemo(memo) {
    const data = await browser.storage.local.get({ memos: [] });
    const memos = data.memos || [];
    memos.push(memo);
    await browser.storage.local.set({ memos });
  }

  function addMemoToUI(memo) {
    const el = document.createElement('div');
    el.className = 'memo-item';
    
    // Check if it has an image
    if (memo.type === "image" || memo.imageUrl) {
      const imgWrap = document.createElement('div');
      imgWrap.style.marginBottom = '8px';
      
      const imgEl = document.createElement('img');
      imgEl.src = memo.imageUrl;
      imgEl.style.maxWidth = '100%';
      imgEl.style.maxHeight = '150px';
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
    
    const d = new Date(memo.timestamp);
    metaEl.textContent = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    el.appendChild(metaEl);
    memoList.appendChild(el);
  }

  // Listen for storage changes to keep sidebar list in sync
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.memos) {
      loadMemos();
    }
  });
});
