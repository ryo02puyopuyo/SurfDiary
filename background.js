// When the extension icon is clicked, toggle the sidebar
browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Create the context menu item when the extension starts or is installed
browser.contextMenus.create({
  id: "save-to-memo",
  title: "選択テキストをメモに保存",
  contexts: ["selection"]
});

browser.contextMenus.create({
  id: "save-image-to-memo",
  title: "画像をメモに保存",
  contexts: ["image"]
});

// Listen for clicks on the context menu
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const data = await browser.storage.local.get({ memos: [] });
    const memos = data.memos || [];
    let newMemo = null;

    if (info.menuItemId === "save-to-memo") {
      const textToSave = info.selectionText;
      if (textToSave) {
        newMemo = {
          id: Date.now().toString(),
          type: "text",
          text: `“${textToSave}”\n\n(ソース: ${tab.title || tab.url})`,
          timestamp: new Date().toISOString()
        };
      }
    } else if (info.menuItemId === "save-image-to-memo") {
      const imageUrl = info.srcUrl;
      const pageUrl = info.pageUrl || tab.url;
      if (imageUrl) {
        newMemo = {
          id: Date.now().toString(),
          type: "image",
          imageUrl: imageUrl,
          text: `(ソース: ${tab.title || pageUrl})`,
          timestamp: new Date().toISOString()
        };
      }
    }

    if (newMemo) {
      memos.push(newMemo);
      await browser.storage.local.set({ memos });
    }
  } catch (e) {
    console.error("Failed to save from context menu", e);
  }
});
