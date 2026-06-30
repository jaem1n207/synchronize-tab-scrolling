---
कैसे इस्तेमाल करें

1. Extension icon पर click करें।
2. अभी खुले tabs की list से वे tabs चुनें जिन्हें sync करना है।
3. अगर tabs बहुत ज़्यादा हैं, तो title, URL के किसी हिस्से या domain से उन्हें जल्दी खोजें।
4. "Start Sync" पर click करें, फिर किसी भी connected tab में scroll करें।
---

Basic scroll sync

जब आप किसी एक tab में scroll करते हैं, तो बाकी connected tabs अपनी-अपनी page length के आधार पर उसी relative position पर चले जाते हैं।

उदाहरण के लिए, अगर आप एक document के 40% point पर जाते हैं, तो दूसरा document भी अपनी page length के 40% point पर चला जाता है। Page lengths अलग हों तब भी tabs पूरे flow के आधार पर साथ-साथ चलते हैं, इसलिए लंबे documents को side by side पढ़ना आसान होता है।

Smooth scrolling enabled pages पर भी synced scrolling latest position को तुरंत apply करती है।

---

Manual position adjustment

जब page structures अलग होते हैं, तो same relative position भी same paragraph से align नहीं हो सकती।

Translation original से लंबी या छोटी हो सकती है। Staging और Production में अलग banners या experimental UI हो सकता है। Documents में table of contents, ads या header heights भी अलग हो सकते हैं।

ऐसे में Option (Mac) या Alt (Windows/Linux) दबाकर सिर्फ एक tab को scroll करें।

Key दबाए रखने के दौरान सिर्फ current tab move करता है। Key छोड़ने पर वह position नया reference point बनकर save हो जाती है, और उसके बाद सभी tabs फिर से वहीं से साथ scroll करते हैं।

यह तब उपयोगी है जब आप sync बंद किए बिना comparison position को फिर से align करना चाहते हैं।

---

URL Sync

URL Sync चालू करने पर scroll position के साथ supported page navigation भी sync किया जा सकता है।

Path changes भी sync होते हैं, जैसे `/products/keyboard` से `/products/mouse` पर जाना। Search terms, filters और sorting जैसे query parameters भी साथ apply होते हैं। `/ko` और `/en` जैसे language paths, possible होने पर हर tab की language के अनुसार बने रहते हैं।

URL Sync दो modes देता है।

1. Follow changed tab

दूसरे tabs changed tab की website और page flow को follow करते हैं। Path और query parameters साथ बदलते हैं, जबकि target tab में `/en` या `/ko` जैसे language paths possible होने पर बने रहते हैं।

Starting state:

• Tab A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• Tab B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

Tab A किसी दूसरे path और search condition पर जाता है:

• Tab A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

Result:

• Tab A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• Tab B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

यह एक ही site पर documents, internal search results या filtered lists को कई languages में side by side देखने के लिए उपयोगी है।

2. Keep each tab's website

हर tab अपनी website पर रहता है और possible होने पर same path और query parameters पर जाता है। Language paths भी हर tab के अनुसार बने रहते हैं।

Starting state:

• Tab A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• Tab B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

Tab A किसी दूसरे product path और filter पर जाता है:

• Tab A: https://www.example.com/ko/products/mouse?q=mouse&color=white

Result:

• Tab A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• Tab B: https://staging.example.com/en/products/mouse?q=mouse&color=white

यह अलग-अलग sites पर similar URL structures वाली pages compare करने के लिए उपयोगी है। आप Production और Staging, A/B variants, country-specific sites, language-specific pages, internal search results और filtered product lists को side by side देख सकते हैं।

Browser security policies या site restrictions की वजह से unsupported pages पर URL Sync apply नहीं हो सकता। उदाहरण के लिए, कुछ search engine result pages, login pages, PDF viewers और web application pages sync से exclude किए जाते हैं।

---

मुख्य विशेषताएँ

• HTML, Markdown, JSON, text, CSV और logs जैसे browser द्वारा सीधे render किए जा सकने वाले local file:// pages का manual sync
• कई tabs के बीच real-time scroll position sync
• URL Sync से supported page navigation भी sync करें
• Same website follow करने वाला mode और हर tab की अपनी website बनाए रखने वाला mode
• Paths, search terms, filters, sorting और दूसरे query parameters के sync का support
• Option/Alt से एक tab को fine-tune करें, फिर adjusted position से sync जारी रखें
• Staging/Production, A/B variants, original/translation और multilingual pages compare करें
• Identical या related pages detect होने पर automatic sync suggestions
• Chrome, Firefox, Edge, Brave और Chromium-based browsers का support
• Data collection, analytics, tracking या account sign-up के बिना locally काम करता है

---

जहाँ pages supported नहीं हैं

Browser security policies या site restrictions की वजह से इस extension को नीचे दिए गए pages पर इस्तेमाल नहीं किया जा सकता।

• Google services: Docs, Drive, Gmail, Sheets, Slides
• Web applications जैसे Figma, JIRA, Notion और Microsoft Office Online
• Browser internal pages: chrome://, edge://, about:
• Extension stores और कुछ search engine result pages
• PDF files और PDF viewers
• Login और authentication pages
• Special URLs जैसे view-source:, data: और blob:

Unsupported tabs selection list में disabled दिखते हैं, और reason tooltip में दिखाया जाता है।

---

Privacy

• User data collect नहीं करता
• Analytics, tracking या cookies नहीं
• Network requests के बिना offline काम करता है
• Account या login की ज़रूरत नहीं
• Local file contents को read या upload नहीं करता
• Open source: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Chrome, Firefox, Edge, Brave और Chromium-based browsers पर उपलब्ध।

9 भाषाओं में उपलब्ध: हिन्दी, English, 한국어, 日本語, Français, Español, Deutsch, 中文(简体), 中文(繁體).
