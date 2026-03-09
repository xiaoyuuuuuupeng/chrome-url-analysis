/**
 * Options Page - LLM API Configuration
 */

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('btnSave').addEventListener('click', saveSettings);
  document.getElementById('btnTest').addEventListener('click', testConnection);
});

async function loadSettings() {
  const data = await new Promise(resolve => {
    chrome.storage.sync.get({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      maxCategories: 10,
      rootFolderName: 'AI分类书签',
      classifyAll: false,
    }, resolve);
  });

  document.getElementById('apiBaseUrl').value = data.apiBaseUrl || '';
  document.getElementById('apiKey').value = data.apiKey || '';
  document.getElementById('modelName').value = data.modelName || '';
  document.getElementById('maxCategories').value = data.maxCategories || 10;
  document.getElementById('rootFolderName').value = data.rootFolderName || 'AI分类书签';
  document.getElementById('classifyAll').checked = !!data.classifyAll;
}

async function saveSettings() {
  const config = {
    apiBaseUrl: document.getElementById('apiBaseUrl').value.trim() || 'https://api.openai.com/v1',
    apiKey: document.getElementById('apiKey').value.trim(),
    modelName: document.getElementById('modelName').value.trim() || 'gpt-4o-mini',
    maxCategories: Math.min(30, Math.max(3, parseInt(document.getElementById('maxCategories').value, 10) || 10)),
    rootFolderName: document.getElementById('rootFolderName').value.trim() || 'AI分类书签',
    classifyAll: document.getElementById('classifyAll').checked,
  };

  await new Promise(resolve => chrome.storage.sync.set(config, resolve));
  showStatus('设置已保存', 'success');
}

async function testConnection() {
  const config = {
    apiBaseUrl: document.getElementById('apiBaseUrl').value.trim() || 'https://api.openai.com/v1',
    apiKey: document.getElementById('apiKey').value.trim(),
    modelName: document.getElementById('modelName').value.trim() || 'gpt-4o-mini',
  };

  if (!config.apiKey) {
    showStatus('请先填写 API Key', 'error');
    return;
  }

  showStatus('正在测试连接...', 'info');

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'TEST_LLM_CONNECTION', config }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });

    if (result.success) {
      showStatus('连接成功！API 配置正确。', 'success');
    } else {
      showStatus(result.error || '连接失败', 'error');
    }
  } catch (err) {
    showStatus(err.message || '测试失败', 'error');
  }
}

function showStatus(text, type) {
  const area = document.getElementById('statusArea');
  const icon = document.getElementById('statusIcon');
  const textEl = document.getElementById('statusText');

  area.style.display = 'flex';
  area.className = 'status-area ' + type;
  textEl.textContent = text;

  if (type === 'success') {
    icon.textContent = '✓';
  } else if (type === 'error') {
    icon.textContent = '✕';
  } else {
    icon.textContent = '';
  }

  setTimeout(() => {
    area.style.display = 'none';
  }, 4000);
}
