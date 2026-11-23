# Veröffentlichungen

Jede Änderung wird als Commit auf `main` dokumentiert und unter
**https://keksdose.opboxnull.workers.dev** veröffentlicht. Hauptadresse ist der
Cloudflare Worker `keksdose` (`cloudflare/worker.js`): er liefert `public/` aus
dem öffentlichen Repo aus und cached am Edge, also ist der Push die
Veröffentlichung. Spiegel bleibt **https://keksdose-em1cqm.freebuff.site**
(Freebuff Sites, Deploy aus `public/` über `sites.manifest.json`).

Netlify ist seit 23.11.2026 stillgelegt, weil das Konto-Guthaben aufgebraucht ist
(„Account credit usage exceeded“); dort steht noch der Stand 1.0.1. Die frühere
Freebuff-Subdomain `krumel-amp-zimt-63lbpv.freebuff.page` ist seit dem Umzug
stillgelegt.

| Datum | Änderung | Commit |
| --- | --- | --- |
| 18.11.2026 | Backplan, Vorratscheck, Netlify-Hosting, README | `352b687` |
| 18.11.2026 | Feinschliff: Überlauf behoben, Auswahl-Chips, Fokus-Falle | `0dbb12a` |
| 18.11.2026 | Geführter Backmodus mit Timer, Ausstattungs-Auswahl | `bf2d037` |
| 18.11.2026 | Backplan in fünf Stationen (Teige, Blech-Pipeline, Auskühlen, Fertigstellen, Verpacken) | `e0522a6` |
| 19.11.2026 | Feinschliff am Backplan: Ofenfenster je Blech, getrennte Warte- und Umstellzeiten, ruhigere Stationen-Optik | `e93af04` |
| 20.11.2026 | Backplan als Checkliste drucken, Plan-Link zum Teilen, Offline-Hülle mit Manifest und Icons (PWA) | `91eb994` |
| 20.11.2026 | Backplan individualisierbar: Bleche gleichzeitig, Team, Tempo, Pause, Zielzeit, Menge je Sorte, „nur backen“, Auswahl-Vorschläge, Kalender-Export, Mengen in der Einkaufsliste | `d650cf8` |
| 22.11.2026 | Weichere Bedienung: gestaffeltes Einblenden, Keks- und Kartenbewegung, Drawer- und Backmodus-Übergänge, aktive Navigation, Toast-Bestätigung, `prefers-reduced-motion` | `a2e4a27` |
| 22.11.2026 | Zwei Backmodi: einfach und erweitert; Modus im Plan-Link und als Etikett im Backmodus | `c173e0e` |
| 22.11.2026 | Acht neue Gebäcke, Gebäck-Filter, Preisschätzung je Sorte und Stück, Finder mit zehn Fragen und Inspirationsideen | `26bee5a` |
| 22.11.2026 | Tipps geschärft, App-Ankündigung vor der Fußzeile, Vorratscheck mit Mengen je Zutat | `a20ed41` |
| 22.11.2026 | Reiter „Ankündigungen“ in der Navigation, eigener Abschnitt mit App-Ankündigung | `e53f0a8` |
| 22.11.2026 | Android-App 1.0.0 (WebView, alle Dateien im APK, ohne Internet-Berechtigung), Release v1.0.0 | `db33101` |
| 22.11.2026 | APK zusätzlich unter `/downloads/Keksdose-1.0.0.apk`, Download-Button zeigt dorthin | `2a566a3` |
| 23.11.2026 | Mehr Leben ohne Zutun, Reiter „App“, Obtainium-Anleitung und öffentliche Update-Seite `/downloads/` | `4da7f5d` |
| 23.11.2026 | Handy/Tablet: flache Kopfzeile mit Menü, einspaltige Karten unter 430 px, kein seitlicher Überlauf; App 1.0.1 | `1b8ca9a` |
| 23.11.2026 | „Was hab ich da?“ als eigener Abschnitt `#vorrat`, antippbare Grundzutaten, Live-Stand; App 1.0.2 samt Release v1.0.2; Offline-Hülle v11 | `6b76e7a` |
| 23.11.2026 | Obtainium liest die Website statt GitHub (Ein-Klick-Link mit HTML-Quelle und Versionsmuster), damit das Repository privat bleiben kann; Freebuff ist die einzige Adresse, Doku auf einen Deploy-Weg vereinfacht; Offline-Hülle v12 | `e052684` |
| 23.11.2026 | Eigene Gebäcks-Motive statt geliehener Keksformen (Pancakes, Muffins, Buchteln, Zimtschnecken, Palmiers, Streuselkuchen, Krapfen, runde Apfel-Waffel, Schokoladenbrot), Rezeptname als Bildbeschriftung; App 1.0.3 (versionCode 4) samt Release v1.0.3; Offline-Hülle v13 | `5dfd0c8` |
| 23.11.2026 | Freebuff-Adresse von der alten „Krümel & Zimt“-Subdomain auf https://keksdose-em1cqm.freebuff.site umgezogen; Seiten, Obtainium-Link, Generator und Doku zeigen dorthin; Offline-Hülle v14 | `1dcd587` |
| 23.11.2026 | Internen Repository-Hinweis von den öffentlichen Seiten entfernt; Offline-Hülle v15 | `e167d71` |
| 23.11.2026 | Cloudflare Worker `keksdose` angelegt, der `public/` aus dem Repo ausliefert und am Edge cached | `0256e22` |
| 23.11.2026 | Umzug auf Cloudflare: Hauptadresse https://keksdose.opboxnull.workers.dev, Worker liefert auch endungslose Dateien wie `SHA256SUMS` und cached nur noch eine Minute (vorher hielt ein zweiter Cache den alten Stand eine Stunde), Seiten/Obtainium-Link/Doku zeigen dorthin, Repo-Homepage umgestellt; Offline-Hülle v16 | `97c729e` |

## Hinweise

- Freebuff erlaubt sechs veröffentlichte Seiten. Für Keksdose wurden am 18.11.2026 die Veröffentlichungen von **Ork Game** und **Nebula-Cubing** pausiert (Code und Daten bleiben erhalten, jederzeit wieder veröffentlichbar).
- Die GitHub-Releases (`v1.0.0`–`v1.0.3`) bleiben als Archiv bestehen; Downloads und Obtainium laufen über die Website.
