#!/bin/bash

# Convert tags from JSON to MDOC
cd src/content/tags
for f in *.json; do
  if [ -f "$f" ]; then
    slug="${f%.json}"
    title=$(cat "$f" | jq -r '.title')

    echo "Converting $slug..."

    cat > "${slug}.mdoc" <<EOF
---
title: $title
---
EOF

    rm "$f"
  fi
done

echo "Tags converted!"

# Convert editeurs from JSON to MDOC
cd ../editeurs
for f in *.json; do
  if [ -f "$f" ]; then
    slug="${f%.json}"
    name=$(cat "$f" | jq -r '.name')

    echo "Converting $slug..."

    cat > "${slug}.mdoc" <<EOF
---
name: $name
---
EOF

    rm "$f"
  fi
done

echo "Publishers converted!"
