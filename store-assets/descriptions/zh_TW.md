---
使用方式

1. 點擊擴充功能圖示。
2. 從目前開啟的分頁清單中選取要同步的分頁。
3. 如果分頁很多，可以用標題、部分 URL 或網域快速尋找。
4. 點擊「開始同步」，然後在任一已連結的分頁中捲動。
---

基本捲動同步

在一個分頁中捲動時，其他已連結的分頁也會依照各自頁面長度移動到相同的相對位置。

例如，如果你移動到某份文件 40% 的位置，另一份文件也會移動到它自己頁面長度的 40% 位置。即使頁面長度不同，它們也會依照整體閱讀進度一起移動，因此並排閱讀長文件會更方便。

即使頁面啟用了 smooth scrolling，同步捲動也會立即套用最新位置。

---

手動位置調整

當頁面結構不同時，相同的相對位置也可能無法對齊到同一個段落。

譯文可能比原文更長或更短。Staging 和 Production 可能有不同的橫幅或實驗 UI。不同文件也可能有不同的目錄、廣告或頁首高度。

這時，請按住 Option（Mac）或 Alt（Windows/Linux），只捲動一個分頁。

按住按鍵時，只有目前分頁會移動。放開按鍵後，該位置會儲存為新的參考點，之後所有分頁會再次從該位置一起捲動。

當你不想中斷同步，只想重新對齊比較位置時，這個功能很有用。

---

URL Sync

開啟 URL Sync 後，除了捲動位置，也可以同步受支援的頁面跳轉。

從 `/products/keyboard` 跳轉到 `/products/mouse` 這類路徑(path)變化也會同步。搜尋詞、篩選條件、排序等查詢參數也會一起套用。`/ko`、`/en` 這類語言路徑會在可能的情況下依各分頁的語言保留。

URL Sync 提供兩種模式。

1. 跟隨已變更的分頁

其他分頁會跟隨已變更分頁的網站和頁面流程。路徑和查詢參數會一起變更，同時目標分頁中的 `/en`、`/ko` 等語言路徑會在可能的情況下保留。

開始狀態：

• 分頁 A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• 分頁 B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

分頁 A 跳轉到其他路徑和搜尋條件：

• 分頁 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

結果：

• 分頁 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• 分頁 B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

適合在同一網站中並排查看多語言文件、站內搜尋結果或篩選後的清單。

2. 保持每個分頁的網站

每個分頁會留在自己的網站上，並在可能的情況下跳轉到相同路徑和查詢參數。語言路徑也會依各分頁保留。

開始狀態：

• 分頁 A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• 分頁 B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

分頁 A 跳轉到其他商品路徑和篩選條件：

• 分頁 A: https://www.example.com/ko/products/mouse?q=mouse&color=white

結果：

• 分頁 A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• 分頁 B: https://staging.example.com/en/products/mouse?q=mouse&color=white

適合比較 URL 結構相似但網站不同的頁面。你可以並排檢查 Production 和 Staging、A/B variant、不同國家的網站、不同語言的頁面、站內搜尋結果以及篩選後的商品清單。

受瀏覽器安全性政策或網站限制影響，URL Sync 可能不會套用在不支援的頁面上。例如，部分搜尋引擎結果頁、登入頁、PDF 檢視器和 Web 應用程式頁面會被排除在同步之外。

---

主要功能

• 手動同步瀏覽器可直接呈現的本機 file:// 頁面，包括 HTML、Markdown、JSON、文字、CSV 和記錄檔
• 多個分頁之間即時同步捲動位置
• 使用 URL Sync 同步受支援的頁面跳轉
• 提供跟隨同一網站的模式，以及保持每個分頁所在網站的模式
• 支援同步路徑(path)、搜尋詞、篩選條件、排序等查詢參數
• 使用 Option/Alt 鍵微調單一分頁，然後從調整後的位置繼續同步
• 支援比較 Staging/Production、A/B variant、原文/譯文和多語言頁面
• 偵測到相同或相關頁面時自動提出同步建議
• 支援 Chrome、Firefox、Edge、Brave 以及基於 Chromium 的瀏覽器
• 在本機運作，不收集資料，不做分析、追蹤或帳號註冊

---

不支援的頁面

由於瀏覽器安全性政策或網站限制，以下頁面無法使用此擴充功能。

• Google 服務：Docs、Drive、Gmail、Sheets、Slides
• Figma、JIRA、Notion、Microsoft Office Online 等 Web 應用程式
• 瀏覽器內部頁面：chrome://、edge://、about:
• 擴充功能商店和部分搜尋引擎結果頁
• PDF 檔案和 PDF 檢視器
• 登入和身分驗證頁面
• view-source:、data:、blob: 等特殊 URL

不支援的分頁會在選擇清單中顯示為停用狀態，限制原因會顯示在工具提示中。

---

隱私權

• 不收集使用者資料
• 無分析、無追蹤、無 Cookie
• 無網路請求，離線運作
• 不需要帳號或登入
• 不讀取或上傳本機檔案內容
• 開放原始碼：https://github.com/jaem1n207/synchronize-tab-scrolling

---

可在 Chrome、Firefox、Edge、Brave 以及基於 Chromium 的瀏覽器上使用。

支援 9 種語言：中文(繁體), English, 한국어, 日本語, Français, Español, Deutsch, 中文(简体), हिन्दी。
