import { getCurrentYandexTab } from '../../../utils/chrome-api';

let collectedNodeIds = new Map(); // { [tabId]: nodeId }

// Страница грузит превью/миниатюры через /archive/api/image?id=<nodeId>&type=...
// Перехватываем эти запросы, чтобы знать nodeId текущего листа.
chrome.webRequest.onCompleted.addListener(
  (details) => {
    try {
      const nodeId = new URL(details.url).searchParams.get('id');

      if (nodeId && details.tabId >= 0) {
        collectedNodeIds.set(details.tabId, nodeId);
        console.log('Collected nodeId for tab', details.tabId, ':', nodeId);
      }
    } catch (e) {
      console.log('Failed to parse url: ', details.url, e);
    }
  },
  {
    urls: ['https://ya.ru/archive/api/image*', 'https://yandex.ru/archive/api/image*']
  }
);

chrome.tabs.onRemoved.addListener(tabId => collectedNodeIds.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Got message: ', message);

  switch (message.type) {
    case 'downloadImage':
      downloadImage(message).then(sendResponse);
      break;

    default:
      break;
  }

  return true;
});

// Выполняется в контексте страницы Яндекс.Архива: получает грант на оригинал,
// скачивает картинку с токеном и отдаёт её пользователю как файл.
const downloadOriginalInPage = async (nodeId) => {
  const findDocId = () => {
    // Fallback: достаём docId из данных Next.js, если запрос превью не был перехвачен
    const nextData = document.querySelector('#__NEXT_DATA__');
    if (!nextData) return null;

    let found = null;
    const walk = (obj) => {
      if (found || !obj || typeof obj !== 'object') return;
      if (typeof obj.docId === 'string') {
        found = obj.docId;
        return;
      }
      Object.values(obj).forEach(walk);
    };

    try {
      walk(JSON.parse(nextData.textContent).props);
    } catch (e) {
      return null;
    }

    return found;
  };

  try {
    const id = nodeId || findDocId();
    if (!id) return { status: 'fail', error: 'nodeId not found' };

    const grantResponse = await fetch('/archive/api/image-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nodeId: id, type: 'original' })
    });
    if (!grantResponse.ok) return { status: 'fail', error: `image-grant: status ${grantResponse.status}` };

    const { url, token } = await grantResponse.json();
    if (!url || !token) return { status: 'fail', error: 'image-grant: malformed response' };

    const imageResponse = await fetch(url, {
      headers: { 'X-Archive-Image-Token': token },
      credentials: 'include'
    });
    const contentType = imageResponse.headers.get('content-type') || '';
    if (!imageResponse.ok || contentType.includes('application/json')) {
      return { status: 'fail', error: `image: status ${imageResponse.status}` };
    }

    const blob = await imageResponse.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const urlChunks = location.pathname.split('/').filter(Boolean);
    link.href = objectUrl;
    link.download = (urlChunks[urlChunks.length - 1] || 'image') + '.jpeg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    return { status: 'success' };
  } catch (e) {
    return { status: 'fail', error: String(e) };
  }
};

const downloadImage = async (message) => {
  const currentYandexTab = await getCurrentYandexTab();

  if (!currentYandexTab) {
    console.log('There is no open tab with Yandex Archive');
    return { type: message.type, status: 'fail', error: 'no tab' };
  }

  const nodeId = collectedNodeIds.get(currentYandexTab.id) || null;
  console.log('Downloading original for tab', currentYandexTab.id, 'nodeId:', nodeId);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentYandexTab.id },
      func: downloadOriginalInPage,
      args: [nodeId]
    });

    const result = results?.[0]?.result || { status: 'fail', error: 'no result' };
    console.log(`Sending response for ${message.type}: `, result);

    return { type: message.type, ...result };
  } catch (e) {
    console.log('Failed to execute script in page', e);
    return { type: message.type, status: 'fail', error: String(e) };
  }
}
