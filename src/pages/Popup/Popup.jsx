import React, { useEffect, useState } from 'react';
import { getCurrentYandexTab } from '../../../utils/chrome-api';
import './Popup.css';

const Popup = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    async function checkActiveTab() {
      const currentYandexTab = await getCurrentYandexTab();

      console.log('Popup opened on tab: ', currentYandexTab);

      setShowWarning(!currentYandexTab);
    }

    checkActiveTab();
  }, []);

  useEffect(() => {
    const messagesByStatus = {
      'download_start': 'Получаю оригинал изображения...',
      'download_success': 'Изображение успешно скачено',
      'download_fail': 'Не удалось скачать изображение. Обновите страницу и попробуйте ещё раз.'
    };

    setMessage(status ? messagesByStatus[status] : null);
  }, [status]);

  const onCollectClick = () => {
    setStatus('download_start');

    // Background запускает скачивание оригинала в контексте страницы
    chrome.runtime.sendMessage({ type: 'downloadImage' }, response => {
      console.log('Got response: ', response);

      setStatus(response?.status === 'success' ? 'download_success' : 'download_fail');
    });
  };

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
