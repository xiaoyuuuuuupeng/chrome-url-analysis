/**
 * New Tab Page - Bookmark Display & Management
 */

// ─── State ────────────────────────────────────────────────────────────────────

let allBookmarks = [];
let folderMap = {};
let folderChildrenMap = {};  // parentId -> 直接子文件夹 id 数组
let folderParentMap = {};   // folderId -> parentId（用于面包屑与层级）
let bookmarkToRootFolder = {}; // bookmarkId -> 最外层收藏夹 id (1/2/3)
let topLevelFolderIds = new Set(); // 最外层收藏夹 id 集合
let currentSearch = '';
let viewMode = 'grid'; // 'grid' | 'list'
let searchTimeout = null;
let currentFolderId = null; // null = 展示收藏夹列表, 否则展示该文件夹内书签
let theme = 'dark'; // 'dark' | 'light'
let layoutMode = 'centered'; // 'compact' | 'centered'，默认居中
let searchMode = 'web'; // 'web' | 'bookmark'，搜索网页 / 搜索收藏夹
let searchEngineUrl = 'https://cn.bing.com/search?q={q}'; // 可配置，{q} 为关键词占位符
let folderIcons = {}; // folderId -> iconId，用户自定义收藏夹图标

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadUISettings();
  setupEventListeners();
  loadBookmarks();
  setupOptionsLink();
});

async function loadUISettings() {
  const data = await new Promise(resolve => {
    chrome.storage.sync.get({
      newtabTheme: '',
      newtabLayout: 'centered',
      newtabSearchMode: 'web',
      searchEngineUrl: 'https://cn.bing.com/search?q={q}',
      folderIcons: {},
    }, resolve);
  });
  folderIcons = data.folderIcons || {};
  // 优先使用用户保存的主题，否则跟随系统偏好
  if (data.newtabTheme === 'dark' || data.newtabTheme === 'light') {
    theme = data.newtabTheme;
  } else {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  layoutMode = data.newtabLayout || 'centered';
  searchMode = data.newtabSearchMode || 'web';
  searchEngineUrl = data.searchEngineUrl || 'https://cn.bing.com/search?q={q}';
  applyTheme();
  applyLayout();
  applySearchMode();
}

function setupOptionsLink() {
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function setupEventListeners() {
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  // Layout toggle
  document.getElementById('layoutToggle').addEventListener('click', toggleLayout);

  // Search mode tabs
  document.getElementById('searchTabWeb').addEventListener('click', () => setSearchMode('web'));
  document.getElementById('searchTabBookmark').addEventListener('click', () => setSearchMode('bookmark'));

  // Search
  const searchInput = document.getElementById('searchInput');
  const searchForm = document.getElementById('searchForm');
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    if (searchMode === 'web') {
      const url = (searchEngineUrl || 'https://cn.bing.com/search?q={q}').replace('{q}', encodeURIComponent(q));
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      currentSearch = q.toLowerCase();
      renderContent();
    }
  });
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim().toLowerCase();
      if (searchMode === 'bookmark') renderContent();
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

  // Breadcrumb
  document.getElementById('breadcrumbRoot').addEventListener('click', (e) => {
    e.preventDefault();
    currentFolderId = null;
    renderContent();
  });
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  chrome.storage.sync.set({ newtabTheme: theme });
}

function applyTheme() {
  document.body.dataset.theme = theme;
  document.getElementById('themeIconDark').style.display = theme === 'dark' ? '' : 'none';
  document.getElementById('themeIconLight').style.display = theme === 'light' ? '' : 'none';
}

function toggleLayout() {
  layoutMode = layoutMode === 'compact' ? 'centered' : 'compact';
  applyLayout();
  chrome.storage.sync.set({ newtabLayout: layoutMode });
}

function applyLayout() {
  document.body.classList.toggle('layout-centered', layoutMode === 'centered');
  document.getElementById('layoutIconCompact').style.display = layoutMode === 'compact' ? '' : 'none';
  document.getElementById('layoutIconCentered').style.display = layoutMode === 'centered' ? '' : 'none';
}

function setSearchMode(mode) {
  searchMode = mode;
  applySearchMode();
  chrome.storage.sync.set({ newtabSearchMode: mode });
  if (searchMode === 'bookmark') renderContent();
}

