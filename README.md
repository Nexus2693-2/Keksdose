# Keksdose

Plätzchen-Rezepte als statische Website: HTML, CSS und JavaScript in `public/`, kein Build-Schritt.
43 Rezepte — Plätzchen, Waffeln, Pancakes und Gebäcke —, Rezept-Finder mit zehn Fragen, Portions-/Ausstecher-Rechner, Preisschätzung je Sorte und Stück, Einkaufsliste, Backplan in fünf Stationen (Teige, Blech-Pipeline, Auskühlen, Fertigstellen, Verpacken) mit Ausstattungs-Auswahl, geführter Backmodus mit Timer und Vorratscheck.
Der Backplan rechnet mit Ofenblechen, Team, Tempo, Pause, Zielzeit und Menge je Sorte, lässt sich als Checkliste drucken, per Link teilen und als Kalenderdatei exportieren; nach dem ersten Besuch läuft die Seite auch ohne Netz (PWA).

Die Seite läuft unter **https://krumel-amp-zimt-63lbpv.freebuff.page**.

## Struktur

- `public/index.html` – Seitenaufbau
- `public/styles.css` – Gestaltung inklusive Druckansicht
- `public/app.js` – Filter, Rezept-Drawer, Finder, Preisschätzung, Einkaufsliste, Backplan, Backmodus, Vorratscheck
- `public/recipes.js` – Rezeptdaten
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` – Offline-Hülle und App-Icons
- `worker.js` + `sites.manifest.json` – Freebuff-Deploy (Worker liefert `public/` aus)
- `tools/obtainium-link.mjs` – erzeugt den Obtainium-Ein-Klick-Link aus Adresse und Versionsmuster
- `netlify.toml` – ehemaliger Netlify-Deploy, stillgelegt (Freebuff ist die Adresse)

## Teilen, Drucken, Offline

- **Plan-Link:** Rezepte, Startzeit, Ausstattung und alle Feinheiten stehen in der Adresse (`#plan?ids=…&start=…&gear=…&cap=…&team=…&tempo=…&pause=…&ziel=…&menge=…&ohne=…`). „Link kopieren“ im Backplan gibt den Plan weiter, ein solcher Link stellt ihn beim Öffnen wieder her.
- **Plan drucken:** druckt nur die Stationen als Checkliste mit Kästchen zum Abhaken.
- **In den Kalender:** lädt eine `.ics`-Datei mit allen Stationen als Termine.
- **Offline:** `sw.js` legt die Seite nach dem ersten Besuch im Cache ab, `manifest.webmanifest` macht sie installierbar. Bei jeder Veröffentlichung `VERSION` in `public/sw.js` hochzählen, sonst bleibt die alte Hülle aktiv.

## Sortiment, Preise und Finder

