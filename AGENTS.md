## Project Overview

**Plugin name:** Move to Linking File  
**Plugin ID:** `move-to-linking-file`  
**Location:** `L:\Dropbox\Obsidian\TestVaults\Test1\.obsidian\plugins\move-to-linking-file\`  
**Vault:** `L:\Dropbox\Obsidian\TestVaults\Test1\`  
**Obsidian API minimum version:** `0.15.0`  
**Build system:** None – the plugin is a single-file `main.js` (CommonJS), no TypeScript compilation or bundler required.

---

## What the Plugin Does

The plugin registers one Obsidian command:

> **"Move to folder of linking file (if single backlink)"**

### Algorithm (per file)

1. Determine the set of files to process (see *Multi-Selection* below).
2. For each file, inspect `app.metadataCache.resolvedLinks` to find all notes that contain a wiki-link (`[[...]]`) pointing to this file.
3. **0 backlinks** → Notice: `"<name>": Not possible, no backlinks found`
4. **> 1 backlinks** → Notice: `"<name>": Not possible, multiple backlinks`
5. **Exactly 1 backlink** →
   - Determine the parent folder of the linking file.
   - If the file is already in that folder → Notice: already there.
   - If a file with the same name already exists at the target → Notice: name conflict.
   - Otherwise: move using `app.fileManager.renameFile(file, newPath)`.
     This API call automatically updates all internal wiki-links vault-wide.
   - Notice: `Moved "<name>" to "<folder>".`

---

## Multi-File Selection

The command supports processing multiple files at once when several files are selected in the **file explorer** (left sidebar tree). Files are collected by `getSelectedOrActiveFiles()`, which tries three strategies in order:

| # | Strategy | Notes |
|---|---|---|
| 1 | `view.selectedItems` (a `Set<FileItem>`) | Internal Obsidian API, may not exist in all versions |
| 2 | `view.fileItems` map + `.is-selected` CSS class check on `item.selfEl ?? item.el` | **Confirmed working** in the tested Obsidian version |
| 3 | DOM query: `.nav-file-title.is-selected[data-path]` | Pure DOM fallback, version-independent |
| — | `app.workspace.getActiveFile()` | Final fallback when no explorer selection is detected |

> **Confirmed:** Strategy 2 (`fileItems` + DOM class check) was verified to work correctly in the test session that produced this file. When debugging, temporarily re-add `console.log` statements after each strategy to identify which one fires.

Only `TFile` instances are included (folders are excluded).

---

## Key Obsidian APIs Used

| API | Purpose |
|---|---|
| `app.metadataCache.resolvedLinks` | `Record<sourcePath, Record<targetPath, count>>` – used to find backlinks. Iterate all entries, check if `links[targetPath]` exists. |
| `app.fileManager.renameFile(file, newPath)` | Moves a file AND updates all internal links in the vault automatically. Prefer this over `app.vault.rename()`. |
| `app.vault.getAbstractFileByPath(path)` | Resolves a path string to a `TAbstractFile`. Cast to `TFile` to confirm it's a file (not a folder). |
| `app.workspace.getLeavesOfType('file-explorer')` | Gets the file explorer panel. `[0].view` gives the `FileExplorerView`. |
| `app.workspace.getActiveFile()` | Returns the currently open file in the editor. |
| `new Notice(message)` | Displays a toast notification to the user. |

---

## Known Issues & Pitfalls

- **`app.metadataCache` may not be fully populated** immediately after vault load. If the plugin behaves unexpectedly right after startup, wait a few seconds for the cache to warm up.
- **`resolvedLinks` key format:** Keys are vault-relative paths using forward slashes (e.g. `Subfolder/Note.md`), regardless of OS.
- **No TypeScript / no bundler:** Do not introduce a build step unless necessary. Keep changes to `main.js` directly. Validate syntax with `node --check main.js`.
- **Folder move not supported:** The plugin only processes `TFile` instances. Folders selected in the file explorer are silently ignored.
- **Name conflicts:** If a file with the same name exists in the target folder, the move is aborted with a notice. No overwrite happens.

---

## Development Workflow

1. Edit `main.js` directly (no build step).
2. Validate syntax: `node --check main.js`
3. In Obsidian: `Ctrl+P` → *Reload app without saving* (or disable/re-enable the plugin in Settings → Community Plugins).
4. Open the developer console (`Ctrl+Shift+I`) to inspect any errors.
