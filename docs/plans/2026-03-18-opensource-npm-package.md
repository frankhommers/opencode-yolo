# Open-source & npm package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform opencode-yolo from a private local project into a published npm package at `@frankhommers/opencode-yolo` with an MIT license and public GitHub repo.

**Architecture:** Flatten `plugins/yolo/*.ts` to the project root. Add TypeScript build step (`tsc` → `dist/`). Publish compiled JS + declarations to npm. Users install via `npm install @frankhommers/opencode-yolo` and reference it in their opencode config.

**Tech Stack:** TypeScript, tsc (no bundler), npm, GitHub (via `gh` CLI)

---

### Task 1: Move plugin source files to project root

**Files:**
- Move: `plugins/yolo/opencodeCore.ts` → `opencodeCore.ts`
- Move: `plugins/yolo/opencodePlugin.ts` → `opencodePlugin.ts`
- Move: `plugins/yolo/isQuestion.ts` → `isQuestion.ts`
- Move: `plugins/yolo/commands.ts` → `commands.ts`
- Move: `plugins/yolo/state.ts` → `state.ts`
- Move: `plugins/yolo/index.ts` → `index.ts`
- Move: `plugins/yolo/version.ts` → `version.ts`
- Move: `plugins/yolo/opencodeCore.ts` test → `opencodePlugin.test.ts`
- Move: `plugins/yolo/opencodePlugin.test.ts` → keep name
- Move: `plugins/yolo/opencodePlugin.runtime.test.ts` → keep name
- Move: `plugins/yolo/isQuestion.test.ts` → keep name
- Move: `plugins/yolo/commands.test.ts` → keep name
- Move: `plugins/yolo/state.test.ts` → keep name
- Delete: `plugins/yolo/package.json` (replaced by root package.json)
- Delete: `plugins/yolo/README.md` (replaced by root README.md)
- Delete: `plugins/` directory

**Step 1: Move all files**

```bash
mv plugins/yolo/opencodeCore.ts .
mv plugins/yolo/opencodePlugin.ts .
mv plugins/yolo/isQuestion.ts .
mv plugins/yolo/commands.ts .
mv plugins/yolo/state.ts .
mv plugins/yolo/index.ts .
mv plugins/yolo/version.ts .
mv plugins/yolo/opencodePlugin.test.ts .
mv plugins/yolo/opencodePlugin.runtime.test.ts .
mv plugins/yolo/isQuestion.test.ts .
mv plugins/yolo/commands.test.ts .
mv plugins/yolo/state.test.ts .
```

**Step 2: Remove old plugin directory**

```bash
rm plugins/yolo/package.json plugins/yolo/README.md
rmdir plugins/yolo
rmdir plugins
```

**Step 3: Run tests to verify imports still work**

Run: `npm test`
Expected: All tests pass (imports are relative within the same directory, so they should resolve identically)

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: flatten plugins/yolo/ to project root"
```

---

### Task 2: Update package.json for npm publishing

**Files:**
- Modify: `package.json`

**Step 1: Rewrite package.json**

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@frankhommers/opencode-yolo",
  "version": "0.1.0",
  "type": "module",
  "description": "OpenCode plugin that auto-replies to assistant messages so you don't have to manually confirm or approve",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "clean": "rm -rf dist",
    "build": "npm run clean && tsc",
    "prepublishOnly": "npm run build",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "opencode",
    "opencode-plugin",
    "plugin",
    "yolo",
    "auto-reply",
    "auto-approve"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/frankhommers/opencode-yolo.git"
  },
  "bugs": {
    "url": "https://github.com/frankhommers/opencode-yolo/issues"
  },
  "homepage": "https://github.com/frankhommers/opencode-yolo#readme",
  "author": "Frank Hommers",
  "license": "MIT",
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "peerDependencies": {
    "@opencode-ai/plugin": ">=0.13.7"
  },
  "devDependencies": {
    "@opencode-ai/plugin": ">=0.13.7",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  },
  "dependencies": {
    "@opencode-ai/sdk": "^1.2.10"
  }
}
```

Note: `@opencode-ai/sdk` stays in dependencies (used at runtime by `opencodePlugin.ts`). `@opencode-ai/plugin` is added as peerDependency (following opencode-smart-title convention) and devDependency for local development.

**Step 2: Install to update lockfile**

```bash
npm install
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: update package.json for npm publishing"
```

---

### Task 3: Update tsconfig.json for build output

**Files:**
- Modify: `tsconfig.json`

