#!/usr/bin/env bash
# Regenerates the inbox test files in test/fixtures/formats from Markdown, with real tools:
# pandoc (EPUB 3, EPUB 2, Word) and LibreOffice (OpenDocument text). The Kindle file is built
# by scripts/make-mobi-fixture.py, since no Kindle writer is free to install; its metadata is
# checked against KindleUnpack in that script.
#
# The works are made up. Their ISBNs have valid check digits; their DOIs use the 10.1234/e2e.
# prefix the e2e network stub answers.
set -euo pipefail
cd "$(dirname "$0")/.."
out=test/fixtures/formats
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT

# EPUB 3: the ISBN is in the package metadata. A translator is credited, but isn't an author.
cat >"$tmp/book3.md" <<'EOF'
---
title: The Quiet Orchard
creator:
  - role: author
    text: Miriam Okafor
  - role: author
    text: Tomás Reyes
  - role: translator
    text: Ana Lima
identifier:
  - scheme: ISBN-13
    text: 978-0-306-40615-7
publisher: Fieldstone Press
date: 2019-04-02
lang: en-GB
description: A field guide to orchards & the people who keep them.
---

# Chapter one

Apples first.
EOF
pandoc "$tmp/book3.md" -t epub3 -o "$out/orchard.epub"

# EPUB 2: no ISBN in the metadata (only pandoc's UUID); the copyright page names it.
cat >"$tmp/book2.md" <<'EOF'
---
title: Salt Roads
author: Idris Halloran
date: 2011
---

# Copyright

Copyright © 2011 Idris Halloran. All rights reserved.

ISBN 978-1-56619-909-4

# One

The road began at the sea.
EOF
pandoc "$tmp/book2.md" -t epub2 -o "$out/salt-roads.epub"

# Word: title and author in the document properties, a DOI in the text.
cat >"$tmp/report.md" <<'EOF'
---
title: Water Points in the Upper Valley
author:
  - Grace Mbeki
  - Lukas Brandt
---

Field report. Published as https://doi.org/10.1234/e2e.water.

The survey covered forty villages.
EOF
pandoc "$tmp/report.md" -o "$out/water-report.docx"

# OpenDocument: written by LibreOffice from the Word file, so it is LibreOffice's own output.
soffice --headless --convert-to odt --outdir "$tmp" "$out/water-report.docx" >/dev/null
cp "$tmp/water-report.odt" "$out/water-report.odt"

python3 scripts/make-mobi-fixture.py "$out/harbour-lights.azw3"
ls -l "$out"
