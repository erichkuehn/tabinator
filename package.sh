#!/bin/sh
# Build dist/tabinator-<version>.zip from the committed files, with everything
# inside a top-level `tabinator/` folder. Commit your changes first.
set -eu
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/tabinator-$version.zip"

mkdir -p dist
rm -f "$out"
git archive --format=zip --prefix=tabinator/ -o "$out" HEAD \
  manifest.json background.js content.js popup.html popup.js icons LICENSE README.md
echo "$out"
