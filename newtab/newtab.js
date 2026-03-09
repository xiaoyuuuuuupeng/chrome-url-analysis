/**
 * New Tab Page - Bookmark Display & Management
 */

// ─── State ────────────────────────────────────────────────────────────────────

let allBookmarks = [];
let folderMap = {};
let currentFilter = 'all';
let currentSearch = '';
let viewMode = 'grid'; // 'grid' | 'list'
let searchTimeout = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadBookmarks();
  setupOptionsLink();
});

function setupOptionsLink() {
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim().toLowerCase();
      renderBookmarks();
    }, 150);
  });

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape') searchInput.blur();
  });

  // View toggle
  document.getElementById('viewToggle').addEventListener('click', toggleView);
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadBookmarks() {
  try {
    const [bookmarks, tree] = await Promise.all([
      sendMessage({ type: 'GET_ALL_BOOKMARKS' }),
      new Promise(resolve => chrome.bookmarks.getTree(resolve)),
    ]);

    allBookmarks = bookmarks || [];
    folderMap = buildFolderMap(tree);
    updateStats();
    buildFilterTabs();
    renderBookmarks();
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
    showError();
  }
}

function buildFolderMap(tree) {
  const map = {};
  function traverse(nodes) {
    for (const node of nodes) {
      if (!node.url) map[node.id] = node.title || '未命名文件夹';
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  return map;
}

function updateStats() {
  const count = document.getElementById('bookmarkCount');
  count.textContent = `共 ${allBookmarks.length} 个书签`;
}

function buildFilterTabs() {
  const container = document.getElementById('filterTabs');
  // Collect unique folder names (skip root system folders)
  const systemIds = new Set(['0', '1', '2', '3']);
  const folders = {};
  for (const b of allBookmarks) {
    const pid = b.parentId;
    if (!systemIds.has(pid)) {
      const name = folderMap[pid] || '未分类';
      folders[name] = (folders[name] || 0) + 1;
    }
  }

  // Clear and rebuild
  container.innerHTML = '<button class="filter-tab active" data-folder="all">全部</button>';
  for (const [name, cnt] of Object.entries(folders).sort()) {
    const btn = document.createElement('button');
    btn.className = 'filter-tab';
    btn.dataset.folder = name;
    btn.textContent = `${name} (${cnt})`;
    container.appendChild(btn);
  }

  container.addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.folder;
    renderBookmarks();
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function getFilteredBookmarks() {
  const systemIds = new Set(['0', '1', '2', '3']);
  return allBookmarks.filter(b => {
    // Folder filter
    if (currentFilter !== 'all') {
      const folderName = folderMap[b.parentId] || '未分类';
      if (folderName !== currentFilter) return false;
    }
    // Search filter
    if (currentSearch) {
      const title = (b.title || '').toLowerCase();
      const url = (b.url || '').toLowerCase();
      if (!title.includes(currentSearch) && !url.includes(currentSearch)) return false;
    }
    return true;
  });
}

function renderBookmarks() {
  const filtered = getFilteredBookmarks();
  const grid = document.getElementById('bookmarksGrid');
  const list = document.getElementById('bookmarksList');
  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('resultCount');

  loading.style.display = 'none';
  countEl.textContent = filtered.length > 0 ? `${filtered.length} 个结果` : '';

  if (filtered.length === 0) {
    grid.style.display = 'none';
    list.style.display = 'none';
    empty.style.display = 'flex';
    document.getElementById('emptyDesc').textContent =
      currentSearch ? `未找到包含 "${currentSearch}" 的书签` : '此分类下暂无书签';
    return;
  }

  empty.style.display = 'none';

  if (viewMode === 'grid') {
    grid.style.display = 'grid';
    list.style.display = 'none';
    renderGrid(grid, filtered);
  } else {
    grid.style.display = 'none';
    list.style.display = 'flex';
    renderList(list, filtered);
  }
}

function getFaviconUrl(url) {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
  } catch { return null; }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function createFaviconEl(url, size = 28) {
  const wrapper = document.createElement('div');
  wrapper.className = size === 28 ? 'card-favicon' : 'list-favicon';

  const faviconUrl = getFaviconUrl(url);
  if (faviconUrl) {
    const img = document.createElement('img');
    img.src = faviconUrl;
    img.width = size === 28 ? 16 : 14;
    img.height = size === 28 ? 16 : 14;
    img.onerror = () => {
      img.replaceWith(defaultFaviconSvg());
    };
    wrapper.appendChild(img);
  } else {
    wrapper.appendChild(defaultFaviconSvg());
  }
  return wrapper;
}

function defaultFaviconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  path.setAttribute('cx', '12'); path.setAttribute('cy', '12'); path.setAttribute('r', '10');
  svg.appendChild(path);
  return svg;
}

function renderGrid(container, bookmarks) {
  container.innerHTML = '';

  // Group by folder
  const systemIds = new Set(['0', '1', '2', '3']);
  const groups = {};
  const ungrouped = [];
  for (const b of bookmarks) {
    const pid = b.parentId;
    if (systemIds.has(pid)) {
      ungrouped.push(b);
    } else {
      const name = folderMap[pid] || '未分类';
      if (!groups[name]) groups[name] = [];
      groups[name].push(b);
    }
  }

  // If searching or filtering, show flat
  if (currentSearch || currentFilter !== 'all') {
    for (const b of bookmarks) {
      container.appendChild(createCard(b));
    }
    return;
  }

  // Show grouped
  if (ungrouped.length > 0) {
    const group = createFolderGroup('书签栏', ungrouped, true);
    container.appendChild(group);
  }
  for (const [name, items] of Object.entries(groups).sort()) {
    container.appendChild(createFolderGroup(name, items, false));
  }
}

function createFolderGroup(name, bookmarks, isRoot) {
  const group = document.createElement('div');
  group.className = 'folder-group';
  group.style.gridColumn = '1 / -1';

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML = `
    <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
    <span class="folder-name">${escapeHtml(name)}</span>
    <span class="folder-badge">${bookmarks.length}</span>
  `;
  group.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'bookmarks-grid';
  grid.style.margin = '0';
  for (const b of bookmarks) grid.appendChild(createCard(b));
  group.appendChild(grid);

  return group;
}

function createCard(bookmark) {
  const card = document.createElement('a');
  card.className = 'bookmark-card';
  card.href = bookmark.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';

  const systemIds = new Set(['0', '1', '2', '3']);
  const folderName = systemIds.has(bookmark.parentId) ? '' : (folderMap[bookmark.parentId] || '');

  const header = document.createElement('div');
  header.className = 'card-header';
  header.appendChild(createFaviconEl(bookmark.url, 28));

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = bookmark.title || getDomain(bookmark.url);
  header.appendChild(title);
  card.appendChild(header);

  const url = document.createElement('div');
  url.className = 'card-url';
  url.textContent = getDomain(bookmark.url);
  card.appendChild(url);

  if (folderName) {
    const folder = document.createElement('div');
    folder.className = 'card-folder';
    folder.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      ${escapeHtml(folderName)}
    `;
    card.appendChild(folder);
  }

  return card;
}

function renderList(container, bookmarks) {
  container.innerHTML = '';
  const systemIds = new Set(['0', '1', '2', '3']);

  for (const b of bookmarks) {
    const item = document.createElement('a');
    item.className = 'bookmark-list-item';
    item.href = b.url;
    item.target = '_blank';
    item.rel = 'noopener noreferrer';

    item.appendChild(createFaviconEl(b.url, 24));

    const titleEl = document.createElement('div');
    titleEl.className = 'list-title';
    titleEl.innerHTML = `<span>${escapeHtml(b.title || getDomain(b.url))}</span>`;
    item.appendChild(titleEl);

    const urlEl = document.createElement('div');
    urlEl.className = 'list-url';
    urlEl.textContent = getDomain(b.url);
    item.appendChild(urlEl);

    const folderName = systemIds.has(b.parentId) ? '' : (folderMap[b.parentId] || '');
    if (folderName) {
      const folderEl = document.createElement('div');
      folderEl.className = 'list-folder';
      folderEl.textContent = folderName;
      item.appendChild(folderEl);
    }

    container.appendChild(item);
  }
}

// ─── View Toggle ──────────────────────────────────────────────────────────────

function toggleView() {
  viewMode = viewMode === 'grid' ? 'list' : 'grid';
  document.getElementById('gridIcon').style.display = viewMode === 'grid' ? '' : 'none';
  document.getElementById('listIcon').style.display = viewMode === 'list' ? '' : 'none';
  renderBookmarks();
}

// ─── Error State ──────────────────────────────────────────────────────────────

function showError() {
  document.getElementById('loadingState').style.display = 'none';
  const empty = document.getElementById('emptyState');
  empty.style.display = 'flex';
  document.getElementById('emptyDesc').textContent = '加载书签时出现错误，请刷新页面重试';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Listen for classification completion
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CLASSIFY_PROGRESS' && msg.progress === 100) {
    showToast('书签分类完成！正在刷新...', 'success');
    setTimeout(() => loadBookmarks(), 1500);
  }
});
