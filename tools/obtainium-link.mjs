// Baut den Obtainium-Ein-Klick-Link (HTML-Quelle = Download-Seite der Website).
// Aufruf: node tools/obtainium-link.mjs [--inject]
// --inject setzt den Link in beide HTML-Seiten ein und ist wiederholbar.
import { readFileSync, writeFileSync } from 'node:fs';

const site = 'https://keksdose-em1cqm.freebuff.site';
const page = readFileSync('public/downloads/index.html', 'utf8');
const heading = /<h1>Keksdose ([0-9.]+)<\/h1>/.exec(page);
if (!heading) throw new Error('Version steht nicht als „Keksdose 1.0.2“ auf der Download-Seite.');

const settings = {
  // Die Seite verlinkt nur APK-Dateien; die neueste steht ganz oben.
  customLinkFilterRegex: 'Keksdose-[0-9.]+[.]apk$',
  // "Keksdose 1.0.2" steht als Überschrift auf der Seite.
  versionExtractionRegEx: 'Keksdose ([0-9.]+)',
  versionExtractWholePage: true,
  matchGroupToUse: '$1',
  versionDetection: true,
  defaultPseudoVersioningMethod: 'APKLinkHash'
};
const config = {
  id: 'de.keksdose.app',
  url: site + '/downloads/',
  author: 'Keksdose',
  name: 'Keksdose',
  overrideSource: 'HTML',
  additionalSettings: JSON.stringify(settings)
};
const json = JSON.stringify(config);
const link = 'https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/' + encodeURIComponent(json);

// Gegenprobe: so dekodiert Obtainium den Link.
const decoded = JSON.parse(decodeURIComponent(new URL(link).searchParams.get('r').replace('obtainium://app/', '')));
const parsed = JSON.parse(decoded.additionalSettings);
const apk = site + '/downloads/Keksdose-' + heading[1] + '.apk';
const filterOk = new RegExp(parsed.customLinkFilterRegex).test(apk);
const versionMatch = new RegExp(parsed.versionExtractionRegEx).exec('<h1>Keksdose ' + heading[1] + '</h1>');
if (!filterOk || !versionMatch || versionMatch[1] !== heading[1]) {
  throw new Error('Obtainium-Link prüft nicht: ' + JSON.stringify({ filterOk, versionMatch }));
}

console.log(link);

if (process.argv.includes('--inject')) {
  for (const file of ['public/index.html', 'public/downloads/index.html']) {
    const before = readFileSync(file, 'utf8');
    const after = before
      .split('OBTAINIUM_LINK').join(link)
      .replace(/https:\/\/apps\.obtainium\.imranr\.dev\/redirect\?r=obtainium:\/\/app\/[^"]+/g, link);
    writeFileSync(file, after);
    console.log('eingesetzt in ' + file);
  }
}
