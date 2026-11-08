const { Plugin, Notice, TFile, Modal } = require('obsidian');

class MoveErrorModal extends Modal {
    constructor(app, errors) {
        super(app);
        this.errors = errors;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        if (typeof this.setTitle === 'function') {
            this.setTitle('Move to Linking File: Errors');
        } else if (this.titleEl) {
            this.titleEl.setText('Move to Linking File: Errors');
        }

        const isSingle = this.errors.length === 1;
        contentEl.createEl('p', {
            text: isSingle
                ? 'The following file could not be moved:'
                : 'The following files could not be moved:'
        });

        const listContainer = contentEl.createDiv({ cls: 'move-to-linking-file-error-container' });
        listContainer.style.maxHeight = '50vh';
        listContainer.style.overflowY = 'auto';
        listContainer.style.marginBottom = '1.5em';

        const listEl = listContainer.createEl('ul', { cls: 'move-to-linking-file-error-list' });
        listEl.style.margin = '0';
        listEl.style.paddingLeft = '1.5em';

        for (const item of this.errors) {
            const li = listEl.createEl('li');
            li.style.marginBottom = '0.75em';

            li.createEl('strong', { text: item.file.name });
            li.createSpan({ text: `: ${item.reason}` });

            if (item.links && item.links.length > 0) {
                const subList = li.createEl('ul');
                subList.style.marginTop = '0.35em';
                subList.style.marginBottom = '0.35em';
                subList.style.paddingLeft = '1.5em';

                for (const linkingFile of item.links) {
                    const subLi = subList.createEl('li');
                    const linkEl = subLi.createEl('a', {
                        text: linkingFile.path,
                        cls: 'internal-link'
                    });
                    linkEl.style.cursor = 'pointer';
                    linkEl.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.app.workspace.openLinkText(linkingFile.path, '', false);
                    });
                }
            }
        }

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        const okButton = buttonContainer.createEl('button', {
            text: 'OK',
            cls: 'mod-cta'
        });
        okButton.addEventListener('click', () => {
            this.close();
        });
        okButton.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

module.exports = class MoveToLinkingFilePlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'move-to-linking-file-folder',
            name: 'Move to the folders of linking ("parent") files, if single backlink',
            callback: async () => {
                const files = this.getSelectedOrActiveFiles();
                if (files.length === 0) {
                    new Notice('No file selected or active.');
                    return;
                }

                const errors = [];
                const isMultiSelect = files.length > 1;

                for (const file of files) {
                    await this.handleMove(file, errors, isMultiSelect);
                }

                if (errors.length > 0) {
                    new MoveErrorModal(this.app, errors).open();
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

    async handleMove(file, errors, isMultiSelect) {
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
            const reason = '*NO* backlinks found';
            if (isMultiSelect) {
                errors.push({ file, reason });
            } else {
                new Notice(`"${file.name}" not moved: ${reason}`);
            }
            return;
        }

        if (linkingFiles.length > 1) {
            errors.push({
                file,
                reason: `*MULTIPLE* backlinks found (${linkingFiles.length})`,
                links: linkingFiles
            });
            return;
        }

        // Exactly 1 backlink
        const linkingFile = linkingFiles[0];
        const targetParentDir = linkingFile.parent ? linkingFile.parent.path : '';
        const currentParentDir = file.parent ? file.parent.path : '';

        if (targetParentDir === currentParentDir) {
            if (!isMultiSelect) {
                new Notice(`"${file.name}" not moved: Already in the same folder as the linking file.`);
            }
            return;
        }

        const newPath = targetParentDir === '' || targetParentDir === '/'
            ? file.name
            : `${targetParentDir}/${file.name}`;

        if (this.app.vault.getAbstractFileByPath(newPath)) {
            const reason = `A file with this name already exists in "${targetParentDir || 'root'}".`;
            if (isMultiSelect) {
                errors.push({ file, reason });
            } else {
                new Notice(`"${file.name}" not moved: ${reason}`);
            }
            return;
        }

        try {
            await this.app.fileManager.renameFile(file, newPath);
            new Notice(`Moved "${file.name}" to "${targetParentDir || 'root'}".`);
        } catch (err) {
            console.error('Failed to move file:', err);
            const reason = `Failed to move. ${err.message}`;
            if (isMultiSelect) {
                errors.push({ file, reason });
            } else {
                new Notice(`"${file.name}": ${reason}`);
            }
        }
    }
};
