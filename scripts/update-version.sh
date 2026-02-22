#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$REPO_ROOT/plugins/yolo/version.ts"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

cat > "$VERSION_FILE" <<EOF
// Auto-generated — do not edit manually. Updated by scripts/update-version.sh
export const VERSION = "$COMMIT"
EOF

echo "Updated version.ts to $COMMIT"
