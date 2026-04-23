#!/bin/bash
# Netlify build script — runs automatically on every deploy
# Injects the git commit hash for cache-busting:
#   - ?v=<hash> on every js/ and css/ asset reference in index.html
#   - CACHE_NAME in sw.js bumped to motoroute-<hash> so each deploy = new SW

set -e

HASH=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
echo "Cache-busting with hash: $HASH"

# --- index.html: version-stamp js/ AND css/ refs --------------------------
# Strip any existing ?v=... first so reruns stay idempotent
sed -i 's|\(js/[a-z]*\.js\)?v=[^"]*"|\1"|g'  index.html
sed -i 's|\(css/[a-z]*\.css\)?v=[^"]*"|\1"|g' index.html

# Then add fresh ?v=
sed -i "s|\(js/[a-z]*\.js\)\"|\1?v=${HASH}\"|g"  index.html
sed -i "s|\(css/[a-z]*\.css\)\"|\1?v=${HASH}\"|g" index.html

# --- sw.js: bump CACHE_NAME so each deploy invalidates old SW cache ------
sed -i "s|^const CACHE_NAME = .*|const CACHE_NAME = 'motoroute-${HASH}';|" sw.js

echo "Done — index.html and sw.js updated for hash ${HASH}"
