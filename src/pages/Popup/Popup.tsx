import React, { useEffect, useState } from 'react';
import { getCurrentYandexTab } from '../../../utils/chrome-api';
import './Popup.css';

type StatusType = 'request_start' | 'request_success' | 'request_fail' | 'download_success' | 'download_fail';

const Popup = () => {
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | undefined>(undefined);
  const [status, setStatus] = useState<StatusType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    async function checkActiveTab() {
      const currentYandexTab = await getCurrentYandexTab();

      console.log('Popup opened on tab: ', currentYandexTab);

      setCurrentTab(currentYandexTab);
      setShowWarning(!currentYandexTab);
    }

    checkActiveTab();
  }, []);

  useEffect(() => {
    const messagesByStatus = {
      'request_start': 'Поиск изображения...',
      'request_success': 'Изображение найдено. Скачиваю...',
      'request_fail': 'Не удалось найти изображение',
      'download_success': 'Изображение успешно скачено',
      'download_fail': <span>Не удалось скачать изображение. Воспользуйтесь <a href={url as string} download>ссылкой</a>.</span>
    };

    setMessage(status ? messagesByStatus[status] as string : null);
  }, [status]);

  const onCollectClick = () => {
    // Clear before requesting
    setUrl(null);
    setStatus('request_start');

    // Collecting url from Page
    if (currentTab && currentTab.id) {
      chrome.tabs.sendMessage(currentTab.id, { type: 'getImageUrlFromPage' }, response => {
        console.log('Got response: ', response);

        setStatus(`request_${response.status}` as StatusType);
        setUrl(response.data.url);

        downloadImage(response.data.url, response.data.filename);
      });
    }

    // Collecting url from Background
    // chrome.runtime.sendMessage({ type: 'getImageUrlFromBackground' }, response => {
    //   console.log('Got response: ', response);
    //
    //   setStatus(`request_${response.status}` as StatusType);
    //   setUrl(response.data.url);
    //
    //   downloadImage(response.data.url);
    // });
  };

  const downloadImage = (url: string, filename?: string) => {
    if (!url) {
      console.log('There is no image url to download');
      return;
    }

    const urlChunks = currentTab && currentTab.url?.split('/');

    if (!filename && Array.isArray(urlChunks)) {
      // '?' at the end of filename will crash 'chrome.downloads.download' api method
      filename = (urlChunks[urlChunks.length - 1] || '').replace('?', '') + '.jpeg';
    }

    try {
      chrome.downloads.download({ url, filename }, id => {
        setStatus(id ? 'download_success' : 'download_fail');
      });
    } catch (e) {
      setStatus('download_fail');
      console.log(`Failed to download image by url "${url}" with filename "${filename}"`, e);
    }
  }

  return (
    <div className="popup">
      <div className="popup-title">Yandex Archive Downloader</div>

      {showWarning &&
        <div className="popup-warning-message">Сначала перейдите на страницу <a href="https://ya.ru/archive">Яндекс.Архива</a></div>
      }

      {!showWarning &&
        <>
          <button className="popup-download-btn" onClick={onCollectClick}>Скачать</button>

          {message && <div className="popup-message">{message}</div>}
        </>
      }
    </div>
  );
};

export default Popup;
