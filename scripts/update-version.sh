#!/usr/bin/env bash
set -euo pipefail

# Updates the header version to the form YYYY.MM.DD.<dailyCount>V
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT/components/header.html"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to compute commit count" >&2
  exit 1
fi

date_str=$(date +%Y.%m.%d)
date_iso=$(date +%Y-%m-%d)
# Count commits made today (local time) to produce a per-day counter
commit_count=$(git rev-list --count --since="${date_iso} 00:00" HEAD)
version="${date_str}.${commit_count}V"

# Replace any existing version-like token in the header
perl -0pi -e 's|>\d{4}\.\d{2}\.\d{2}\.\d+V<|>'"$version"'<|g' "$FILE"

echo "Updated version to $version in $FILE"
