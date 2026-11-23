#!/usr/bin/env bash
# Baut das Keksdose-APK ohne Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Voraussetzungen: JDK 17, Android SDK mit platforms/android-34 und build-tools/34.0.0.
#   ANDROID_HOME (oder ANDROID_SDK_ROOT) zeigen auf das SDK, sonst wird
#   $HOME/opt/android-sdk versucht.
#
# Ergebnis: android/dist/Keksdose-<Version>.apk
set -euo pipefail
cd "$(dirname "$0")"

VERSION_NAME="${VERSION_NAME:-1.0.1}"
VERSION_CODE="${VERSION_CODE:-2}"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/opt/android-sdk}}"
BUILD_TOOLS="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
PLATFORM="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"
export JAVA_HOME="${JAVA_HOME:-$HOME/opt/jdk-17.0.21.1+2}"
export PATH="$JAVA_HOME/bin:$PATH"
JAR="$PLATFORM/android.jar"

if [ -z "$BUILD_TOOLS" ] || [ -z "$PLATFORM" ] || [ ! -f "$JAR" ]; then
  echo "Android SDK nicht gefunden (ANDROID_HOME=$SDK)." >&2
  echo "Benötigt: platforms/android-34 und build-tools/34.0.0." >&2
  exit 1
fi

OUT="build"
DIST="dist"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex" "$DIST"

echo "==> Ressourcen kompilieren"
"$BUILD_TOOLS/aapt2" compile --dir res -o "$OUT/res.zip"

# Website als Assets übernehmen, aber den Download-Ordner auslassen:
# Dort liegt die APK selbst, die nicht im APK landen soll.
STAGE="$OUT/site"
mkdir -p "$STAGE"
cp -a ../public/. "$STAGE"/
rm -rf "$STAGE/downloads"

# Version aus der Umgebung in eine Arbeitskopie des Manifests schreiben –
# aapt2 ignoriert --version-code/--version-name, wenn das Manifest sie nennt.
sed -E "s/android:versionCode=\"[0-9]+\"/android:versionCode=\"$VERSION_CODE\"/; s/android:versionName=\"[^\"]+\"/android:versionName=\"$VERSION_NAME\"/" \
  AndroidManifest.xml > "$OUT/AndroidManifest.xml"

echo "==> APK-Rahmen linken (Assets: public ohne downloads)"
"$BUILD_TOOLS/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  -A "$STAGE" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  "$OUT/res.zip"

echo "==> Java übersetzen"
find "$OUT/gen" src -name '*.java' > "$OUT/sources.txt"
"$JAVA_HOME/bin/javac" -source 11 -target 11 -Xlint:-options -classpath "$JAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "==> Dex erzeugen"
find "$OUT/classes" -name '*.class' -print0 | xargs -0 "$BUILD_TOOLS/d8" \
  --lib "$JAR" --min-api 24 --output "$OUT/dex"

echo "==> APK packen"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -X ../unsigned.apk classes.dex)

echo "==> Ausrichten und signieren"
"$BUILD_TOOLS/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# Signatur: Standard-Debug-Schlüssel, damit das APK ohne eigenen Key installierbar
# ist. Für Play Store oder garantierte Updates gehört hier ein eigener Release-Key
# hin (KEYSTORE/KS_PASS/KEY_ALIAS/KEY_PASS setzen).
KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
KS_PASS="${KS_PASS:-android}"
KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"
KEY_PASS="${KEY_PASS:-android}"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEYSTORE" \
    -storepass "$KS_PASS" -keypass "$KEY_PASS" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null
fi

APK="$DIST/Keksdose-$VERSION_NAME.apk"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KEY_PASS" \
  --ks-key-alias "$KEY_ALIAS" \
  --out "$APK" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK" | head -4

echo "==> Fertig: $APK ($(du -h "$APK" | cut -f1))"
