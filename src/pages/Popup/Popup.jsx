import React, { useEffect, useState } from 'react';
import { getCurrentYandexTab } from '../../../utils/chrome-api';
import './Popup.css';

const Popup = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [currentTab, setCurrentTab] = useState(null);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState(null);
  const [url, setUrl] = useState(null);

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
      'download_fail': <span>Не удалось скачать изображение. Воспользуйтесь <a href={url} download>ссылкой</a>.</span>
    };

    setMessage(status ? messagesByStatus[status] : null);
  }, [status]);

  const onCollectClick = () => {
    // Clear before requesting
    setUrl(null);
    setStatus('request_start');

    // Collecting urls from Background
    chrome.runtime.sendMessage({ type: 'getImageUrl' }, response => {
      console.log('Got response: ', response);

      setStatus(`request_${response.status}`);
      setUrl(response.data);

      downloadImage(response.data);
    });
  };

  const downloadImage = (url) => {
    if (!url) {
      console.log('There is no image url to download');
      return;
    }

    const urlChunks = currentTab.url.split('/');
    // '?' at the end of filename will crash 'chrome.downloads.download' api method
    const filename = (urlChunks[urlChunks.length - 1] || '').replace('?', '') + '.jpeg';

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
        <div className="popup-message">Сначала перейдите на страницу <a href="https://ya.ru/archive">Яндекс.Архива</a></div>
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
