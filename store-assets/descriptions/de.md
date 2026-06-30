---
So funktioniert es

1. Klicken Sie auf das Erweiterungssymbol.
2. Wählen Sie in der Liste der geöffneten Tabs die Tabs aus, die synchronisiert werden sollen.
3. Wenn viele Tabs geöffnet sind, finden Sie sie schnell über Titel, einen Teil der URL oder die Domain.
4. Klicken Sie auf "Synchronisierung starten" und scrollen Sie dann in einem beliebigen verbundenen Tab.
---

Grundlegende Scroll-Synchronisierung

Wenn Sie in einem Tab scrollen, wechseln die anderen verbundenen Tabs zur gleichen relativen Position, jeweils bezogen auf die Länge der eigenen Seite.

Wenn Sie zum Beispiel in einem Dokument zur 40-%-Position wechseln, springt das andere Dokument ebenfalls zur eigenen 40-%-Position. Auch wenn Seiten unterschiedlich lang sind, bewegen sie sich anhand des gesamten Leseflusses gemeinsam. Das macht lange Dokumente leichter nebeneinander lesbar.

Auch auf Seiten mit aktiviertem smooth scrolling wird die neueste Synchronisierungsposition sofort angewendet.

---

Manuelle Positionsanpassung

Wenn Seiten unterschiedlich aufgebaut sind, kann dieselbe relative Position auf einen anderen Absatz zeigen.

Eine Übersetzung kann länger oder kürzer sein als das Original. Staging und Production können unterschiedliche Banner oder experimentelle UI enthalten. Dokumente können außerdem verschiedene Inhaltsverzeichnisse, Anzeigen oder Header-Höhen haben.

Halten Sie in diesem Fall Option (Mac) oder Alt (Windows/Linux) gedrückt und scrollen Sie nur einen Tab.

Solange die Taste gedrückt ist, bewegt sich nur der aktuelle Tab. Wenn Sie die Taste loslassen, wird diese Position als neuer Referenzpunkt gespeichert, und alle Tabs scrollen danach wieder gemeinsam.

Das ist nützlich, wenn Sie die Vergleichsposition neu ausrichten möchten, ohne die Synchronisierung zu beenden.

---

URL Sync

Aktivieren Sie URL Sync, um neben der Scroll-Position auch unterstützte Seitenwechsel zu synchronisieren.

Pfadänderungen(path) werden synchronisiert, etwa von `/products/keyboard` zu `/products/mouse`. Query-Parameter wie Suchbegriffe, Filter und Sortierung werden ebenfalls gemeinsam angewendet. Sprachpfade wie `/ko` und `/en` bleiben nach Möglichkeit pro Tab erhalten.

URL Sync bietet zwei Modi.

1. Geändertem Tab folgen

Andere Tabs folgen der Website und dem Seitenfluss des geänderten Tabs. Pfad und Query-Parameter ändern sich gemeinsam, während Sprachpfade wie `/en` oder `/ko` im Ziel-Tab nach Möglichkeit erhalten bleiben.

Ausgangszustand:

• Tab A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• Tab B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

Tab A wechselt zu einem anderen Pfad und anderen Suchbedingungen:

• Tab A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

Ergebnis:

• Tab A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• Tab B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

Dieser Modus eignet sich, um Dokumente, interne Suchergebnisse oder gefilterte Listen derselben Website in mehreren Sprachen nebeneinander zu prüfen.

2. Website jedes Tabs beibehalten

Jeder Tab bleibt auf seiner eigenen Website und wechselt nach Möglichkeit zum gleichen Pfad und den gleichen Query-Parametern. Sprachpfade bleiben ebenfalls pro Tab erhalten.

Ausgangszustand:

• Tab A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• Tab B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

Tab A wechselt zu einem anderen Produktpfad und Filter:

• Tab A: https://www.example.com/ko/products/mouse?q=mouse&color=white

Ergebnis:

• Tab A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• Tab B: https://staging.example.com/en/products/mouse?q=mouse&color=white

Dieser Modus eignet sich, wenn Seiten auf unterschiedlichen Websites ähnliche URL-Strukturen haben. So können Sie Production und Staging, A/B variants, länderspezifische Websites, sprachspezifische Seiten, interne Suchergebnisse und gefilterte Produktlisten nebeneinander prüfen.

URL Sync wird möglicherweise nicht auf Seiten angewendet, die durch Browser-Sicherheitsrichtlinien oder Website-Beschränkungen blockiert sind. Dazu gehören zum Beispiel einige Suchergebnisseiten, Login-Seiten, PDF-Viewer und Webanwendungsseiten.

---

Funktionen

• Manuelle Synchronisierung lokaler file://-Seiten, die der Browser direkt rendern kann, darunter HTML, Markdown, JSON, Text, CSV und Logs
• Echtzeit-Synchronisierung der Scroll-Position über mehrere Tabs
• URL Sync für unterstützte Seitenwechsel
• Modi zum Folgen derselben Website oder zum Beibehalten der Website jedes Tabs
• Synchronisierung von Pfaden(path), Suchbegriffen, Filtern, Sortierung und anderen Query-Parametern
• Einen Tab mit Option/Alt feinjustieren und danach ab der angepassten Position weiter synchronisieren
• Vergleich von Staging/Production, A/B variants, Original/Übersetzung und mehrsprachigen Seiten
• Automatische Synchronisierungsvorschläge, wenn identische oder verwandte Seiten erkannt werden
• Unterstützung für Chrome, Firefox, Edge, Brave und Chromium-basierte Browser
• Funktioniert lokal ohne Datenerfassung, Analyse, Tracking oder Kontoerstellung

---

Nicht unterstützte Seiten

Aufgrund von Browser-Sicherheitsrichtlinien oder Website-Beschränkungen kann diese Erweiterung auf den folgenden Seiten nicht verwendet werden.

• Google-Dienste: Docs, Drive, Gmail, Sheets, Slides
• Webanwendungen wie Figma, JIRA, Notion und Microsoft Office Online
• Browser-interne Seiten: chrome://, edge://, about:
• Erweiterungs-Stores und einige Suchergebnisseiten
• PDF-Dateien und PDF-Viewer
• Login- und Authentifizierungsseiten
• Spezielle URLs wie view-source:, data: und blob:

Nicht unterstützte Tabs werden in der Auswahlliste deaktiviert angezeigt. Der Grund wird in einem Tooltip angezeigt.

---

Datenschutz

• Erfasst keine Benutzerdaten
• Keine Analyse, kein Tracking, keine Cookies
• Funktioniert offline ohne Netzwerkanfragen
• Kein Konto und keine Anmeldung erforderlich
• Liest oder lädt keine Inhalte lokaler Dateien hoch
• Open Source: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Verfügbar für Chrome, Firefox, Edge, Brave und Chromium-basierte Browser.

9 Sprachen unterstützt: Deutsch, English, 한국어, 日本語, Français, Español, 中文(简体), 中文(繁體), हिन्दी.
