/**
 * Popup - Quick actions and stats
 */

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  setupLinks();
  setupClassify();
  loadClassifyOption();
});

function setupLinks() {
  const openNewtab = () => chrome.tabs.create({ url: 'chrome://newtab' });
  const openOptions = () => chrome.runtime.openOptionsPage();

  document.getElementById('openNewtab').addEventListener('click', (e) => {
    e.preventDefault();
    openNewtab();
  });
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
  });
  document.getElementById('openOptions2').addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
  });
}

async function loadStats() {
  try {
    const stats = await sendMessage({ type: 'GET_BOOKMARK_STATS' });
    document.getElementById('statTotal').textContent = stats.total ?? '—';
    document.getElementById('statOrganized').textContent = stats.inFolders ?? '—';
    document.getElementById('statUnorganized').textContent = stats.unorganized ?? '—';
  } catch (err) {
    document.getElementById('statTotal').textContent = '—';
    document.getElementById('statOrganized').textContent = '—';
    document.getElementById('statUnorganized').textContent = '—';
  }
}

function loadClassifyOption() {
  chrome.storage.sync.get({ classifyAll: false }, (data) => {
    document.getElementById('classifyAll').checked = !!data.classifyAll;
  });
}

function setupClassify() {
  const btn = document.getElementById('btnClassify');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const btnText = document.getElementById('btnClassifyText');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '准备中...';

    // Save classifyAll option
    chrome.storage.sync.set({ classifyAll: document.getElementById('classifyAll').checked });

    try {
      const result = await sendMessage({
        type: 'START_CLASSIFY',
        options: { classifyAll: document.getElementById('classifyAll').checked },
      });

      if (result.success) {
        progressBar.style.width = '100%';
        progressText.textContent = `完成！已分类 ${result.classified || 0} 个书签`;
        loadStats();
      } else {
        progressText.textContent = result.error || '分类失败';
        showStatus(result.error, 'error');
      }
    } catch (err) {
      progressText.textContent = err.message || '请求失败';
      showStatus(err.message, 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 2500);
    }
  });
}

// Listen for progress updates from service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CLASSIFY_PROGRESS') {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar) progressBar.style.width = `${msg.progress || 0}%`;
    if (progressText) progressText.textContent = msg.message || '处理中...';
  }
});

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function showStatus(text, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = text;
  el.className = `status-msg ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
