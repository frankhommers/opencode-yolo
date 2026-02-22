#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$REPO_ROOT/plugins/yolo/version.ts"
COMMAND_FILE="$REPO_ROOT/commands/yolo.md"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

# Update version.ts
cat > "$VERSION_FILE" <<EOF
// Auto-generated — do not edit manually. Updated by scripts/update-version.sh
export const VERSION = "$COMMIT"
EOF

# Update version in command description
sed -i '' "s/— v[a-f0-9]\{7\}/— v$COMMIT/" "$COMMAND_FILE"

echo "Updated version to $COMMIT"
