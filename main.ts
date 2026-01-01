import {
	MarkdownView,
	Plugin,
	TFile,
	TFolder,
	getAllTags,
	Notice,
	TAbstractFile,
	normalizePath,
	SuggestModal,
	App,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	AutoNoteMoverSettings,
	AutoNoteMoverSettingTab,
	FolderRule,
} from 'settings/settings';
import { fileMove, getTriggerIndicator, isFmDisable } from 'utils/Utils';

// ============ FOLDER SUGGEST MODAL ============

class FolderSuggestModal extends SuggestModal<TFolder> {
	private folders: TFolder[];
	private onSelectCallback: (folder: TFolder) => void;

	constructor(app: App, folders: TFolder[], onSelect: (folder: TFolder) => void) {
		super(app);
		this.folders = folders;
		this.onSelectCallback = onSelect;
		this.setPlaceholder('Select a folder to scan');
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.folders.filter((f) => f.path.toLowerCase().includes(q));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.createEl('div', { text: folder.path || '/' });
	}

	onChooseSuggestion(folder: TFolder): void {
		this.onSelectCallback(folder);
	}
}

// ============ MAIN PLUGIN CLASS ============

export default class AutoNoteMover extends Plugin {
	settings: AutoNoteMoverSettings;

	onload(): void {
		void this.onloadAsync();
	}

