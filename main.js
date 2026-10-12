const { Plugin, Notice, TFile } = require('obsidian');

module.exports = class MoveToLinkingFilePlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'move-to-linking-file-folder',
            name: 'Move to folder of linking file (if single backlink)',
            callback: async () => {
                const files = this.getSelectedOrActiveFiles();
                if (files.length === 0) {
                    new Notice('No file selected or active.');
                    return;
                }
                for (const file of files) {
                    await this.handleMove(file);
                }
            }
        });
    }

    /**
     * Returns files selected in the file explorer (multi-select),
     * falling back to the active editor file.
     *
     * Three strategies are tried in order:
     *  1. view.selectedItems  (Set<FileItem> – Obsidian ≥ 1.x internal API)
     *  2. view.fileItems map  + DOM .is-selected class check
     *  3. DOM query .nav-file-title.is-selected[data-path]
     */
    getSelectedOrActiveFiles() {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        const view = fileExplorer?.view;
        const selectedFiles = [];

        if (view) {
            // Strategy 1: selectedItems Set (newer Obsidian internal API)
            if (view.selectedItems instanceof Set && view.selectedItems.size > 0) {
                for (const item of view.selectedItems) {
                    const f = item.file ?? item.vFile;
                    if (f instanceof TFile) selectedFiles.push(f);
                }
            }

            // Strategy 2: fileItems map + DOM .is-selected class check
            if (selectedFiles.length === 0 && view.fileItems) {
                for (const [path, item] of Object.entries(view.fileItems)) {
                    const el = item.selfEl ?? item.el;
                    if (el && el.classList.contains('is-selected')) {
                        const f = this.app.vault.getAbstractFileByPath(path);
                        if (f instanceof TFile) selectedFiles.push(f);
                    }
                }
            }
        }

        // Strategy 3: pure DOM query fallback
        if (selectedFiles.length === 0) {
            const navEls = document.querySelectorAll(
                '.nav-file-title.is-selected[data-path], .nav-file-title.is-selected'
            );
            for (const el of navEls) {
                const path = el.getAttribute('data-path')
                    ?? el.closest('[data-path]')?.getAttribute('data-path');
                if (path) {
                    const f = this.app.vault.getAbstractFileByPath(path);
                    if (f instanceof TFile) selectedFiles.push(f);
                }
            }
        }

        // Final fallback: active editor file
        if (selectedFiles.length === 0) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) selectedFiles.push(activeFile);
        }

        return selectedFiles;
    }

    async handleMove(file) {
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const targetPath = file.path;

        // Find all source files that link to targetPath
        const linkingFiles = [];
        for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
            if (sourcePath === targetPath) continue; // Ignore self-links
            if (links && links[targetPath] !== undefined) {
                const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
                if (sourceFile instanceof TFile) {
                    linkingFiles.push(sourceFile);
                }
            }
        }

        if (linkingFiles.length === 0) {
            new Notice(`"${file.name}": Not possible, no backlinks found`);
            return;
        }

        if (linkingFiles.length > 1) {
            new Notice(`"${file.name}": Not possible, multiple backlinks`);
            return;
        }

        // Exactly 1 backlink
        const linkingFile = linkingFiles[0];
        const targetParentDir = linkingFile.parent ? linkingFile.parent.path : '';
        const currentParentDir = file.parent ? file.parent.path : '';

        if (targetParentDir === currentParentDir) {
            new Notice(`"${file.name}": Already in the same folder as the linking file.`);
            return;
        }

        const newPath = targetParentDir === '' || targetParentDir === '/'
            ? file.name
            : `${targetParentDir}/${file.name}`;

        if (this.app.vault.getAbstractFileByPath(newPath)) {
            new Notice(`"${file.name}": A file with this name already exists in "${targetParentDir}".`);
            return;
        }

        try {
            await this.app.fileManager.renameFile(file, newPath);
            new Notice(`Moved "${file.name}" to "${targetParentDir || 'root'}".`);
        } catch (err) {
            console.error('Failed to move file:', err);
            new Notice(`"${file.name}": Failed to move – ${err.message}`);
        }
    }
};
