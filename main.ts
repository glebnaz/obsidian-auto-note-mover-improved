import { MarkdownView, Plugin, TFile, getAllTags, Notice, TAbstractFile, normalizePath } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	AutoNoteMoverSettings,
	AutoNoteMoverSettingTab,
	FolderRule,
	FolderTagPattern,
} from 'settings/settings';
import { fileMove, getTriggerIndicator, isFmDisable } from 'utils/Utils';

export default class AutoNoteMover extends Plugin {
	settings: AutoNoteMoverSettings;

	async onload() {
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
					fileMove(this.app, rule.folder, fileFullName, file);
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
			name: 'Toggle Auto-Manual',
			callback: () => {
				if (this.settings.trigger_auto_manual === 'Automatic') {
					this.settings.trigger_auto_manual = 'Manual';
					this.saveData(this.settings);
					new Notice('[Auto Note Mover]\nTrigger is Manual.');
				} else if (this.settings.trigger_auto_manual === 'Manual') {
					this.settings.trigger_auto_manual = 'Automatic';
					this.saveData(this.settings);
					new Notice('[Auto Note Mover]\nTrigger is Automatic.');
				}
				setIndicator();
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
		const oldPatterns = this.settings.folder_tag_pattern as FolderTagPattern[] | undefined;
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
		this.saveSettings();
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
}