- **43 Rezepte in vier Sorten:** Plätzchen, Waffeln (Herz- und Apfelwaffeln), Pancakes (auch vegan) und Gebäcke aus dem Ofen (Zimtschnecken, Buchteln, Schoko-Muffins, Streuselkuchen, Pistazien-Cookies). Der Filter „Gebäck“ und der Vorschlag „Waffeln & Pancakes“ im Backplan machen sie auffindbar.
- **Preisschätzung:** Jede Karte zeigt die geschätzten Zutatenkosten für die ganze Sorte und je Stück (`PRICE_RULES` in `public/app.js`). Der Rezept-Drawer rechnet beim Skalieren mit, die Einkaufsliste nennt die Summe. Grundlage sind grobe Supermarktpreise pro 100 g, 100 ml oder Stück; Löffel, Päckchen und Prisen werden über `unitGrams` umgerechnet. Es ist eine Hausnummer, kein Kassenbon.
- **Finder mit zehn Fragen:** Gebäcksorte, Geschmack, Textur, Zeit, Anlass, Ausschlüsse, Aufwand, Menge, Preis und „kenn ich schon“. Vegane, nuss- und schokofreie Wünsche sind harte Ausschlüsse; die drei besten Treffer bekommen zwei Inspirationsvorschläge aus einer anderen Gebäcksorte an die Seite. Jedes Rezept braucht dafür Merkmale in `window.RECIPE_TRAITS`.
- **Vorratscheck („Was hab ich da?“):** Zutaten abhaken und auf Wunsch die vorhandene Menge eintragen (g, ml oder Stück). Der Check vergleicht mit dem Rezeptbedarf und meldet „zu wenig Mehl (250 g nötig)“ statt nur „fehlt“; ohne Mengenangabe gilt eine Zutat wie bisher als vorhanden. Seit 1.0.2 hat der Check einen eigenen Abschnitt `#vorrat` zwischen Finder und Rezepten (auch in der Navigation): Dort stehen acht Grundzutaten als antippbare Chips, die Auswahl landet direkt im Vorrat, und eine Zeile darunter sagt, wie viele Rezepte damit sofort gehen und wie viele nur noch eine Zutat brauchen. Der Knopf in der Rezeptleiste bleibt als Abkürzung.
- **Tipps:** Jedes Rezept endet mit „Gut zu wissen“ — eine konkrete Handlung samt Begründung (Temperatur, Timing, Technik, Lagerung), keine allgemeinen Floskeln. Bei Rezeptänderungen prüft der Test, dass jeder Tipp vorhanden, ausreichend ausführlich und einzigartig ist.
- **Ankündigungen (#ankuendigungen):** eigener Abschnitt mit Navigationseintrag „Ankündigungen“ und dem Reiter **App** in der Kopfzeile (beide zeigen auf denselben Abschnitt). Er startet mit der App-Ankündigung („Die Keksdose-App ist da“, Etikett „Android · Version 1.0“, Download-Button) und ist als Liste angelegt, in die weitere Neuigkeiten einfach als `.news-item` dazukommen. In der Druckansicht ausgeblendet.
- **Obtainium:** Unter der App-Ankündigung steht in `.app-update` ein Ein-Klick-Link, der die App in [Obtainium](https://obtainium.imranr.dev) einträgt – HTML-Quelle `https://krumel-amp-zimt-63lbpv.freebuff.page/downloads/`, Versionsmuster und fertige Einstellungen inklusive. Quelle ist also die Website, nicht GitHub; das Repository kann privat bleiben. Wer den Knopf nicht nutzen kann, trägt die Adresse von Hand ein. In der App selbst ist der Block ausgeblendet (`.is-app .app-update`).
- **Handy und Tablet:** Bis 900 px Breite liegt die Navigation in einem aufklappbaren **Menü** (Marke, „Menü“, Einkaufsliste in einer flachen Kopfzeile, 38 px hoch statt vormals 127 px in zwei Reihen). Der Reiter „App“ erscheint dort als eigener Eintrag. Unter 430 px werden Karten einspaltig, Überschrift und Abstände kleiner. Geprüft ohne seitlichen Überlauf bei 320, 360, 390, 430, 640, 768, 834, 900, 920, 1024 und 1280 px.

## Bewegung und Bedienung

- **Bewegung ohne Zutun:** Ein Laufband unter dem Startbild zieht mit allen 43 Rezeptnamen langsam vorbei (zwei gleiche Gruppen für die nahtlose Schleife, Dauer aus der Rezeptzahl), der Strich in jedem Vorspann atmet, das Kekslogo im Kopf wiegt sich, hinter den Startkacheln pulsiert ein warmer Schein und feine Krümel treiben darüber. Der Reiter **App** bekommt alle paar Sekunden einen Lichtschein.
- **Einblenden beim Scrollen:** Abschnitte, Rezeptkarten und Tipps kommen mit kurzer Staffelung ins Bild; auf der Startseite atmen die Kekskacheln langsam.
- **Antwort auf die Maus:** Das Startbild wandert ein Stück mit dem Zeiger (`--px`/`--py`), über jedem Rezeptmotiv sitzt ein warmer Lichtpunkt, der der Maus folgt (`--mx`/`--my`). Beides nur bei feinem Zeiger, nicht auf Touchgeräten und nicht bei `prefers-reduced-motion`.
- **Direkte Rückmeldung:** Karten bekommen beim Überfahren einen Lichtstreif, Knöpfe geben beim Drücken nach, der Zähler der Einkaufsliste hüpft bei einem neuen Rezept, und eine kurze Meldung am unteren Rand bestätigt „auf die Einkaufsliste“.
- **Navigation:** Der gelesene Abschnitt wird in der Kopfzeile markiert; Anker landen wegen `scroll-margin-top` nicht unter der klebenden Kopfzeile, und Sprungmarken haben einen sichtbaren Tastaturfokus.
- **Ruhige Technik:** Alle Effekte laufen über `transform`, `translate`, `scale`, `opacity` und `background-position`, also ohne Layout-Arbeit pro Bild. Es gibt keinen Scroll-Listener: Ein `IntersectionObserver` übernimmt Einblenden, Kopfzeilen-Tiefe und Abschnittsmarkierung. Die Zeigerbewegung wird pro Bild einmal über `requestAnimationFrame` gesetzt. `prefers-reduced-motion` schaltet alle Endlos-Animationen ab und lässt das Laufband stehen.

## Zwei Backmodi

- **Einfach:** ein Rezept, ein Blech nach dem anderen, allein am Tisch und gemütliches Tempo. Team, Pause, Zielzeit, Vorschläge und die Feinschliff-Regler sind ausgeblendet; die Zeiten sind bewusst mit Luft gerechnet. Eine neue Rezeptwahl ersetzt die alte, und der Plan belegt das nächste Blech erst, wenn der Ofen wieder frei ist.
- **Erweitert:** das bisherige Parallelrechnen mit mehreren Sorten, Blechen im selben Ofengang, Team, Tempo, Pause und Zielzeit.
- Der Modus steckt im Plan-Link (`#plan?…&modus=einfach`), wird lokal gespeichert und steht als Etikett im Backmodus.

## Backplan einstellen

Die folgenden Regler gehören zum **erweiterten Modus**; ihre Werte bleiben beim Wechsel auf „Einfach“ gespeichert.

- **Bleche gleichzeitig** (1–3): Bleche mit derselben Temperatur backen in einem Rutsch; der Plan fasst sie zu Ofengängen zusammen und rechnet zwei Minuten mehr Backzeit ein.
- **Wer backt mit?** (1–3 Personen) und **Tempo** (gemütlich/normal/zügig): verkürzen Rühren, Formen und Fertigstellen. Rühren lässt sich weniger beschleunigen als das Belegen von Blechen.
- **Pause:** Uhrzeit und Dauer; der Plan hält an der nächsten Station an und verschiebt alles danach, statt mitten im Ausrollen zu unterbrechen.
- **Fertig um:** prüft die Zielzeit. Passt es nicht, nennt der Plan die späteste Startzeit und setzt sie auf Wunsch direkt.
- **Menge je Sorte:** ½×, 1× oder 2× — Stückzahl, Bleche und Rührzeit wachsen mit; „Alles auf die Einkaufsliste“ übernimmt die Menge.
- **nur backen:** lässt Glasur, Füllung oder Verzieren für eine Sorte aus dem Plan.
- **Vorschläge:** Omas Klassiker, Schnelle Runde und Schoko & Nuss füllen die Auswahl mit einem Klick.
- **Jetzt:** setzt den Start auf die nächste Fünf-Minuten-Marke der aktuellen Uhrzeit.

## Android-App

Die Website steckt als schlanke Offline-App in `android/`: ein WebView, der alle Dateien aus `public/` direkt aus dem APK ausliefert (unter der eigenen Adresse `https://appassets.androidplatform.net`, ohne `INTERNET`-Berechtigung). Einkaufsliste, Backplan und Vorratscheck landen im lokalen Speicher der App.

- **Bauen:** `./android/build.sh` – braucht JDK 17 sowie Android SDK mit `platforms/android-34` und `build-tools/34.0.0` (SDK über `ANDROID_HOME`/`ANDROID_SDK_ROOT` oder `$HOME/opt/android-sdk`). Ergebnis: `android/dist/Keksdose-<Version>.apk`. Kein Gradle, nur `aapt2`, `javac`, `d8`, `zipalign`, `apksigner`.
- **Version:** `android:versionCode`/`android:versionName` in `android/AndroidManifest.xml`, überschreibbar mit `VERSION_NAME`/`VERSION_CODE` beim Build.
- **Signatur:** Standard-Debug-Schlüssel (`$HOME/.android/debug.keystore`), damit das APK direkt installierbar ist. Für Play Store oder verlässliche Updates einen eigenen Release-Key setzen (`KEYSTORE`, `KS_PASS`, `KEY_ALIAS`, `KEY_PASS`) und sicher aufbewahren – ohne denselben Key lässt sich eine Installation nicht aktualisieren.
- **App-Erkennung:** Die App hängt `KeksdoseApp/1.0` an den User-Agent. Dadurch blendet die Seite den APK-Download aus und registriert keinen Service Worker, weil die Dateien ohnehin im APK liegen.
- **Assets:** Beim Linken wird `public/` direkt als Asset-Ordner eingebunden. Nach Änderungen an der Website also das APK neu bauen und ein neues Release anlegen.
- **Download:** Die geprüfte APK liegt samt `SHA256SUMS` unter `public/downloads/` und wird mit der Website veröffentlicht; der Button in den Ankündigungen lädt sie direkt von dort. Der Build lässt diesen Ordner aus, damit die APK nicht in sich selbst landet.
- **Download-Seite:** `public/downloads/index.html` ist die feste Adresse `/downloads/` mit Version, Download-Link, SHA-256, älteren Fassungen und dem Obtainium-Knopf. Bei einer neuen Fassung hier Version, Dateinamen und Hash mitziehen; `node tools/obtainium-link.mjs --inject` setzt den Ein-Klick-Link neu (das Versionsmuster liest die Überschrift „Keksdose 1.0.2“).
- **Updates:** Quelle für [Obtainium](https://obtainium.imranr.dev) ist die Download-Seite dieser Website (`/downloads/`) als HTML-Quelle. Obtainium liest Version und APK-Link von dort; das GitHub-Repository kann deshalb **privat** bleiben.
- **Signatur:** Damit ein Update die bestehende Installation ersetzt, muss jede Fassung mit demselben Schlüssel signiert sein. Aktuell ist das der Debug-Schlüssel aus `$HOME/.android/debug.keystore`; für dauerhafte Updates einen eigenen Release-Key erzeugen und sicher aufbewahren.
- **Release:** Der Workflow `.github/workflows/release-apk.yml` prüft die Prüfsumme und hängt die Datei an das Release `v1.0.2`; er läuft bei Änderungen in `public/downloads/` und lässt sich manuell starten. Die Releases sind nur noch ein Archiv – Obtainium und alle Download-Links nutzen die Website.
- **Versionsstand:** `1.0.2` (versionCode 3) enthält den Website-Stand mit dem eigenen Vorrats-Abschnitt; `1.0.1` (flache Handy-Kopfzeile, Menü) und `1.0.0` bleiben als ältere Fassungen in `public/downloads/` liegen. Beim Bauen ohne Angaben setzt `build.sh` Version und Code aus dem Manifest in eine Arbeitskopie – `VERSION_NAME`/`VERSION_CODE` überschreiben sie.

## Lokal ansehen

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory public
```

## Veröffentlichen

Die Seite läuft an einer Adresse: **https://krumel-amp-zimt-63lbpv.freebuff.page**

- Deploy über `sites.manifest.json` (Worker liefert `public/` aus), danach veröffentlichen.
- Kein Build, keine Umgebungsvariablen, keine zweite Adresse.
- `netlify.toml` bleibt nur als Erinnerung liegen; Netlify ist seit 23.11.2026 stillgelegt (Konto-Guthaben aufgebraucht) und bekommt keine Deploys mehr.

## Nach jeder Änderung

1. Änderung in `public/` umsetzen und lokal prüfen.
2. Committen und nach `main` pushen — die Historie ist die Dokumentation der Arbeitsschritte.
3. Freebuff deployen, veröffentlichen und die Live-Adresse prüfen.
