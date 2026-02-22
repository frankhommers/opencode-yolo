#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/yolo"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <project-dir> [<project-dir> ...]"
  echo "Example: $0 ~/Repos/kippenpedia ~/Temp/oc"
  exit 1
fi

for PROJECT in "$@"; do
  PROJECT="$(eval echo "$PROJECT")"  # expand ~
  if [ ! -d "$PROJECT" ]; then
    echo "SKIP: $PROJECT does not exist"
    continue
  fi

  OC_DIR="$PROJECT/.opencode"
  CMD_DIR="$OC_DIR/commands"
  CONFIG="$OC_DIR/opencode.json"

  # Create dirs
  mkdir -p "$CMD_DIR"

  # Copy command definition
  cp "$REPO_ROOT/commands/yolo.md" "$CMD_DIR/yolo.md"

  # Ensure opencode.json exists with plugin reference
  PLUGIN_REF="file://$PLUGIN_DIR"
  if [ -f "$CONFIG" ]; then
    # Check if plugin is already referenced
    if grep -q "$PLUGIN_REF" "$CONFIG" 2>/dev/null; then
      echo "OK: $PROJECT (plugin already registered)"
    else
      # Add plugin to existing config using a simple approach
      # Replace the plugin array or add one
      if grep -q '"plugin"' "$CONFIG" 2>/dev/null; then
        # Plugin array exists — add our ref
        sed -i '' "s|\"plugin\": \[|\"plugin\": [\n    \"$PLUGIN_REF\",|" "$CONFIG"
        echo "OK: $PROJECT (added plugin to existing config)"
      else
        # No plugin array — add one before the closing brace
        sed -i '' "s|}|,\n  \"plugin\": [\n    \"$PLUGIN_REF\"\n  ]\n}|" "$CONFIG"
        echo "OK: $PROJECT (created plugin array in config)"
      fi
    fi
  else
    cat > "$CONFIG" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_REF"
  ]
}
EOF
    echo "OK: $PROJECT (created config with plugin)"
  fi
done
