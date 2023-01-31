import React, { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import './Popup.css';

const Popup = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [requestingUrl, setRequestingUrl] = useState(false);
  const [currentTab, setCurrentTab] = useState(null);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState(null);
  const [url, setUrl] = useState(null);

  useEffect(() => {
    async function checkActiveTab() {
      const activeTabs = await chrome.tabs.query({ active: true });
      const currentYandexTab = activeTabs.find(tab => (tab.url || '').includes('ya.ru/archive'));

      console.log('Popup opened on tab: ', currentYandexTab);

      setCurrentTab(currentYandexTab);
      setShowWarning(!currentYandexTab);
    }

    checkActiveTab();
  }, []);

  useEffect(() => {
    let msg;

    if (requestingUrl) {
      msg = 'Поиск изображений...';
    } else if (status) {
      if (status === 'success') {
        msg = 'Изображение найдено. Скачиваю...';
      } else {
        msg = 'Не удалось найти ни одного изображения';
      }
    }

    setMessage(msg);
  }, [requestingUrl, status, url]);

  const onCollectClick = () => {
    // Clear before requesting
    setUrl([]);
    setStatus(null);
    setRequestingUrl(true);

    // Collecting urls from Background
    chrome.runtime.sendMessage({ type: 'getImageUrl' }, response => {
      console.log('Got response: ', response);

      setRequestingUrl(false);
      setStatus(response.status);
      setUrl(response.data);

      // Downloading image
      if (response.data) {
        const urlChunks = currentTab.url.split('/');
        const id = urlChunks[urlChunks.length - 1];

        saveAs(response.data, `яндекс архив_${id}`);
      }
    });
  };

  return (
    <div className="popup">
      <div className="popup-title">Yandex Archive Downloader</div>

      {showWarning &&
        <div className="popup-message">Перейдите на страницу Яндекс Архива</div>
      }

      {!showWarning &&
        <>
          <button className="popup-download-btn" onClick={onCollectClick}>Скачать</button>

          {message && <div className="popup-message">{message}</div>}

          {url &&
            <div className="popup-links">
              <a className="popup-link" href={url} download>{url}</a>
            </div>
          }
        </>
      }
    </div>
  );
};

export default Popup;
