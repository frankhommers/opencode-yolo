#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/yolo"
PLUGIN_REF="file://$PLUGIN_DIR"
GLOBAL_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

deploy_to_project() {
  local PROJECT="$1"
  PROJECT="$(eval echo "$PROJECT")"  # expand ~
  if [ ! -d "$PROJECT" ]; then
    echo "SKIP: $PROJECT does not exist"
    return
  fi

  local OC_DIR="$PROJECT/.opencode"
  local CMD_DIR="$OC_DIR/commands"
  local CONFIG="$OC_DIR/opencode.json"

  # Create dirs
  mkdir -p "$CMD_DIR"

  # Copy command definition
  cp "$REPO_ROOT/commands/yolo.md" "$CMD_DIR/yolo.md"

  # Ensure opencode.json exists with plugin reference
  if [ -f "$CONFIG" ]; then
    if grep -q "$PLUGIN_REF" "$CONFIG" 2>/dev/null; then
      echo "OK: $PROJECT (plugin already registered)"
    else
      if grep -q '"plugin"' "$CONFIG" 2>/dev/null; then
        sed -i '' "s|\"plugin\": \[|\"plugin\": [\n    \"$PLUGIN_REF\",|" "$CONFIG"
        echo "OK: $PROJECT (added plugin to existing config)"
      else
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
}

deploy_global() {
  local CONFIG="$GLOBAL_CONFIG_DIR/opencode.json"
  local CMD_DIR="$GLOBAL_CONFIG_DIR/commands"

  if [ ! -d "$GLOBAL_CONFIG_DIR" ]; then
    echo "ERROR: Global config dir $GLOBAL_CONFIG_DIR does not exist"
    exit 1
  fi

  # Deploy command definition
  mkdir -p "$CMD_DIR"
  cp "$REPO_ROOT/commands/yolo.md" "$CMD_DIR/yolo.md"
  echo "OK: Deployed yolo.md to $CMD_DIR/"

  # Add plugin to global config
  if [ -f "$CONFIG" ]; then
    if grep -q "$PLUGIN_REF" "$CONFIG" 2>/dev/null; then
      echo "OK: Global config (plugin already registered)"
    else
      if grep -q '"plugin"' "$CONFIG" 2>/dev/null; then
        sed -i '' "s|\"plugin\": \[|\"plugin\": [\n    \"$PLUGIN_REF\",|" "$CONFIG"
        echo "OK: Global config (added plugin)"
      else
        sed -i '' "s|}|,\n  \"plugin\": [\n    \"$PLUGIN_REF\"\n  ]\n}|" "$CONFIG"
        echo "OK: Global config (created plugin array)"
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
    echo "OK: Global config (created with plugin)"
  fi

  echo ""
  echo "YOLO plugin is now enabled globally."
  echo "Restart OpenCode sessions for the change to take effect."
}

# Parse arguments
if [ $# -eq 0 ]; then
  echo "Usage: $0 --global | <project-dir> [<project-dir> ...]"
  echo ""
  echo "  --global          Deploy to ~/.config/opencode/ (all projects)"
  echo "  <project-dir>     Deploy to specific project(s)"
  echo ""
  echo "Examples:"
  echo "  $0 --global"
  echo "  $0 ~/Repos/kippenpedia ~/Temp/oc"
  exit 1
fi

if [ "$1" = "--global" ]; then
  deploy_global
else
  for PROJECT in "$@"; do
    deploy_to_project "$PROJECT"
  done
fi