function applySearchMode() {
  const tabWeb = document.getElementById('searchTabWeb');
  const tabBookmark = document.getElementById('searchTabBookmark');
  const searchInput = document.getElementById('searchInput');
  tabWeb.classList.toggle('active', searchMode === 'web');
  tabBookmark.classList.toggle('active', searchMode === 'bookmark');
  searchInput.placeholder = searchMode === 'web' ? '搜索网页...' : '搜索收藏夹内的书签...';
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
    folderChildrenMap = buildFolderChildrenMap(tree);
    folderParentMap = buildFolderParentMap(tree);
    const { map, topIds } = buildBookmarkToRootFolder(tree);
    bookmarkToRootFolder = map;
    topLevelFolderIds = topIds;
    updateStats();
    buildFilterTabs();
    renderContent();
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

/** 构建父文件夹 -> 直接子文件夹 id 列表（仅文件夹，不含书签） */
function buildFolderChildrenMap(tree) {
  const map = {};
  function traverse(nodes) {
    for (const node of nodes) {
      if (!node.url) {
        const pid = node.parentId != null ? String(node.parentId) : '0';
        if (!map[pid]) map[pid] = [];
        map[pid].push(node.id);
      }
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  return map;
}

/** 构建文件夹 id -> 父文件夹 id（用于面包屑） */
function buildFolderParentMap(tree) {
  const map = {};
  function traverse(nodes) {
    for (const node of nodes) {
      if (!node.url && node.parentId != null) map[String(node.id)] = String(node.parentId);
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  return map;
}

/** 构建书签到最外层收藏夹的映射，以及最外层收藏夹 id 集合 */
function buildBookmarkToRootFolder(tree) {
  const map = {};
  const topIds = new Set();
  const root = tree[0];
  if (!root?.children) return { map, topIds };

  function traverse(nodes, rootFolderId) {
    for (const node of nodes) {
      if (node.url) {
        map[node.id] = rootFolderId;
      }
      if (node.children) traverse(node.children, rootFolderId);
    }
  }

  for (const child of root.children) {
    if (!child.url) {
      topIds.add(String(child.id));
      traverse(child.children || [], child.id);
    }
  }
  return { map, topIds };
}

function updateStats() {
  const count = document.getElementById('bookmarkCount');
  count.textContent = `共 ${allBookmarks.length} 个书签`;
}

function buildFilterTabs() {
  // 根视图只展示收藏夹，无需筛选标签
  const container = document.getElementById('filterTabs');
  container.innerHTML = '';
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** 获取直接放在最外层收藏夹下的书签（未放入子文件夹的 URL） */
function getTopLevelDirectBookmarks() {
  return allBookmarks.filter(b =>
    topLevelFolderIds.has(String(b.parentId))
  );
}

/** 只返回最外层收藏夹（书签栏、其他书签等），不包含子收藏夹 */
function getFoldersList() {
  const folderCounts = {};
  for (const rootId of topLevelFolderIds) {
    const name = folderMap[rootId] || (rootId === '1' ? '书签栏' : rootId === '2' ? '其他书签' : rootId === '3' ? '移动设备书签' : '未命名');
    let count = 0;
    for (const b of allBookmarks) {
      if (String(bookmarkToRootFolder[b.id]) === String(rootId)) count++;
    }
    folderCounts[rootId] = { id: rootId, name, count };
  }
  let folders = Object.values(folderCounts);
  if (currentSearch && searchMode === 'bookmark') {
    const q = currentSearch;
    folders = folders.filter(f => f.name.toLowerCase().includes(q));
  }
  return folders.sort((a, b) => (a.id === '1' ? -1 : b.id === '1' ? 1 : a.name.localeCompare(b.name)));
}

/** 当前文件夹下的直接子文件夹列表（用于二级展示） */
function getDirectSubfolders(folderId) {
  const ids = folderChildrenMap[String(folderId)] || [];
  return ids.map(id => ({
    id,
    name: folderMap[id] || '未命名',
    count: countBookmarksInFolder(id),
  })).filter(f => f.name);
}

/** 当前文件夹下的直接书签（不包含子文件夹内的） */
function getDirectBookmarksInFolder(folderId) {
  return allBookmarks.filter(b => String(b.parentId) === String(folderId));
}

/** 递归统计某文件夹内书签数量（含子文件夹） */
function countBookmarksInFolder(folderId) {
  const direct = getDirectBookmarksInFolder(folderId).length;
  const childIds = folderChildrenMap[String(folderId)] || [];
  const fromChildren = childIds.reduce((sum, id) => sum + countBookmarksInFolder(id), 0);
  return direct + fromChildren;
}

/** 面包屑路径：从根到当前文件夹的 { id, name } 数组（不含根节点 0） */
function getBreadcrumbPath(folderId) {
  const path = [];
  let id = String(folderId);
  while (id && id !== '0') {
    path.unshift({ id, name: folderMap[id] || (id === '1' ? '书签栏' : id === '2' ? '其他书签' : id === '3' ? '移动设备书签' : '未命名') });
    id = folderParentMap[id] || '';
  }
  return path;
}

/** 当前视图下的书签列表：在文件夹内时仅当前文件夹的直接书签，按搜索过滤 */
function getFilteredBookmarks() {
  return allBookmarks.filter(b => {
    if (currentFolderId !== null && String(b.parentId) !== String(currentFolderId)) return false;
    if (currentSearch && searchMode === 'bookmark') {
      const title = (b.title || '').toLowerCase();
      const url = (b.url || '').toLowerCase();
      if (!title.includes(currentSearch) && !url.includes(currentSearch)) return false;
    }
    return true;
  });
}

function renderContent() {
  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');
  const foldersGrid = document.getElementById('foldersGrid');
  const bookmarksGrid = document.getElementById('bookmarksGrid');
  const bookmarksList = document.getElementById('bookmarksList');
  const countEl = document.getElementById('resultCount');
  const filterBar = document.querySelector('.filter-bar');
  const breadcrumb = document.getElementById('folderBreadcrumb');
  const landingFoldersWrap = document.getElementById('landingFoldersWrap');
  const topLevelBookmarksWrap = document.getElementById('topLevelBookmarksWrap');
  const topLevelBookmarksEl = document.getElementById('topLevelBookmarks');

  loading.style.display = 'none';

  // 根视图：展示收藏夹信息 + 最外层直接收藏的 URL
  if (currentFolderId === null) {
    const folders = getFoldersList();
    const directBookmarks = getTopLevelDirectBookmarks();
    bookmarksGrid.style.display = 'none';
    bookmarksList.style.display = 'none';
    breadcrumb.style.display = 'none';
    filterBar.style.display = 'none';
    document.getElementById('viewToggle').style.display = 'none';
    const fv = document.getElementById('folderViewContent');
    if (fv) fv.style.display = 'none';
    document.getElementById('bookmarkCount').textContent =
      folders.length > 0 ? `${folders.length} 个收藏夹 · ${allBookmarks.length} 个书签` : '暂无收藏夹';

    if (folders.length === 0 && directBookmarks.length === 0) {
      landingFoldersWrap.style.display = 'none';
      topLevelBookmarksWrap.style.display = 'none';
      empty.style.display = 'flex';
      document.getElementById('emptyDesc').textContent =
        currentSearch ? `未找到包含 "${currentSearch}" 的收藏夹` : '暂无收藏夹';
      return;
    }

    empty.style.display = 'none';

    // 收藏夹列表
    if (folders.length > 0) {
      landingFoldersWrap.style.display = 'block';
      foldersGrid.innerHTML = '';
      for (const folder of folders) {
        const iconId = folderIcons[folder.id] || ToastFolderIcons.DEFAULT_ICON;
        const iconSvg = ToastFolderIcons.getIconSvg(iconId, 24);
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.dataset.folderId = folder.id;
        card.innerHTML = `
          <div class="folder-card-icon">
            ${iconSvg}
          </div>
          <span class="folder-card-name">${escapeHtml(folder.name)}</span>
          <span class="folder-card-count">${folder.count} 个书签</span>
        `;
        card.addEventListener('click', (e) => {
          e.preventDefault();
          currentFolderId = folder.id;
          renderContent();
        });
        foldersGrid.appendChild(card);
      }
    } else {
      landingFoldersWrap.style.display = 'none';
    }

    // 最外层直接收藏的 URL
    if (directBookmarks.length > 0) {
      topLevelBookmarksWrap.style.display = 'block';
      topLevelBookmarksEl.innerHTML = '';
      for (const b of directBookmarks) {
        const folderName = folderMap[b.parentId] || (b.parentId === '1' ? '书签栏' : b.parentId === '2' ? '其他书签' : '');
        const a = document.createElement('a');
        a.className = 'top-level-link';
        a.href = b.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.appendChild(createFaviconEl(b.url, 20));
        const text = document.createElement('span');
        text.className = 'top-level-link-text';
        text.textContent = b.title || getDomain(b.url);
        a.appendChild(text);
        if (folderName) {
          const badge = document.createElement('span');
          badge.className = 'top-level-link-folder';
          badge.textContent = folderName;
          a.appendChild(badge);
        }
        topLevelBookmarksEl.appendChild(a);
      }
    } else {
      topLevelBookmarksWrap.style.display = 'none';
    }
    return;
  }

  // 文件夹内：展示二级子收藏夹 + 直接书签
  if (document.getElementById('landingFoldersWrap')) document.getElementById('landingFoldersWrap').style.display = 'none';
  if (document.getElementById('topLevelBookmarksWrap')) document.getElementById('topLevelBookmarksWrap').style.display = 'none';
  filterBar.style.display = 'flex';
  document.getElementById('bookmarkCount').textContent = `共 ${allBookmarks.length} 个书签`;
  document.getElementById('viewToggle').style.display = '';
  const folderViewContent = document.getElementById('folderViewContent');
  if (folderViewContent) folderViewContent.style.display = 'block';

  // 面包屑：收藏夹 / 一级 / 二级（可点击返回）
  breadcrumb.style.display = 'flex';
  const path = getBreadcrumbPath(currentFolderId);
  const pathEl = document.getElementById('breadcrumbPath');
  if (pathEl) {
    pathEl.innerHTML = '';
    for (let i = 0; i < path.length; i++) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = ' / ';
        pathEl.appendChild(sep);
      }
      const seg = path[i];
      if (i < path.length - 1) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = seg.name;
        a.dataset.folderId = seg.id;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          currentFolderId = seg.id;
          renderContent();
        });
        pathEl.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = 'breadcrumb-current';
        span.textContent = seg.name;
        pathEl.appendChild(span);
      }
    }
  }

  const subfolders = getDirectSubfolders(currentFolderId);
  const filtered = getFilteredBookmarks();
  const subfoldersSection = document.getElementById('subfoldersSection');
  const subfoldersGrid = document.getElementById('subfoldersGrid');

  if (subfoldersSection && subfoldersGrid) {
    if (subfolders.length > 0) {
      subfoldersSection.style.display = 'block';
      subfoldersGrid.innerHTML = '';
      for (const folder of subfolders) {
        const iconId = folderIcons[folder.id] || ToastFolderIcons.DEFAULT_ICON;
        const iconSvg = ToastFolderIcons.getIconSvg(iconId, 24);
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.dataset.folderId = folder.id;
        card.innerHTML = `
          <div class="folder-card-icon">
            ${iconSvg}
          </div>
          <span class="folder-card-name">${escapeHtml(folder.name)}</span>
          <span class="folder-card-count">${folder.count} 个书签</span>
        `;
        card.addEventListener('click', (e) => {
          e.preventDefault();
          currentFolderId = folder.id;
          renderContent();
        });
        subfoldersGrid.appendChild(card);
      }
    } else {
      subfoldersSection.style.display = 'none';
    }
  }

  countEl.textContent = filtered.length > 0 ? `${filtered.length} 个书签` : '';

  if (subfolders.length === 0 && filtered.length === 0) {
    bookmarksGrid.style.display = 'none';
    bookmarksList.style.display = 'none';
    empty.style.display = 'flex';
    document.getElementById('emptyDesc').textContent =
      currentSearch ? `未找到包含 "${currentSearch}" 的书签` : '此收藏夹暂无子收藏夹和书签';
    return;
  }

  empty.style.display = 'none';

  if (filtered.length > 0) {
    if (viewMode === 'grid') {
      bookmarksGrid.style.display = 'grid';
      bookmarksList.style.display = 'none';
      renderGrid(bookmarksGrid, filtered);
    } else {
      bookmarksGrid.style.display = 'none';
      bookmarksList.style.display = 'flex';
      renderList(bookmarksList, filtered);
    }
  } else {
    bookmarksGrid.style.display = 'none';
    bookmarksList.style.display = 'none';
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
  // 文件夹内视图或搜索时：平铺展示
  for (const b of bookmarks) {
    container.appendChild(createCard(b));
  }
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
  renderContent();
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
