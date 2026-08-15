import React, { useEffect, useState } from 'react';
import { getCurrentYandexTab } from '../../../utils/chrome-api';
import './Popup.css';

const Popup = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [message, setMessage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [saveText, setSaveText] = useState(localStorage.getItem('saveText') === '1');
  const [savePersons, setSavePersons] = useState(localStorage.getItem('savePersons') === '1');

  useEffect(() => {
    async function checkActiveTab() {
      const currentYandexTab = await getCurrentYandexTab();

      console.log('Popup opened on tab: ', currentYandexTab);

      setShowWarning(!currentYandexTab);

      if (currentYandexTab) {
        // Автогенерация имени файла из заголовка, периода и номера скана на странице
        chrome.runtime.sendMessage({ type: 'suggestFileName' }, response => {
          console.log('Suggested file name: ', response);

          if (response?.data) setFileName(response.data);
        });
      }
    }

    checkActiveTab();
  }, []);

  useEffect(() => {
    localStorage.setItem('saveText', saveText ? '1' : '0');
    localStorage.setItem('savePersons', savePersons ? '1' : '0');
  }, [saveText, savePersons]);

  const onCollectClick = () => {
    setMessage('Получаю оригинал изображения...');

    // Background запускает скачивание оригинала в контексте страницы
    chrome.runtime.sendMessage({ type: 'downloadImage', saveText, savePersons, fileName }, response => {
      console.log('Got response: ', response);

      if (response?.status !== 'success') {
        setMessage('Не удалось скачать изображение. Обновите страницу и попробуйте ещё раз.');
        return;
      }

      const notes = [];
      if (saveText && response.saved?.text === false) notes.push('текст недоступен для этого листа');
      if (savePersons && response.saved?.persons === false) notes.push('списка персон нет для этого листа');

      setMessage('Изображение успешно скачено' + (notes.length ? `, но ${notes.join(', ')}` : ''));
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
          <label className="popup-checkbox">
            <input type="checkbox" checked={saveText} onChange={e => setSaveText(e.target.checked)} />
            Сохранять текст документа
          </label>
          <label className="popup-checkbox">
            <input type="checkbox" checked={savePersons} onChange={e => setSavePersons(e.target.checked)} />
            Сохранять список персон
          </label>

          <input
            className="popup-filename"
            type="text"
            value={fileName}
            placeholder="Имя файла"
            onChange={e => setFileName(e.target.value)}
          />

          <button className="popup-download-btn" onClick={onCollectClick}>Скачать</button>

          {message && <div className="popup-message">{message}</div>}
        </>
      }
    </div>
  );
};

export default Popup;
