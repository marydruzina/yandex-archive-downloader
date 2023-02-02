console.log('Content script works!');
console.log('Must reload extension for modifications to take effect.');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Got message: ', message);

  switch (message.type) {
    case 'getImageUrlFromPage':
      getImageUrl(message).then(sendResponse);
      break;

    default:
      break;
  }

  return true;
});

const getImageUrl = async (message) => {
  let status = 'fail';
  let url;
  let filename;

  try {
    const dataElement = document.getElementById('__NEXT_DATA__');
    const data = JSON.parse(dataElement.innerHTML);

    console.log('PAGE DATA', data);

    const breadcrumbs = data?.props?.pageProps?.breadcrumbs;
    const currentNode = data?.props?.pageProps?.currentNode;

    url = `https://ya.ru${currentNode?.originalImagePath}`;
    filename = breadcrumbs.filter(b => !!b.code).map(b => b.code).join('-') + `-${currentNode?.sheetPageNumber}.jpeg`;

    if (url) {
      status = 'success';
    }

    console.log('NODE DATA', currentNode, url, filename);
  } catch (e) {
    console.log('Failed to parse current page data');
  }

  return { type: message.type, status, data: { url, filename } };
};
