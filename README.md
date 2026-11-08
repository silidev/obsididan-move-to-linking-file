## Usage
This is well tested, I use it daily. If this fails to install, install it with BRAT directly from GitHub.

Moves the active and selected files to the folders of their backlinking files, if exactly one backlink exists. Moves can be undone with the plugin [File Undo](https://community.obsidian.md/plugins/file-undo).

Adds the command 'Move to the folders of linking ("parent") files, if single backlink'.

Also helpful to organize into folders is my plugin [Move to subfolder](https://community.obsidian.md/plugins/move-to-subfolder).

## Installation
Install it from https://community.obsidian.md/plugins/move-to-linking-file.
Consider assigning it to a hotkey (I use F3).

## Changelog
### 1.0.8
- Documentation improvements and link fixes.
- Aligned command name in manifest.
- Added automated GitHub release script.


### 1.0.5
- **Error confirmation modal:** When a file cannot be moved because it has multiple backlinks (or other errors occur), an interactive confirmation modal now opens listing the conflicting notes, preventing errors from being missed due to disappearing toast notifications.
- **Batch move error summary:** When multiple files are selected, errors are collected and summarized in a single modal at the end instead of multiple toasts.
