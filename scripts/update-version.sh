#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$REPO_ROOT/plugins/yolo/version.ts"
COMMAND_FILE="$REPO_ROOT/commands/yolo.md"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LABEL="v$COMMIT $TIMESTAMP"

# Update version.ts
cat > "$VERSION_FILE" <<EOF
// Auto-generated — do not edit manually. Updated by scripts/update-version.sh
export const VERSION = "$COMMIT"
export const TIMESTAMP = "$TIMESTAMP"
EOF

# Update version in command description and body
sed -i '' "s/— v[a-f0-9]\{7\} [0-9T:Z-]\{20\}/— $LABEL/" "$COMMAND_FILE"
sed -i '' "s/YOLO plugin (v[a-f0-9]\{7\} [0-9T:Z-]\{20\})/YOLO plugin ($LABEL)/" "$COMMAND_FILE"

echo "Updated version to $LABEL"
