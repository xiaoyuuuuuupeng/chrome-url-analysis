# 智能书签管理器 - 部署与打包文档

本文档说明如何打包、发布和部署本 Chrome 扩展。

---

## 一、本地打包

### 1.1 打包前检查

确认以下内容无误：

- [ ] `manifest.json` 中 `version` 已更新
- [ ] 图标文件存在：`icons/icon16.png`、`icons/icon48.png`、`icons/icon128.png`
- [ ] 无调试代码（如 `console.log` 等）或已移除
- [ ] 所有依赖为 CDN 或本地资源，无外部 npm 构建

### 1.2 生成图标（如缺失）

若图标文件缺失，可重新生成：

```bash
cd icons
node make-icons.js
```

### 1.3 打包为 ZIP

**Windows：**

```powershell
# 在项目根目录执行
Compress-Archive -Path manifest.json, icons, newtab, popup, options, background -DestinationPath chrome-url-analysis-v1.0.0.zip
```

**macOS / Linux：**

```bash
zip -r chrome-url-analysis-v1.0.0.zip manifest.json icons newtab popup options background
```

**排除不需要的文件：**

```bash
zip -r chrome-url-analysis-v1.0.0.zip manifest.json icons newtab popup options background \
  -x "*.git*" -x "*.md" -x "icons/make-icons.js" -x "*.DS_Store"
```

### 1.4 打包目录结构

ZIP 内应包含：

```
chrome-url-analysis-v1.0.0.zip
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── newtab/
│   ├── newtab.html
│   ├── newtab.css
│   └── newtab.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── background/
    └── service-worker.js
```

---

## 二、开发者模式加载

### 2.1 加载已解压扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目根目录 `chrome-url-analysis`

### 2.2 加载 ZIP 包

1. 将 ZIP 解压到任意目录
2. 按「加载已解压的扩展程序」选择解压后的文件夹

---

## 三、发布到 Chrome 网上应用店

### 3.1 前提条件

- 注册 [Chrome 开发者账号](https://chrome.google.com/webstore/devconsole)（一次性费用约 $5）
- 准备好隐私政策 URL（如使用外部 API）
- 准备好应用商店截图（至少 1 张，建议 1280×800 或 640×400）

### 3.2 打包要求

- 上传文件为 ZIP，大小不超过 100MB
- 仅包含 manifest 及所需资源，不包含 `.git`、`README`、`DEPLOY.md` 等

### 3.3 发布流程

1. 登录 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole)
2. 点击「新项目」
3. 上传 ZIP 包
4. 填写商店信息：
   - 应用名称
   - 简短描述（132 字符内）
   - 详细描述
   - 分类：选择「生产力」或「工具」
   - 上传图标（128×128、48×48、16×16）
   - 上传截图
5. 隐私设置：
   - 选择「单一用途」或「多项用途」
   - 填写隐私政策 URL（若使用）
6. 权限说明：解释 `bookmarks`、`storage`、`host_permissions` 的用途
7. 提交审核

### 3.4 版本更新

1. 在 `manifest.json` 中更新 `version`
2. 重新打包 ZIP
3. 在开发者控制台点击「更新」→ 上传新 ZIP
4. 填写更新说明后提交

---

## 四、版本管理

### 4.1 版本号格式

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`

- 主版本：不兼容的 API 变更
- 次版本：功能新增
- 修订号：问题修复

### 4.2 修改版本

编辑 `manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "智能书签管理器",
  "version": "1.0.0",
  ...
}
```

---

## 五、企业 / 内网部署

### 5.1 强制安装策略（Windows）

通过组策略或注册表部署：

1. 创建策略文件或使用注册表：

```
[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist]
"1" = "扩展ID;https://your-update-url.com/updates.xml"
```

2. 扩展 ID 获取：在 `chrome://extensions/` 中加载扩展后查看

### 5.2 内网更新服务器

若需自建更新服务，需提供 `updates.xml`：

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='扩展ID'>
    <updatecheck codebase='https://your-server.com/extension-v1.0.0.crx' version='1.0.0' />
  </app>
</gupdate>
```

---

## 六、打包脚本

项目已包含打包脚本，可直接使用：

### 6.1 Windows

```powershell
.\pack.ps1
```

### 6.2 macOS / Linux

```bash
chmod +x pack.sh
./pack.sh
```

---

## 七、发布清单

| 步骤 | 说明 |
|------|------|
| 1 | 更新 `manifest.json` 的 `version` |
| 2 | 运行 `make-icons.js` 生成图标（如需要） |
| 3 | 执行打包脚本生成 ZIP |
| 4 | 本地加载 ZIP 解压目录测试 |
| 5 | 准备商店截图与描述 |
| 6 | 上传到 Chrome 网上应用店或内网部署 |
