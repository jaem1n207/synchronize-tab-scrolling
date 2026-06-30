---
Comment utiliser l'extension

1. Cliquez sur l'icône de l'extension.
2. Sélectionnez les onglets à synchroniser dans la liste des onglets ouverts.
3. Si vous avez beaucoup d'onglets, trouvez-les rapidement par titre, partie de l'URL ou domaine.
4. Cliquez sur "Démarrer la sync", puis faites défiler n'importe quel onglet connecté.
---

Synchronisation de défilement de base

Quand vous faites défiler un onglet, les autres onglets connectés se déplacent à la même position relative, selon la longueur de chaque page.

Par exemple, si vous allez à 40 % d'un document, l'autre document se place aussi à 40 % de sa propre longueur. Même si les pages n'ont pas la même taille, elles avancent ensemble selon le flux global, ce qui facilite la lecture de longs documents côte à côte.

Même sur les pages qui utilisent le smooth scrolling, le défilement synchronisé applique immédiatement la dernière position.

---

Ajustement manuel de position

Quand la structure des pages diffère, la même position relative peut ne pas correspondre au même paragraphe.

Une traduction peut être plus longue ou plus courte que l'original. Staging et Production peuvent avoir des bannières ou des interfaces expérimentales différentes. Les documents peuvent aussi avoir des tables des matières, publicités ou hauteurs d'en-tête différentes.

Dans ce cas, maintenez Option (Mac) ou Alt (Windows/Linux) et faites défiler un seul onglet.

Pendant que la touche est maintenue, seul l'onglet actuel bouge. Quand vous relâchez la touche, cette position est enregistrée comme nouveau point de référence, puis tous les onglets recommencent à défiler ensemble depuis ce point.

C'est utile pour réaligner la position de comparaison sans arrêter la synchronisation.

---

URL Sync

Activez URL Sync pour synchroniser les déplacements de page pris en charge en plus de la position de défilement.

Les changements de chemin(path) sont synchronisés, par exemple de `/products/keyboard` vers `/products/mouse`. Les paramètres de requête comme les termes de recherche, les filtres et le tri sont aussi appliqués ensemble. Les chemins de langue comme `/ko` et `/en` sont conservés par onglet lorsque c'est possible.

URL Sync propose deux modes.

1. Suivre l'onglet modifié

Les autres onglets suivent le site web et le flux de page de l'onglet modifié. Le chemin et les paramètres de requête changent ensemble, tandis que les chemins de langue comme `/en` ou `/ko` sont conservés sur l'onglet cible lorsque c'est possible.

État de départ:

• Onglet A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• Onglet B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

L'onglet A passe à un autre chemin et à d'autres critères de recherche:

• Onglet A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

Résultat:

• Onglet A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• Onglet B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

Ce mode est adapté pour comparer des documents, résultats de recherche interne ou listes filtrées sur le même site, dans plusieurs langues.

2. Conserver le site web de chaque onglet

Chaque onglet reste sur son propre site web et, lorsque c'est possible, passe au même chemin et aux mêmes paramètres de requête. Les chemins de langue sont aussi conservés par onglet.

État de départ:

• Onglet A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• Onglet B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

L'onglet A passe à un autre chemin de produit et à un autre filtre:

• Onglet A: https://www.example.com/ko/products/mouse?q=mouse&color=white

Résultat:

• Onglet A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• Onglet B: https://staging.example.com/en/products/mouse?q=mouse&color=white

Ce mode est adapté pour comparer des pages dont la structure d'URL est similaire sur des sites différents. Vous pouvez vérifier côte à côte Production et Staging, des A/B variants, des sites par pays, des pages par langue, des résultats de recherche interne et des listes de produits filtrées.

URL Sync peut ne pas s'appliquer aux pages bloquées par les politiques de sécurité du navigateur ou par des restrictions du site. Par exemple, certaines pages de résultats de moteurs de recherche, pages de connexion, visionneuses PDF et pages d'applications web sont exclues de la synchronisation.

---

Fonctionnalités principales

• Synchronisation manuelle des pages locales file:// que le navigateur peut afficher directement, comme HTML, Markdown, JSON, texte, CSV et logs
• Synchronisation en temps réel de la position de défilement entre plusieurs onglets
• URL Sync pour synchroniser aussi les déplacements de page pris en charge
• Modes pour suivre le même site web ou conserver le site web de chaque onglet
• Synchronisation des chemins(path), termes de recherche, filtres, tris et autres paramètres de requête
• Ajustez finement un seul onglet avec Option/Alt, puis reprenez la synchronisation depuis la position ajustée
• Comparaison de Staging/Production, A/B variants, original/traduction et pages multilingues
• Suggestions automatiques de synchronisation quand des pages identiques ou liées sont détectées
• Compatible avec Chrome, Firefox, Edge, Brave et les navigateurs basés sur Chromium
• Fonctionne localement, sans collecte de données, analytics, suivi ni création de compte

---

Pages non prises en charge

En raison des politiques de sécurité du navigateur ou des restrictions de certains sites, cette extension ne peut pas être utilisée sur les pages suivantes.

• Services Google: Docs, Drive, Gmail, Sheets, Slides
• Applications web comme Figma, JIRA, Notion et Microsoft Office Online
• Pages internes du navigateur: chrome://, edge://, about:
• Boutiques d'extensions et certaines pages de résultats de moteurs de recherche
• Fichiers PDF et visionneuses PDF
• Pages de connexion et d'authentification
• URL spéciales comme view-source:, data: et blob:

Les onglets non pris en charge apparaissent désactivés dans la liste de sélection, et la raison est indiquée dans une info-bulle.

---

Confidentialité

• Ne collecte pas les données utilisateur
• Aucun analytics, suivi ni cookie
• Fonctionne hors ligne, sans requêtes réseau
• Aucun compte ni connexion requis
• Ne lit ni ne téléverse le contenu des fichiers locaux
• Open source: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Disponible sur Chrome, Firefox, Edge, Brave et les navigateurs basés sur Chromium.

9 langues prises en charge: Français, English, 한국어, 日本語, Español, Deutsch, 中文(简体), 中文(繁體), हिन्दी.
