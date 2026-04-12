#!/bin/bash
# Netlify build script — runs automatically on every deploy
# Injects the git commit hash into index.html script tags

HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "$(date +%s)")
echo "Cache-busting with hash: $HASH"

# Replace any existing ?v=... or add fresh one
sed -i "s|js/\([a-z]*\)\.js[^\"]*\"|js/\1.js?v=${HASH}\"|g" index.html

echo "Done — index.html updated"
