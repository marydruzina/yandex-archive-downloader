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

    case 'suggestFileName':
      suggestFileName(message).then(sendResponse);
      break;

    default:
      break;
  }

  return true;
});

// Выполняется в контексте страницы: собирает имя файла вида
// "Москва Сретенский Сорок 1821 - скан 369" из заголовка, периода и номера скана.
const suggestFileNameInPage = () => {
  const bodyText = document.body.innerText || '';

  // "ЦГА Москвы, фонд №203, опись №745, дело №234, скан №369" → 369
  const scanMatch = bodyText.match(/скан №(\d+)/);
  const scanNumber = scanMatch
    ? scanMatch[1]
    : (location.pathname.split('/').filter(Boolean).pop() || '');

  // "1 января 1821 — 31 декабря 1821" → "1821" (или "1821-1830" для разных лет)
  const periodMatch = bodyText.match(/\d{1,2}\s+[а-яё]+\s+(\d{4})\s*—\s*\d{1,2}\s+[а-яё]+\s+(\d{4})/i);
  let years = '';
  if (periodMatch) {
    years = periodMatch[1] === periodMatch[2] ? periodMatch[1] : `${periodMatch[1]}-${periodMatch[2]}`;
  }

  // "МЕТРИЧЕСКИЕ КНИГИ МОСКВА СРЕТЕНСКИЙ СОРОК" → "Москва Сретенский Сорок"
  let title = (document.querySelector('h1')?.textContent || '').trim();
  const docTypes = /^(метрические книги|метрическая книга|ревизские сказки|ревизская сказка|исповедные ведомости|исповедная ведомость|описи|опись)\s+/i;
  title = title.replace(docTypes, '').trim();
  title = title
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  const name = [title, years, scanNumber && `- скан ${scanNumber}`].filter(Boolean).join(' ');
  return name || null;
};

const suggestFileName = async (message) => {
  const currentYandexTab = await getCurrentYandexTab();
  if (!currentYandexTab) return { type: message.type, status: 'fail' };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentYandexTab.id },
      func: suggestFileNameInPage
    });

    return { type: message.type, status: 'success', data: results?.[0]?.result || null };
  } catch (e) {
    console.log('Failed to suggest file name', e);
    return { type: message.type, status: 'fail' };
  }
}

// Выполняется в контексте страницы Яндекс.Архива: получает грант на оригинал,
// скачивает картинку с токеном и отдаёт её пользователю как файл. По флагам
// дополнительно сохраняет рядом текст разметки и список персон как JSON.
const downloadOriginalInPage = async (nodeId, options) => {
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

  const saveBlob = (blob, filename) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  };

  // GET-эндпоинты вида /archive/api/markup?id=…: при отсутствии данных отвечают { success: false }
  const fetchJson = async (path, id) => {
    const response = await fetch(`${path}?${new URLSearchParams({ id })}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    if (!response.ok) return null;

    const data = await response.json();
    return data && data.success !== false ? data : null;
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

    const urlChunks = location.pathname.split('/').filter(Boolean);
    const sanitizedName = (options?.fileName || '').replace(/[\\/:*?"<>|]/g, '').trim();
    const baseName = sanitizedName || urlChunks[urlChunks.length - 1] || 'image';
    saveBlob(await imageResponse.blob(), baseName + '.jpeg');

    const saved = { image: true, text: null, persons: null };

    if (options?.saveText) {
      const markup = await fetchJson('/archive/api/markup', id);
      saved.text = !!markup;
      if (markup) {
        saveBlob(new Blob([JSON.stringify(markup, null, 2)], { type: 'application/json' }), baseName + '.markup.json');
      }
    }

    if (options?.savePersons) {
      const structured = await fetchJson('/archive/api/structuredMarkup', id);
      saved.persons = !!(structured && structured.entries?.length);
      if (saved.persons) {
        saveBlob(new Blob([JSON.stringify(structured, null, 2)], { type: 'application/json' }), baseName + '.persons.json');
      }
    }

    return { status: 'success', saved };
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
      args: [nodeId, {
        saveText: !!message.saveText,
        savePersons: !!message.savePersons,
        fileName: message.fileName || null
      }]
    });

    const result = results?.[0]?.result || { status: 'fail', error: 'no result' };
    console.log(`Sending response for ${message.type}: `, result);

    return { type: message.type, ...result };
  } catch (e) {
    console.log('Failed to execute script in page', e);
    return { type: message.type, status: 'fail', error: String(e) };
  }
}