**Step 1: Rewrite tsconfig.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node", "vitest/globals"]
  },
  "include": [
    "index.ts",
    "opencodePlugin.ts",
    "opencodeCore.ts",
    "isQuestion.ts",
    "commands.ts",
    "state.ts",
    "version.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
```

**Step 2: Verify build**

```bash
npm run build
```
Expected: `dist/` directory created with `.js`, `.d.ts`, `.d.ts.map`, `.js.map` files

**Step 3: Verify typecheck**

```bash
npm run typecheck
```
Expected: No errors

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: configure tsconfig for dist output with declarations"
```

---

### Task 4: Add LICENSE file

**Files:**
- Create: `LICENSE`

**Step 1: Create MIT license**

```
MIT License

Copyright (c) 2025 Frank Hommers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE && git commit -m "chore: add MIT license"
```

---

### Task 5: Add .npmignore

**Files:**
- Create: `.npmignore`

**Step 1: Create .npmignore**

```
# Development files
node_modules/
*.log
.DS_Store
tsconfig.json
bun.lock
package-lock.json
vitest.config.ts

# Source files (shipping dist/)
*.ts
!*.d.ts

# Tests
*.test.ts

# Git & config
.git/
.gitignore
.opencode/
.worktrees/
.yolo.json

# Scripts & docs
scripts/
docs/
commands/
```

**Step 2: Commit**

```bash
git add .npmignore && git commit -m "chore: add .npmignore for clean npm package"
```

---

### Task 6: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Update .gitignore**

```
# Dependencies
node_modules/
bun.lock
package-lock.json

# Build output
dist/
*.tgz

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Local config
.worktrees/
.opencode/
.yolo.json
```

**Step 2: Commit**

```bash
git add .gitignore && git commit -m "chore: update .gitignore for npm package"
```

---

### Task 7: Update README.md

**Files:**
- Modify: `README.md` (move content from `plugins/yolo/README.md`, already at root after Task 1)

The README should be rewritten to show npm-based installation as the primary method, with the `file://` method as a development alternative. Keep the existing content about modes, replies, and commands.

Update the install section to:

```markdown
## Install

```bash
npm install @frankhommers/opencode-yolo
```

Add to your OpenCode config (`~/.config/opencode/opencode.json` for global, or `.opencode/opencode.json` for per-project):

```json
{
  "plugin": ["@frankhommers/opencode-yolo"]
}
```

Add the command definition to `~/.config/opencode/commands/yolo.md` (or `.opencode/commands/yolo.md`):

```md
---
name: yolo
description: Toggle or inspect YOLO mode (on/off/aggressive/status)
subtask: false
arguments:
  - name: action
    description: "One of: on, off, aggressive, status, start"
    required: false
---
```
```

**Step 1: Write the updated README.md**
**Step 2: Commit**

```bash
git add README.md && git commit -m "docs: update README for npm package installation"
```

---

### Task 8: Update scripts for new file layout

**Files:**
- Modify: `scripts/update-version.sh` (update path from `plugins/yolo/version.ts` to `version.ts`)
- Modify: `scripts/deploy-local.sh` (update plugin ref path — now points to project root)

**Step 1: Fix version script path**

Change `VERSION_FILE="$REPO_ROOT/plugins/yolo/version.ts"` to `VERSION_FILE="$REPO_ROOT/version.ts"`

**Step 2: Fix deploy script plugin ref**

Change `PLUGIN_DIR="$REPO_ROOT/plugins/yolo"` to `PLUGIN_DIR="$REPO_ROOT"`

**Step 3: Run tests**

```bash
npm test
```
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: update scripts for flattened project layout"
```

---

### Task 9: Verify build and package contents

**Step 1: Clean build**

```bash
npm run build
```
Expected: `dist/` with compiled JS + declarations

**Step 2: Dry-run pack**

```bash
npm pack --dry-run
```
Expected: Only `dist/`, `README.md`, `LICENSE`, `package.json` in the tarball. No source `.ts` files, no test files, no scripts.

**Step 3: Run tests one final time**

```bash
npm test
```
Expected: All tests pass

---

### Task 10: Create GitHub repo and push

**Step 1: Create public GitHub repo**

```bash
gh repo create frankhommers/opencode-yolo --public --source=. --remote=origin --push
```

**Step 2: Verify**

```bash
git remote -v
gh repo view frankhommers/opencode-yolo
```

---

### Task 11: Publish to npm

**Step 1: Publish**

```bash
npm publish --access public
```

**Step 2: Verify**

```bash
npm view @frankhommers/opencode-yolo
```

Expected: Package visible on npm with correct metadata.
