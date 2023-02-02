export const getCurrentTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const activeTabs = await chrome.tabs.query({ active: true });

  return activeTabs.length > 0 ? activeTabs[0] : undefined;
}

export const getCurrentYandexTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const activeTabs = await chrome.tabs.query({ active: true });
  const currentYandexTab = activeTabs.find(tab =>
    (tab.url || '').includes('ya.ru/archive') || (tab.url || '').includes('yandex.ru/archive'));

  return currentYandexTab;
}