	async onloadAsync(): Promise<void> {
		await this.loadSettings();

		const fileCheck = (file: TAbstractFile, oldPath?: string, caller?: string) => {
			if (this.settings.trigger_auto_manual !== 'Automatic' && caller !== 'cmd') {
				return;
			}
			if (!(file instanceof TFile)) return;

			// The rename event with no basename change will be terminated.
			if (oldPath && oldPath.split('/').pop() === file.basename + '.' + file.extension) {
				return;
			}

			// Excluded Folder check
			const excludedFolder = this.settings.excluded_folder;
			const excludedFolderLength = excludedFolder.length;
			for (let i = 0; i < excludedFolderLength; i++) {
				if (
					!this.settings.use_regex_to_check_for_excluded_folder &&
					excludedFolder[i].folder &&
					file.parent.path === normalizePath(excludedFolder[i].folder)
				) {
					return;
				} else if (this.settings.use_regex_to_check_for_excluded_folder && excludedFolder[i].folder) {
					const regex = new RegExp(excludedFolder[i].folder);
					if (regex.test(file.parent.path)) {
						return;
					}
				}
			}

			const fileCache = this.app.metadataCache.getFileCache(file);
			// Disable AutoNoteMover when "AutoNoteMover: disable" is present in the frontmatter.
			if (isFmDisable(fileCache)) {
				return;
			}

			const fileName = file.basename;
			const fileFullName = file.basename + '.' + file.extension;
			const cacheTag = getAllTags(fileCache) ?? [];

			// Check rules
			for (const rule of this.settings.rules) {
				const byTags = this.matchesTags(rule, cacheTag, this.settings.use_regex_to_check_for_tags);
				const byTitle = this.matchesTitle(rule, fileName);

				if (byTags || byTitle) {
					void fileMove(this.app, rule.folder, fileFullName, file);
					break;
				}
			}
		};

		// Show trigger indicator on status bar
		let triggerIndicator: HTMLElement;
		const setIndicator = () => {
			if (!this.settings.statusBar_trigger_indicator) return;
			triggerIndicator.setText(getTriggerIndicator(this.settings.trigger_auto_manual));
		};
		if (this.settings.statusBar_trigger_indicator) {
			triggerIndicator = this.addStatusBarItem();
			setIndicator();
			// TODO: Is there a better way?
			this.registerDomEvent(window, 'change', setIndicator);
		}

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on('create', (file) => fileCheck(file)));
			this.registerEvent(this.app.metadataCache.on('changed', (file) => fileCheck(file)));
			this.registerEvent(this.app.vault.on('rename', (file, oldPath) => fileCheck(file, oldPath)));
		});

		const moveNoteCommand = (view: MarkdownView) => {
			if (isFmDisable(this.app.metadataCache.getFileCache(view.file))) {
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- plugin name is a proper noun
				new Notice('Auto Note Mover is disabled in the frontmatter.');
				return;
			}
			fileCheck(view.file, undefined, 'cmd');
		};

		this.addCommand({
			id: 'Move-the-note',
			name: 'Move the note',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						moveNoteCommand(markdownView);
					}
					return true;
				}
			},
		});

		this.addCommand({
			id: 'Toggle-Auto-Manual',
			name: 'Toggle auto-manual',
			callback: () => {
				if (this.settings.trigger_auto_manual === 'Automatic') {
					this.settings.trigger_auto_manual = 'Manual';
					void this.saveData(this.settings);
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- plugin name is a proper noun
					new Notice('[Auto Note Mover]\nTrigger is manual.');
				} else if (this.settings.trigger_auto_manual === 'Manual') {
					this.settings.trigger_auto_manual = 'Automatic';
					void this.saveData(this.settings);
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- plugin name is a proper noun
					new Notice('[Auto Note Mover]\nTrigger is automatic.');
				}
				setIndicator();
			},
		});

		// New command: Scan folder and move notes
		this.addCommand({
			id: 'scan-folder-and-move-notes',
			name: 'Scan folder and move notes',
			callback: () => {
				this.promptAndScanFolder();
			},
		});

		// New command: Scan folder (dry-run)
		this.addCommand({
			id: 'scan-folder-dry-run',
			name: 'Scan folder (dry-run)',
			callback: () => {
				this.promptAndScanFolder(true);
			},
		});

		this.addSettingTab(new AutoNoteMoverSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.migrateSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Migrate old settings format (folder_tag_pattern with single tag/pattern)
	 * to new format (rules with tags array and tagMatchMode)
	 */
	private migrateSettings(): void {
		// If rules already exist and have content, no migration needed
		if (Array.isArray(this.settings.rules) && this.settings.rules.length > 0) {
			return;
		}

		const newRules: FolderRule[] = [];

		// Migrate from old folder_tag_pattern array
		const oldPatterns = this.settings.folder_tag_pattern;
		if (Array.isArray(oldPatterns)) {
			for (const old of oldPatterns) {
				const tags: string[] = [];
				if (old.tag && typeof old.tag === 'string' && old.tag.trim().length > 0) {
					tags.push(old.tag.trim());
				}

				const rule: FolderRule = {
					folder: old.folder || '',
					tags,
					tagMatchMode: 'any',
					titlePattern: old.pattern && old.pattern.trim() ? old.pattern.trim() : undefined,
				};

				newRules.push(rule);
			}

			// Clear old format after migration
			delete this.settings.folder_tag_pattern;
		}

		this.settings.rules = newRules;

		// Save migrated settings
		void this.saveSettings();
	}

	/**
	 * Check if a rule matches based on tags
	 */
	private matchesTags(rule: FolderRule, cacheTag: string[], useRegex: boolean): boolean {
		if (!rule.tags || rule.tags.length === 0) return false;

		// Filter out empty tags
		const ruleTags = rule.tags.filter((t) => t && t.trim().length > 0);
		if (ruleTags.length === 0) return false;

		const matchOne = (pattern: string): boolean => {
			if (!useRegex) {
				return cacheTag.includes(pattern);
			} else {
				try {
					const regex = new RegExp(pattern);
					return cacheTag.some((t: string): boolean => regex.test(t));
				} catch {
					// Invalid regex, try exact match
					return cacheTag.includes(pattern);
				}
			}
		};

		if (rule.tagMatchMode === 'all') {
			// ALL: every tag must match
			return ruleTags.every(matchOne);
		} else {
			// ANY: at least one tag must match (default)
			return ruleTags.some(matchOne);
		}
	}

	/**
	 * Check if a rule matches based on title pattern
	 */
	private matchesTitle(rule: FolderRule, fileName: string): boolean {
		if (!rule.titlePattern || rule.titlePattern.trim().length === 0) {
			return false;
		}

		try {
			const regex = new RegExp(rule.titlePattern);
			return regex.test(fileName);
		} catch {
			// Invalid regex
			return false;
		}
	}

	// ============ SCAN FOLDER FEATURE ============

	/**
	 * Open folder selection modal and scan selected folder
	 */
	private promptAndScanFolder(dryRun: boolean = false): void {
		const configDir = this.app.vault.configDir;
		const all = this.app.vault.getAllLoadedFiles();

		const folders = all
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter((f) => !f.path.startsWith(configDir));

		new FolderSuggestModal(this.app, folders, (folder) => {
			void this.scanFolderAndMove(folder, dryRun);
		}).open();
	}

	/**
	 * Recursively collect all markdown files from a folder
	 */
	private getMarkdownFilesRecursively(folder: TFolder): TFile[] {
		const result: TFile[] = [];
		const configDir = this.app.vault.configDir;

		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (child.extension === 'md' && !child.path.startsWith(configDir)) {
					result.push(child);
				}
			} else if (child instanceof TFolder) {
				if (!child.path.startsWith(configDir)) {
					result.push(...this.getMarkdownFilesRecursively(child));
				}
			}
		}

		return result;
	}

	/**
	 * Scan folder and move notes according to rules
	 */
	private async scanFolderAndMove(folder: TFolder, dryRun: boolean = false): Promise<void> {
		const files = this.getMarkdownFilesRecursively(folder);

		let scanned = 0;
		let moved = 0;
		let skipped = 0;
		const wouldMove: string[] = [];

		for (const file of files) {
			scanned++;

			try {
				const result = await this.processFileWithRules(file, dryRun);
				if (result.matched) {
					moved++;
					if (dryRun && result.targetFolder) {
						wouldMove.push(`${file.path} → ${result.targetFolder}`);
					}
				} else {
					skipped++;
				}
			} catch (err) {
				// Don't crash on single file error
				console.error('[Auto Note Mover] scan folder error for', file.path, err);
				skipped++;
			}

			// Yield every 25 files to prevent UI freeze
			if (scanned % 25 === 0) {
				await new Promise((r) => setTimeout(r, 0));
			}
		}

		if (dryRun) {
			new Notice(
				`[Auto Note Mover] Dry-run complete:\nScanned: ${scanned}\nWould move: ${moved}\nNo match: ${skipped}`
			);
			if (wouldMove.length > 0) {
				console.debug('[Auto Note Mover] Dry-run - would move:', wouldMove);
			}
		} else {
			new Notice(`[Auto Note Mover] Scan complete:\nScanned: ${scanned}\nMoved: ${moved}\nSkipped: ${skipped}`);
		}
	}

	/**
	 * Process a single file with all rules
	 * Returns true if file was moved (or would be moved in dry-run)
	 */
	private async processFileWithRules(
		file: TFile,
		dryRun: boolean = false
	): Promise<{ matched: boolean; targetFolder?: string }> {
		// Skip config folder files
		const configDir = this.app.vault.configDir;
		if (file.path.startsWith(configDir)) {
			return { matched: false };
		}

		// Check excluded folders
		const excludedFolder = this.settings.excluded_folder;
		for (const excluded of excludedFolder) {
			if (!excluded.folder) continue;

			if (!this.settings.use_regex_to_check_for_excluded_folder) {
				if (file.parent && file.parent.path === normalizePath(excluded.folder)) {
					return { matched: false };
				}
			} else {
				try {
					const regex = new RegExp(excluded.folder);
					if (file.parent && regex.test(file.parent.path)) {
						return { matched: false };
					}
				} catch {
					// Invalid regex, skip
				}
			}
		}

		const fileCache = this.app.metadataCache.getFileCache(file);
		if (!fileCache) {
			return { matched: false };
		}

		// Check if disabled in frontmatter
		if (isFmDisable(fileCache)) {
			return { matched: false };
		}

		const cacheTag = getAllTags(fileCache) ?? [];
		const fileName = file.basename;

		for (const rule of this.settings.rules) {
			if (!rule.folder) continue;

			// Don't move if already in target folder
			const targetFolderNormalized = normalizePath(rule.folder);
			if (file.parent && file.parent.path === targetFolderNormalized) {
				continue;
			}

			const byTags = this.matchesTags(rule, cacheTag, this.settings.use_regex_to_check_for_tags);
			const byTitle = this.matchesTitle(rule, fileName);

			if (byTags || byTitle) {
				const targetPath = normalizePath(`${rule.folder}/${file.name}`);

				// Don't move if path is the same
				if (targetPath === file.path) {
					continue;
				}

				if (!dryRun) {
					// Use existing fileMove function for consistency
					await fileMove(this.app, rule.folder, file.name, file);
				}

				return { matched: true, targetFolder: rule.folder };
			}
		}

		return { matched: false };
	}
}
