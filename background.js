importScripts('shared/webext-compat.js', 'shared/notefragments-store.js');

const SIDE_PANEL_PATH = 'sidebar/sidebar.html';

const CONTEXT_MENU_ITEMS = [
  {
    id: 'save-to-memo',
    title: 'Save selected text to memo',
    contexts: ['selection']
  },
  {
    id: 'save-image-to-memo',
    title: 'Save image to memo',
    contexts: ['image']
  }
];

let contextMenusInitializationPromise = null;
let sidePanelInitializationPromise = null;

browser.runtime.onInstalled.addListener(() => {
  ensureContextMenus().catch((error) => {
    console.error('Failed to create context menus on install', error);
  });
  ensureSidePanel().catch((error) => {
    console.error('Failed to configure side panel on install', error);
  });
});

browser.runtime.onStartup.addListener(() => {
  ensureContextMenus().catch((error) => {
    console.error('Failed to create context menus on startup', error);
  });
  ensureSidePanel().catch((error) => {
    console.error('Failed to configure side panel on startup', error);
  });
});

if (!hasSidePanelApi()) {
  browser.action.onClicked.addListener(async () => {
    try {
      await browser.tabs.create({
        url: browser.runtime.getURL(SIDE_PANEL_PATH)
      });
    } catch (error) {
      console.error('Failed to open NoteFragments page from toolbar action', error);
    }
  });
}

async function ensureContextMenus() {
  if (contextMenusInitializationPromise) {
    return contextMenusInitializationPromise;
  }

  contextMenusInitializationPromise = (async () => {
  try {
    await browser.contextMenus.removeAll();
  } catch (error) {
    // Ignore missing menus during first run or worker cold start.
  }

  CONTEXT_MENU_ITEMS.forEach((item) => {
    browser.contextMenus.create(item);
  });
  })();

  try {
    await contextMenusInitializationPromise;
  } catch (error) {
    contextMenusInitializationPromise = null;
    throw error;
  }
}

async function ensureSidePanel() {
  if (!hasSidePanelApi()) {
    return false;
  }

  if (sidePanelInitializationPromise) {
    return sidePanelInitializationPromise;
  }

  sidePanelInitializationPromise = (async () => {
    await browser.sidePanel.setOptions({
      path: SIDE_PANEL_PATH
    });

    await browser.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    });
    return true;
  })();

  try {
    return await sidePanelInitializationPromise;
  } catch (error) {
    sidePanelInitializationPromise = null;
    throw error;
  }
}

function hasSidePanelApi() {
  return Boolean(
    browser.sidePanel &&
    typeof browser.sidePanel.setOptions === 'function' &&
    typeof browser.sidePanel.setPanelBehavior === 'function'
  );
}

ensureContextMenus().catch((error) => {
  console.error('Failed to create context menus', error);
});
ensureSidePanel().catch((error) => {
  console.error('Failed to configure side panel', error);
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    let newBlock = null;
    const pageUrl = info.pageUrl || (tab && tab.url) || null;
    const title = (tab && tab.title) || pageUrl || null;

    if (info.menuItemId === 'save-to-memo') {
      const textToSave = info.selectionText;
      if (textToSave) {
        newBlock = {
          type: 'text',
          branchId: NoteFragmentsStore.DEFAULT_BRANCH_ID,
          content: {
            text: textToSave
          },
          source: {
            pageUrl,
            title,
            selectionText: textToSave
          }
        };
      }
    } else if (info.menuItemId === 'save-image-to-memo') {
      const imageUrl = info.srcUrl;
      if (imageUrl) {
        const imageStorage = await prepareImageStorage(imageUrl);
        newBlock = {
          type: 'image',
          branchId: NoteFragmentsStore.DEFAULT_BRANCH_ID,
          content: {
            imageUrl: imageStorage.previewImageUrl,
            previewImageUrl: imageStorage.previewImageUrl,
            originalImageUrl: imageStorage.originalImageUrl,
            imageMimeType: imageStorage.imageMimeType,
            imageFileName: imageStorage.imageFileName,
            text: pageUrl ? `Source: ${title}` : ''
          },
          source: {
            pageUrl,
            title,
            imageUrl: imageStorage.previewImageUrl,
            previewImageUrl: imageStorage.previewImageUrl,
            originalImageUrl: imageStorage.originalImageUrl,
            imageMimeType: imageStorage.imageMimeType,
            imageFileName: imageStorage.imageFileName
          }
        };
      }
    }

    if (newBlock) {
      await NoteFragmentsStore.saveBlock(newBlock);
    }
  } catch (error) {
    console.error('Failed to save from context menu', error);
  }
});

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

function isDataImageUrl(value) {
  return typeof value === 'string' && /^data:image\//i.test(value);
}

function guessImageMimeType(imageUrl) {
  if (typeof imageUrl !== 'string') {
    return '';
  }

  const dataUrlMatch = /^data:([^;,]+)[;,]/i.exec(imageUrl);
  if (dataUrlMatch) {
    return dataUrlMatch[1].toLowerCase();
  }

  const extMatch = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(imageUrl);
  if (!extMatch) {
    return '';
  }

  const ext = extMatch[1].toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'svg' || ext === 'svgz') return 'image/svg+xml';
  if (ext === 'avif') return 'image/avif';
  return '';
}

function guessImageFileName(imageUrl, mimeType = '') {
  if (typeof imageUrl === 'string') {
    const urlMatch = /\/([^/?#]+)(?:[?#].*)?$/.exec(imageUrl);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
  }

  const ext = guessImageExtension(imageUrl, mimeType);
  return `notefragments-image${ext}`;
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

async function loadImageBlob(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return response.blob();
}

async function createLightweightImageDataUrl(imageUrl, maxSize = 320, quality = 0.84) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return imageUrl;
  }

  const blob = await loadImageBlob(imageUrl);
  const bitmap = await createImageBitmap(blob);

  try {
    const width = bitmap.width || bitmap.naturalWidth || 0;
    const height = bitmap.height || bitmap.naturalHeight || 0;
    if (!width || !height) {
      return imageUrl;
    }

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext('2d');

    if (!context) {
      return imageUrl;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const resizedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality
    });

    return blobToDataUrl(resizedBlob);
  } finally {
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

async function prepareImageStorage(imageUrl) {
  const originalImageUrl = imageUrl;
  const imageMimeType = guessImageMimeType(imageUrl);
  const imageFileName = guessImageFileName(imageUrl, imageMimeType);

  if (!isDataImageUrl(imageUrl)) {
    return {
      originalImageUrl,
      previewImageUrl: imageUrl,
      imageMimeType,
      imageFileName
    };
  }

  try {
    const previewImageUrl = await createLightweightImageDataUrl(imageUrl);
    return {
      originalImageUrl,
      previewImageUrl,
      imageMimeType: imageMimeType || 'image/png',
      imageFileName
    };
  } catch (error) {
    console.error('Failed to create lightweight image preview', error);
    return {
      originalImageUrl,
      previewImageUrl: imageUrl,
      imageMimeType: imageMimeType || 'image/png',
      imageFileName
    };
  }
}
