import { getCurrentYandexTab } from '../../../utils/chrome-api';

let collectedUrls = new Map(); // { [tabId]: url }

chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log('Completed request: ', details);

    if (details.url.endsWith('type=original')) {
      collectedUrls.set(details.tabId, details.url);
      console.log('All collected urls: ', collectedUrls);
    }
  },
  {
    urls: ['https://ya.ru/archive/api/image*', 'https://yandex.ru/archive/api/image*']
  }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Got message: ', message);

  switch (message.type) {
    case 'getImageUrl':
      getImageUrl(message).then(sendResponse);
      break;

    default:
      break;
  }

  return true;
});

const getImageUrl = async (message) => {
  const currentYandexTab = await getCurrentYandexTab();
  let status = 'fail';
  let url;

  if (currentYandexTab) {
    console.log('Current open tab with Yandex Archive: ', currentYandexTab);

    url = collectedUrls.get(currentYandexTab.id);

    if (url) {
      status = 'success';
    } else {
      console.log('There is no intercepted image url for this tab');
    }
  } else {
    console.log('There is no open tab with Yandex Archive');
  }

  console.log(`Sending response for ${message.type}: `, url);

  return { type: message.type, status, data: url };
}
