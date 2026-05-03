#!/bin/bash
# Netlify build script — runs automatically on every deploy
# Injects the git commit hash for cache-busting:
#   - ?v=<hash> on every js/ and css/ asset reference in index.html
#   - CACHE_NAME in sw.js bumped to motoroute-<hash> so each deploy = new SW

set -e

HASH=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
BUILD_DATE=$(date -u +"%d.%m.%Y %H:%M UTC")
echo "Cache-busting with hash: $HASH  |  Build: $BUILD_DATE"

# --- index.html: version-stamp js/ AND css/ refs --------------------------
# Strip any existing ?v=... first so reruns stay idempotent
sed -i 's|\(js/[a-z][a-z0-9-]*\.js\)?v=[^"]*"|\1"|g'  index.html
sed -i 's|\(css/[a-z][a-z0-9-]*\.css\)?v=[^"]*"|\1"|g' index.html

# Then add fresh ?v=
sed -i "s|\(js/[a-z][a-z0-9-]*\.js\)\"|\1?v=${HASH}\"|g"  index.html
sed -i "s|\(css/[a-z][a-z0-9-]*\.css\)\"|\1?v=${HASH}\"|g" index.html

# --- sw.js: bump CACHE_NAME so each deploy invalidates old SW cache ------
sed -i "s|^const CACHE_NAME = .*|const CACHE_NAME = 'motoroute-${HASH}';|" sw.js

# --- config.js: inject APP_VERSION and BUILD_DATE ---------------------------
sed -i "s|const APP_VERSION = .*|const APP_VERSION = '${HASH}';|" js/config.js
sed -i "s|const BUILD_DATE  = .*|const BUILD_DATE  = '${BUILD_DATE}';|" js/config.js

echo "Done — index.html, sw.js and config.js updated for hash ${HASH}"
