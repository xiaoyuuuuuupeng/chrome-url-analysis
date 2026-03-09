/**
 * Chrome Extension Service Worker
 * Handles bookmark operations and LLM API calls
 */

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_BOOKMARK_STATS':
      getBookmarkStats().then(sendResponse);
      return true;
    case 'GET_ALL_BOOKMARKS':
      getAllBookmarksFlat().then(sendResponse);
      return true;
    case 'START_CLASSIFY':
      classifyBookmarks(message.options || {})
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    case 'TEST_LLM_CONNECTION':
      testLLMConnection(message.config)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ─── Bookmark Utilities ───────────────────────────────────────────────────────

async function getBookmarkTree() {
  return new Promise(resolve => chrome.bookmarks.getTree(resolve));
}

async function getAllBookmarksFlat() {
  const tree = await getBookmarkTree();
  const bookmarks = [];
  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          parentId: node.parentId,
          dateAdded: node.dateAdded,
        });
      }
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  return bookmarks;
}

async function getFolderMap() {
  const tree = await getBookmarkTree();
  const folders = {};
  function traverse(nodes) {
    for (const node of nodes) {
      if (!node.url) {
        folders[node.id] = { id: node.id, title: node.title, parentId: node.parentId };
      }
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  return folders;
}

async function getBookmarkStats() {
  const tree = await getBookmarkTree();
  let total = 0, inFolders = 0;
  const rootIds = new Set();

  // Root-level folder IDs (direct children of "Bookmarks bar" and "Other bookmarks")
  function getRootFolderChildren(nodes, depth = 0) {
    for (const node of nodes) {
      if (depth === 1 && !node.url) rootIds.add(node.id);
      if (node.children) getRootFolderChildren(node.children, depth + 1);
    }
  }

  function countBookmarks(nodes, depth = 0) {
    for (const node of nodes) {
      if (node.url) {
        total++;
        // depth >= 2 means it's inside at least one folder
        if (depth >= 2) inFolders++;
      }
      if (node.children) countBookmarks(node.children, depth + 1);
    }
  }

  getRootFolderChildren(tree);
  countBookmarks(tree);
  return { total, inFolders, unorganized: total - inFolders };
}

async function getUnorganizedBookmarks() {
  const tree = await getBookmarkTree();
  const bookmarks = [];

  function traverse(nodes, depth = 0) {
    for (const node of nodes) {
      if (node.url && depth <= 2) {
        // depth 2 means direct child of Bookmarks bar or Other bookmarks (not in a sub-folder)
        bookmarks.push({ id: node.id, title: node.title || node.url, url: node.url });
      }
      if (node.children) traverse(node.children, depth + 1);
    }
  }
  traverse(tree);
  return bookmarks;
}

// ─── LLM API ──────────────────────────────────────────────────────────────────

async function getLLMConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      maxCategories: 10,
      rootFolderName: 'AI分类书签',
      classifyAll: false,
    }, resolve);
  });
}

