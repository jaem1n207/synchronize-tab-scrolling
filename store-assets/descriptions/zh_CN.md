---
使用方法

1. 点击扩展图标。
2. 从当前打开的标签页列表中选择要同步的标签页。
3. 如果标签页很多，可以通过标题、部分 URL 或域名快速查找。
4. 点击“开始同步”，然后在任意一个已连接的标签页中滚动。
---

基础滚动同步

在一个标签页中滚动时，其他已连接的标签页会根据各自页面长度移动到相同的相对位置。

例如，如果你移动到一篇文档 40% 的位置，另一篇文档也会移动到它自己页面长度的 40% 位置。即使页面长度不同，它们也会按照整体阅读进度一起移动，因此并排阅读长文档会更轻松。

即使页面启用了 smooth scrolling，同步滚动也会立即应用最新位置。

---

手动位置调整

当页面结构不同时，相同的相对位置也可能无法对齐到同一段落。

译文可能比原文更长或更短。Staging 和 Production 可能有不同的横幅或实验性 UI。不同文档也可能有不同的目录、广告或页眉高度。

这时，请按住 Option（Mac）或 Alt（Windows/Linux），只滚动一个标签页。

按住按键时，只有当前标签页会移动。松开按键后，该位置会保存为新的参考点，之后所有标签页会再次从该位置一起滚动。

当你不想断开同步，只想重新对齐比较位置时，这个功能很有用。

---

URL Sync

开启 URL Sync 后，除了滚动位置，也可以同步受支持的页面跳转。

从 `/products/keyboard` 跳转到 `/products/mouse` 这样的路径(path)变化也会被同步。搜索词、筛选条件、排序等查询参数也会一起应用。`/ko`、`/en` 这样的语言路径会在可能的情况下按各个标签页的语言保留。

URL Sync 提供两种模式。

1. 跟随已更改的标签页

其他标签页会跟随已更改标签页的网站和页面流程。路径和查询参数会一起变化，同时目标标签页中的 `/en`、`/ko` 等语言路径会在可能的情况下保留。

开始状态：

• 标签页 A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• 标签页 B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

标签页 A 跳转到其他路径和搜索条件：

• 标签页 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

结果：

• 标签页 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• 标签页 B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

适合在同一网站中并排查看多语言文档、站内搜索结果或筛选后的列表。

2. 保持每个标签页的网站

每个标签页会留在自己的网站上，并在可能的情况下跳转到相同路径和查询参数。语言路径也会按各个标签页保留。

开始状态：

• 标签页 A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• 标签页 B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

标签页 A 跳转到其他商品路径和筛选条件：

• 标签页 A: https://www.example.com/ko/products/mouse?q=mouse&color=white

结果：

• 标签页 A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• 标签页 B: https://staging.example.com/en/products/mouse?q=mouse&color=white

适合比较 URL 结构相似但网站不同的页面。你可以并排检查 Production 和 Staging、A/B variant、不同国家的网站、不同语言的页面、站内搜索结果以及筛选后的商品列表。

受浏览器安全策略或网站限制影响，URL Sync 可能不会应用在不支持的页面上。例如，部分搜索引擎结果页、登录页、PDF 查看器和 Web 应用页面会被排除在同步之外。

---

核心功能

• 手动同步浏览器可直接渲染的本地 file:// 页面，包括 HTML、Markdown、JSON、文本、CSV 和日志
• 多个标签页之间实时同步滚动位置
• 使用 URL Sync 同步受支持的页面跳转
• 提供跟随同一网站的模式，以及保持每个标签页所在网站的模式
• 支持同步路径(path)、搜索词、筛选条件、排序等查询参数
• 使用 Option/Alt 键微调单个标签页，然后从调整后的位置继续同步
• 支持比较 Staging/Production、A/B variant、原文/译文和多语言页面
• 检测到相同或相关页面时自动提出同步建议
• 支持 Chrome、Firefox、Edge、Brave 以及基于 Chromium 的浏览器
• 在本地运行，不收集数据，不做分析、追踪或账号注册

---

不支持的页面

由于浏览器安全策略或网站限制，以下页面无法使用此扩展。

• Google 服务：Docs、Drive、Gmail、Sheets、Slides
• Figma、JIRA、Notion、Microsoft Office Online 等 Web 应用
• 浏览器内部页面：chrome://、edge://、about:
• 扩展商店和部分搜索引擎结果页
• PDF 文件和 PDF 查看器
• 登录和身份验证页面
• view-source:、data:、blob: 等特殊 URL

不支持的标签页会在选择列表中显示为禁用状态，限制原因会显示在工具提示中。

---

隐私保护

• 不收集用户数据
• 无分析、无追踪、无 Cookie
• 无网络请求，离线运行
• 不需要账号或登录
• 不读取或上传本地文件内容
• 开源：https://github.com/jaem1n207/synchronize-tab-scrolling

---

可在 Chrome、Firefox、Edge、Brave 以及基于 Chromium 的浏览器上使用。

支持 9 种语言：中文(简体), English, 한국어, 日本語, Français, Español, Deutsch, 中文(繁體), हिन्दी。
