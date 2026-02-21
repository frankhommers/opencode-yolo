# YOLO Plugin

YOLO auto-replies when the assistant asks a question. When enabled, it injects one user message:

`You choose what's best`

It only replies once per assistant message and ignores messages already sourced from the plugin.

## Commands

- Enable: `/yolo on`
- Disable: `/yolo off`
- Status: `/yolo status`

## Config file

YOLO stores its enabled state in:

`~/.config/opencode/plugins/yolo.json`
