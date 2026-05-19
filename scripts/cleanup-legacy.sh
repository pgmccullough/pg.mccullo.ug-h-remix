#!/usr/bin/env bash
# Removes legacy files left over from the Remix v1 setup. These couldn't be
# deleted from the migration sandbox because of Windows mount permissions —
# run this once on your Windows machine (Git Bash works fine) after pulling
# the rr7-migration branch.
#
# Safe to re-run; missing files are just skipped.

set -u

cd "$(dirname "$0")/.." || exit 1

echo "== Removing legacy framework files =="
for f in \
  app.arc \
  server.js \
  remix.config.js \
  remix.env.d.ts \
  package-lock.json \
  app/routes/api.tsx \
  app/routes/api/index.tsx \
; do
  if [ -e "$f" ]; then
    rm -f "$f" && echo "  removed: $f"
  else
    echo "  (already gone): $f"
  fi
done

echo "== Removing legacy directories =="
for d in src app/utils/Lexical; do
  if [ -d "$d" ]; then
    rm -rf "$d" && echo "  removed: $d/"
  else
    echo "  (already gone): $d/"
  fi
done

echo
echo "Done. Now:"
echo "  npm install"
echo "  npm run typecheck"
echo "  npm run build"
