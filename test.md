# 本地调试指南

本文档说明如何在本地调试「智能书签管理器」Chrome 扩展。

---

## 一、加载扩展进行调试

### 1. 加载扩展

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 开启右上角 **「开发者模式」**
3. 点击 **「加载已解压的扩展程序」**
4. 选择本项目目录：`e:\work_projects\chrome-url-analysis`
5. 加载成功后，扩展栏会出现插件图标

### 2. 打开开发者工具

| 调试目标 | 打开方式 |
|----------|----------|
| **Popup 面板** | 右键扩展图标 → 「检查弹出内容」 |
| **落地页（新标签页）** | 打开新标签页 → 按 `F12` 或 `Ctrl+Shift+I` |
| **设置页** | 打开设置页 → 按 `F12` |
| **Service Worker** | `chrome://extensions/` → 找到本扩展 → 点击「Service Worker」链接 |

---

## 二、各模块调试方法

### 2.1 Service Worker（后台脚本）

1. 打开 `chrome://extensions/`，找到「智能书签管理器」
2. 点击 **「Service Worker」** 或 **「背景页」** 链接
3. 会打开 DevTools，可在此：
   - 查看 `console.log` 输出
   - 设置断点调试
   - 查看网络请求（LLM API 调用）

**常用调试点：**

- `service-worker.js` 中 `callLLM`：查看发送给 API 的请求体
- `classifyBookmarks`：观察书签读取与分类流程
- 网络面板：确认 API 请求状态码和响应内容

### 2.2 Popup 面板

1. 点击扩展图标打开 Popup
2. 在 Popup 上右键 → **「检查」**
3. 在 DevTools 中可调试 `popup.js`、`popup.css`

**注意**：关闭 Popup 后 DevTools 会关闭，如需保持调试，可先打开 DevTools 再操作 Popup。

### 2.3 落地页（New Tab）

1. 按 `Ctrl+T` 打开新标签页
2. 按 `F12` 打开 DevTools
3. 在 Sources 面板找到 `newtab/newtab.js` 设置断点
4. 在 Console 中可直接调用 `loadBookmarks()` 等函数（若暴露在全局）

### 2.4 设置页

1. 点击扩展图标 → 「配置 AI 设置」，或右键扩展 → 「选项」
2. 在设置页按 `F12` 打开 DevTools
3. 可调试 `options.js` 的表单逻辑和存储

---

## 三、修改代码后的热更新

1. 在 `chrome://extensions/` 页面
2. 找到本扩展，点击 **刷新图标**（圆形箭头）
3. 扩展会重新加载，修改的代码会生效

**建议**：开发时保持 `chrome://extensions/` 页面打开，每次改完代码点一下刷新即可。

---

## 四、常见调试场景

### 4.1 调试 LLM API 调用

1. 打开 Service Worker 的 DevTools
2. 切到 **Network** 面板
3. 在 Popup 中点击「AI 智能分类」
4. 在 Network 中筛选 `chat/completions` 或对应域名
5. 查看 Request Payload 和 Response

### 4.2 调试书签读取

在 Service Worker 的 Console 中执行：

```javascript
chrome.bookmarks.getTree(console.log);
```

可查看完整书签树结构。

### 4.3 调试消息通信

在 `background/service-worker.js` 中临时添加：

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[SW] Received:', msg);
  // ...
});
```

在 Popup 或 New Tab 的 Console 中：

```javascript
chrome.runtime.sendMessage({ type: 'GET_BOOKMARK_STATS' }, console.log);
```

### 4.4 查看存储数据

在任意页面的 Console 中：

```javascript
chrome.storage.sync.get(null, console.log);
```

可查看已保存的 API 配置等。

---

## 五、调试清单

| 步骤 | 操作 |
|------|------|
| 1 | 加载扩展（开发者模式 + 加载已解压） |
| 2 | 配置 API（设置页填写并保存） |
| 3 | 打开 Service Worker DevTools，观察分类时的日志 |
| 4 | 打开 Popup DevTools，测试按钮与统计 |
| 5 | 打开新标签页 DevTools，测试搜索、筛选 |
| 6 | 修改代码后，在扩展页面点击刷新 |

---

## 六、排错提示

- **扩展无法加载**：检查 `manifest.json` 语法，确认路径正确
- **Service Worker 已终止**：点击扩展页的「Service Worker」重新唤醒
- **API 请求失败**：在 Network 面板查看 CORS、401/403 等错误
- **书签无变化**：确认已授予 `bookmarks` 权限，检查 Console 报错
