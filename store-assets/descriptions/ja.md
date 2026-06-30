---
使い方

1. 拡張機能のアイコンをクリックします。
2. 現在開いているタブの一覧から、同期したいタブを選択します。
3. タブが多い場合は、タイトル、URLの一部、またはドメインで素早く探せます。
4. 「同期開始」をクリックし、接続されたタブのどれかでスクロールします。
---

基本のスクロール同期

1つのタブでスクロールすると、接続された他のタブも各ページの長さに合わせて同じ相対位置へ移動します。

たとえば、あるドキュメントの40%の位置まで移動すると、別のドキュメントも自分のページ長を基準に40%の位置へ移動します。ページの長さが違っていても全体の流れを基準に一緒に動くため、長いドキュメントを並べて読むときに便利です。

ページでsmooth scrollingが有効になっていても、同期スクロールは最新の位置をすぐに反映します。

---

手動位置調整

ページ構造が異なると、同じ相対位置でも段落がずれることがあります。

翻訳文は原文より長かったり短かったりします。StagingとProductionではバナーや実験的なUIが異なる場合もあります。ドキュメントごとに目次、広告、ヘッダーの高さが違うこともあります。

そのような場合は、Option（Mac）またはAlt（Windows/Linux）を押したまま、1つのタブだけをスクロールしてください。

キーを押している間は現在のタブだけが動きます。キーを離すとその位置が新しい基準点として保存され、その後はすべてのタブが再び一緒にスクロールします。

同期を止めずに比較位置だけを合わせ直したいときに便利です。

---

URL Sync

URL Syncをオンにすると、スクロール位置だけでなく、対応しているページ移動も一緒に同期できます。

`/products/keyboard`から`/products/mouse`へ移動するように、パス(path)が変わる場合も同期されます。検索語、フィルター、並び順などのクエリパラメーターも一緒に反映されます。`/ko`や`/en`のような言語パスは、可能な場合は各タブの言語に合わせて維持されます。

URL Syncには2つのモードがあります。

1. 変更したタブに追従

他のタブも、変更したタブのウェブサイトとページの流れに追従します。パスとクエリパラメーターは一緒に変わり、対象タブに`/en`や`/ko`のような言語パスがある場合は、可能な限りその言語を維持します。

開始状態:

• タブA: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• タブB: https://docs.example.com/en/guides/start?q=scroll&filter=basic

タブAで別のパスと検索条件へ移動:

• タブA: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

結果:

• タブA: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• タブB: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

同じサイトのドキュメント、サイト内検索結果、フィルター済みリストを複数の言語で並べて確認したいときに適しています。

2. 各タブのウェブサイトを維持

各タブはそれぞれのウェブサイトに残り、可能な場合は同じパスとクエリパラメーターへ移動します。言語パスも各タブに合わせて維持されます。

開始状態:

• タブA: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• タブB: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

タブAで別の商品パスとフィルターへ移動:

• タブA: https://www.example.com/ko/products/mouse?q=mouse&color=white

結果:

• タブA: https://www.example.com/ko/products/mouse?q=mouse&color=white
• タブB: https://staging.example.com/en/products/mouse?q=mouse&color=white

サイトは異なるもののURL構造が似ているページを比較するときに適しています。ProductionとStaging、A/B variant、国別サイト、言語別ページ、サイト内検索結果、フィルター済みの商品一覧を並べて確認できます。

ブラウザのセキュリティポリシーやサイト側の制限により、対応していないページではURL Syncが適用されない場合があります。たとえば、一部の検索エンジン結果ページ、ログインページ、PDFビューア、ウェブアプリケーションページは同期対象から除外されます。

---

主な機能

• HTML、Markdown、JSON、テキスト、CSV、ログなど、ブラウザが直接レンダリングできるローカルfile://ページの手動同期
• 複数タブのスクロール位置をリアルタイムに同期
• URL Syncで対応ページの移動も一緒に同期
• 同じウェブサイトに追従するモードと、各タブのウェブサイトを維持するモードを提供
• パス(path)、検索語、フィルター、並び順などのクエリパラメーターの同期に対応
• Option/Altキーで1つのタブだけを微調整し、調整後の位置から再び同期
• Staging/Production、A/B variant、原文/翻訳文、多言語ページの比較に対応
• 同一または関連するページを検出すると自動同期を提案
• Chrome、Firefox、Edge、Brave、およびChromiumベースのブラウザに対応
• データ収集、分析、追跡、アカウント登録なしでローカル動作

---

対応していないページ

ブラウザのセキュリティポリシーやサイト側の制限により、次のページでは使用できません。

• Googleサービス: Docs、Drive、Gmail、Sheets、Slides
• Figma、JIRA、Notion、Microsoft Office Onlineなどのウェブアプリケーション
• ブラウザ内部ページ: chrome://、edge://、about:
• 拡張機能ストアおよび一部の検索エンジン結果ページ
• PDFファイルおよびPDFビューア
• ログインおよび認証ページ
• view-source:、data:、blob:などの特殊なURL

対応していないタブは選択リストで無効化され、制限理由はツールチップで確認できます。

---

プライバシー

• ユーザーデータを収集しません
• 分析、追跡、Cookieはありません
• ネットワーク要求なしでオフライン動作
• アカウントやログインは不要
• ローカルファイルの内容を読み取ったりアップロードしたりしません
• オープンソース: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Chrome、Firefox、Edge、Brave、およびChromiumベースのブラウザで利用できます。

9言語に対応: 日本語、English、한국어、Français、Español、Deutsch、中文(简体)、中文(繁體)、हिन्दी.