async function callLLM(config, prompt) {
  const url = `${config.apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        {
          role: 'system',
          content: `你是一个书签分类助手。根据用户提供的书签列表，将每个书签分配到合适的类别中。
类别名称应简洁（2-6个汉字或英文词），不超过 ${config.maxCategories} 个类别。
必须返回合法的 JSON 格式，不要有任何额外说明。`
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API 错误 (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM 返回内容为空');
  return JSON.parse(content);
}

async function testLLMConnection(config) {
  try {
    const url = `${config.apiBaseUrl.replace(/\/$/, '')}/models`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { success: true };
  } catch (err) {
    // Fallback: try a minimal chat completion
    try {
      await callLLM(config, '请回复：{"status":"ok"}');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ─── Classification Engine ────────────────────────────────────────────────────

const BATCH_SIZE = 30; // bookmarks per LLM request

function buildClassifyPrompt(bookmarks) {
  const list = bookmarks.map((b, i) =>
    `${i + 1}. ID:${b.id} | 标题:${b.title} | URL:${b.url}`
  ).join('\n');

  return `请对以下 ${bookmarks.length} 个书签进行分类，返回 JSON 格式：
{
  "categories": [
    {
      "name": "类别名称",
      "bookmarkIds": ["书签ID1", "书签ID2"]
    }
  ]
}

书签列表：
${list}`;
}

async function ensureRootFolder(rootFolderName) {
  const tree = await getBookmarkTree();
  // Search in "Other Bookmarks" (id=2) first, then Bookmarks bar (id=1)
  for (const root of tree[0].children || []) {
    for (const child of root.children || []) {
      if (!child.url && child.title === rootFolderName) {
        return child.id;
      }
    }
  }
  // Create in "Other Bookmarks"
  const otherBookmarks = tree[0].children?.find(n => n.id === '2') || tree[0].children?.[1];
  const parentId = otherBookmarks?.id || '1';
  const folder = await new Promise(resolve =>
    chrome.bookmarks.create({ parentId, title: rootFolderName }, resolve)
  );
  return folder.id;
}

async function ensureSubFolder(parentId, name) {
  const children = await new Promise(resolve =>
    chrome.bookmarks.getChildren(parentId, resolve)
  );
  const existing = children.find(c => !c.url && c.title === name);
  if (existing) return existing.id;
  const folder = await new Promise(resolve =>
    chrome.bookmarks.create({ parentId, title: name }, resolve)
  );
  return folder.id;
}

async function moveBookmark(bookmarkId, destFolderId) {
  return new Promise(resolve =>
    chrome.bookmarks.move(bookmarkId, { parentId: destFolderId }, resolve)
  );
}

function broadcastProgress(message, progress, total) {
  chrome.runtime.sendMessage({
    type: 'CLASSIFY_PROGRESS',
    message,
    progress,
    total,
  }).catch(() => {}); // popup may be closed
}

async function classifyBookmarks(options = {}) {
  const config = await getLLMConfig();
  if (!config.apiKey) throw new Error('请先在设置页面配置 API Key');

  const classifyAll = options.classifyAll ?? config.classifyAll;

  broadcastProgress('正在读取书签...', 0, 100);

  const bookmarks = classifyAll
    ? await getAllBookmarksFlat()
    : await getUnorganizedBookmarks();

  if (bookmarks.length === 0) {
    return { classified: 0, categories: [], message: '没有需要分类的书签' };
  }

  broadcastProgress(`共 ${bookmarks.length} 个书签，开始分类...`, 5, 100);

  const rootFolderId = await ensureRootFolder(config.rootFolderName);
  const categoryFolderMap = {}; // name → folderId
  let totalClassified = 0;
  const allCategories = [];

  // Process in batches
  const batches = [];
  for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
    batches.push(bookmarks.slice(i, i + BATCH_SIZE));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const progressStart = 10 + (bi / batches.length) * 80;
    broadcastProgress(
      `正在分类第 ${bi + 1}/${batches.length} 批（${batch.length} 个书签）...`,
      progressStart,
      100
    );

    const prompt = buildClassifyPrompt(batch);
    let result;
    try {
      result = await callLLM(config, prompt);
    } catch (err) {
      console.error('LLM batch error:', err);
      throw new Error(`第 ${bi + 1} 批分类失败：${err.message}`);
    }

    const categories = result.categories || [];
    for (const cat of categories) {
      const catName = (cat.name || '其他').trim();
      if (!categoryFolderMap[catName]) {
        categoryFolderMap[catName] = await ensureSubFolder(rootFolderId, catName);
        allCategories.push(catName);
      }
      const folderId = categoryFolderMap[catName];
      for (const id of (cat.bookmarkIds || [])) {
        try {
          await moveBookmark(String(id), folderId);
          totalClassified++;
        } catch (e) {
          console.warn(`Move bookmark ${id} failed:`, e);
        }
      }
    }
  }

  broadcastProgress('分类完成！', 100, 100);
  return { classified: totalClassified, categories: allCategories };
}
