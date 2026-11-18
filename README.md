# Keksdose

Plätzchen-Rezepte als statische Website: HTML, CSS und JavaScript in `public/`, kein Build-Schritt.
35 Rezepte, Plätzchen-Finder, Portions-/Ausstecher-Rechner, Einkaufsliste, Backplan und Vorratscheck.

## Struktur

- `public/index.html` – Seitenaufbau
- `public/styles.css` – Gestaltung inklusive Druckansicht
- `public/app.js` – Filter, Rezept-Drawer, Finder, Einkaufsliste, Backplan, Vorratscheck
- `public/recipes.js` – Rezeptdaten
- `worker.js` + `sites.manifest.json` – Freebuff-Deploy (Worker liefert `public/` aus)
- `netlify.toml` – Netlify-Deploy direkt aus `public/`

## Lokal ansehen

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory public
```

## Veröffentlichen

Die Seite läuft an zwei Orten, beide werden bei jeder Änderung aktualisiert:

| Ort | URL | Weg |
| --- | --- | --- |
| Netlify (Hauptseite) | https://keksdose.netlify.app | `netlify deploy --prod --dir=public` |
| Freebuff Sites (Spiegel) | https://krumel-amp-zimt-63lbpv.freebuff.page | Deploy über `sites.manifest.json`, danach veröffentlichen |

Netlify baut nichts: `netlify.toml` setzt `command = ""` und `publish = "public"`.
Das Zugriffstoken liegt lokal in `NETLIFY_AUTH_TOKEN` und ist per `.gitignore` ausgeschlossen.

## Nach jeder Änderung

1. Änderung in `public/` umsetzen und lokal prüfen.
2. Committen und nach `main` pushen — die Historie ist die Dokumentation der Arbeitsschritte.
3. Netlify deployen und die Live-URL prüfen.
4. Freebuff-Deploy hochladen, veröffentlichen und die Live-URL prüfen.
