import AutoNoteMover from 'main';
import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';

import { FolderSuggest } from 'suggests/file-suggest';
import { TagSuggest } from 'suggests/tag-suggest';
import { arrayMove } from 'utils/Utils';

// ============ NEW DATA MODEL ============

export type TagMatchMode = 'any' | 'all';

export interface FolderRule {
	folder: string; // путь к папке назначения

	tags: string[]; // список тегов, может быть пустым
	tagMatchMode: TagMatchMode; // "any" - хотя бы один тег, "all" - все теги

	titlePattern?: string; // шаблон для совпадения по заголовку (бывший pattern)
}

// ============ OLD DATA MODEL (for migration) ============

export interface FolderTagPattern {
	folder: string;
	tag: string;
	pattern: string;
}

export interface ExcludedFolder {
	folder: string;
}

// ============ SETTINGS ============

export interface AutoNoteMoverSettings {
	trigger_auto_manual: string;
	use_regex_to_check_for_tags: boolean;
	statusBar_trigger_indicator: boolean;
	use_regex_to_check_for_excluded_folder: boolean;
	excluded_folder: Array<ExcludedFolder>;

	// New rules array
	rules: FolderRule[];

	// Old field for migration (deprecated)
	folder_tag_pattern?: Array<FolderTagPattern>;
}

export const DEFAULT_SETTINGS: AutoNoteMoverSettings = {
	trigger_auto_manual: 'Automatic',
	use_regex_to_check_for_tags: false,
	statusBar_trigger_indicator: true,
	use_regex_to_check_for_excluded_folder: false,
	excluded_folder: [{ folder: '' }],
	rules: [],
};

export class AutoNoteMoverSettingTab extends PluginSettingTab {
	plugin: AutoNoteMover;

	constructor(app: App, plugin: AutoNoteMover) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		this.containerEl.empty();
		this.add_auto_note_mover_setting();
	}

	add_auto_note_mover_setting(): void {
		new Setting(this.containerEl).setName('Auto Note Mover – Multi tags').setHeading();

		const descEl = document.createDocumentFragment();

		new Setting(this.containerEl).setDesc(
			'Auto Note Mover will automatically move the active notes to their respective folders according to the rules.'
		);

		const triggerDesc = document.createDocumentFragment();
		triggerDesc.append(
			'Choose how the trigger will be activated.',
			descEl.createEl('br'),
			descEl.createEl('strong', { text: 'Automatic ' }),
			'is triggered when you create, edit, or rename a note, and moves the note if it matches the rules.',
			descEl.createEl('br'),
			'You can also activate the trigger with a command.',
			descEl.createEl('br'),
			descEl.createEl('strong', { text: 'Manual ' }),
			'will not automatically move notes.',
			descEl.createEl('br'),
			'You can trigger by command.'
		);
		new Setting(this.containerEl)
			.setName('Trigger')
			.setDesc(triggerDesc)
			.addDropdown((dropDown) =>
				dropDown
					.addOption('Automatic', 'Automatic')
					.addOption('Manual', 'Manual')
					.setValue(this.plugin.settings.trigger_auto_manual)
					.onChange((value: string) => {
						this.plugin.settings.trigger_auto_manual = value;
						void this.plugin.saveData(this.plugin.settings);
						this.display();
					})
			);

		const useRegexToCheckForTags = document.createDocumentFragment();
		useRegexToCheckForTags.append(
			'If enabled, tags will be checked with regular expressions.',
			descEl.createEl('br'),
			'For example, if you want to match the #tag, you would write ',
			descEl.createEl('strong', { text: '^#tag$' }),
			descEl.createEl('br'),
			'This setting is for a specific purpose, such as specifying nested tags in bulk.',
			descEl.createEl('br'),
			descEl.createEl('strong', {
				text: 'If you want to use the suggested tags as they are, it is recommended to disable this setting.',
			})
		);
		new Setting(this.containerEl)
			.setName('Use regular expressions to check for tags')
			.setDesc(useRegexToCheckForTags)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.use_regex_to_check_for_tags).onChange(async (value) => {
					this.plugin.settings.use_regex_to_check_for_tags = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		const ruleDesc = document.createDocumentFragment();
		ruleDesc.append(
			'1. Set the destination folder.',
			descEl.createEl('br'),
			'2. Set one or more tags and/or a title pattern.',
			descEl.createEl('br'),
			descEl.createEl('strong', { text: 'Multiple tags: ' }),
			'Use "Match any tag" (OR) or "Match all tags" (AND).',
			descEl.createEl('br'),
			'3. The rules are checked in order from the top. The notes will be moved to the folder with the ',
			descEl.createEl('strong', { text: 'first matching rule.' }),
			descEl.createEl('br'),
			'Tag: Be sure to add a',
			descEl.createEl('strong', { text: ' # ' }),
			'at the beginning.',
			descEl.createEl('br'),
			'Title: Tested by JavaScript regular expressions.',
			descEl.createEl('br'),
			descEl.createEl('br'),
			'Notice:',
			descEl.createEl('br'),
			'1. Attached files will not be moved, but they will still appear in the note.',
			descEl.createEl('br'),
			'2. Auto Note Mover will not move notes that have "',
			descEl.createEl('strong', { text: 'AutoNoteMover: disable' }),
			'" in the frontmatter.'
		);
		new Setting(this.containerEl)
			.setName('Add new rule')
			.setDesc(ruleDesc)
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip('Add new rule')
					.setButtonText('+')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.rules.push({
							folder: '',
							tags: [],
							tagMatchMode: 'any',
							titlePattern: undefined,
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Render each rule
		this.plugin.settings.rules.forEach((rule, ruleIndex) => {
			this.renderRule(rule, ruleIndex);
		});

		// Excluded folders section
		const useRegexToCheckForExcludedFolder = document.createDocumentFragment();
		useRegexToCheckForExcludedFolder.append('If enabled, excluded folder will be checked with regular expressions.');

		new Setting(this.containerEl)
			.setName('Use regular expressions to check for excluded folder')
			.setDesc(useRegexToCheckForExcludedFolder)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.use_regex_to_check_for_excluded_folder).onChange(async (value) => {
					this.plugin.settings.use_regex_to_check_for_excluded_folder = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		const excludedFolderDesc = document.createDocumentFragment();
		excludedFolderDesc.append(
			'Notes in the excluded folder will not be moved.',
			descEl.createEl('br'),
			'This takes precedence over the notes movement rules.'
		);
		new Setting(this.containerEl)
			.setName('Add excluded folder')
			.setDesc(excludedFolderDesc)
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip('Add excluded folders')
					.setButtonText('+')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.excluded_folder.push({
							folder: '',
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.plugin.settings.excluded_folder.forEach((excluded_folder, index) => {
			const s = new Setting(this.containerEl)
				.addSearch((cb) => {
					new FolderSuggest(this.app, cb.inputEl);
					cb.setPlaceholder('Folder')
						.setValue(excluded_folder.folder)
						.onChange(async (newFolder) => {
							this.plugin.settings.excluded_folder[index].folder = newFolder;
							await this.plugin.saveSettings();
						});
				})

				.addExtraButton((cb) => {
					cb.setIcon('up-chevron-glyph')
						.setTooltip('Move up')
						.onClick(async () => {
							arrayMove(this.plugin.settings.excluded_folder, index, index - 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('down-chevron-glyph')
						.setTooltip('Move down')
						.onClick(async () => {
							arrayMove(this.plugin.settings.excluded_folder, index, index + 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('cross')
						.setTooltip('Delete')
						.onClick(async () => {
							this.plugin.settings.excluded_folder.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						});
				});
			s.infoEl.remove();
		});

		const statusBarTriggerIndicatorDesc = document.createDocumentFragment();
		statusBarTriggerIndicatorDesc.append(
			'The status bar will display [A] if the trigger is Automatic, and [M] for Manual.',
			descEl.createEl('br'),
			'To change the setting, you need to restart Obsidian.',
			descEl.createEl('br'),
			'Desktop only.'
		);
		new Setting(this.containerEl)
			.setName('Status bar trigger indicator')
			.setDesc(statusBarTriggerIndicatorDesc)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.statusBar_trigger_indicator).onChange(async (value) => {
					this.plugin.settings.statusBar_trigger_indicator = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}

	private renderRule(rule: FolderRule, ruleIndex: number): void {
		// Create a container for the rule
		const ruleContainer = this.containerEl.createDiv({ cls: 'auto-note-mover-rule' });

		// Header with rule number and controls
		new Setting(ruleContainer)
			.setName(`Rule ${ruleIndex + 1}`)
			.addExtraButton((cb) => {
				cb.setIcon('up-chevron-glyph')
					.setTooltip('Move up')
					.onClick(async () => {
						arrayMove(this.plugin.settings.rules, ruleIndex, ruleIndex - 1);
						await this.plugin.saveSettings();
						this.display();
					});
			})
			.addExtraButton((cb) => {
				cb.setIcon('down-chevron-glyph')
					.setTooltip('Move down')
					.onClick(async () => {
						arrayMove(this.plugin.settings.rules, ruleIndex, ruleIndex + 1);
						await this.plugin.saveSettings();
						this.display();
					});
			})
			.addExtraButton((cb) => {
				cb.setIcon('cross')
					.setTooltip('Delete rule')
					.onClick(async () => {
						this.plugin.settings.rules.splice(ruleIndex, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Folder input
		new Setting(ruleContainer)
			.setName('Destination folder')
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder('Folder')
					.setValue(rule.folder)
					.onChange(async (newFolder) => {
						rule.folder = newFolder.trim();
						await this.plugin.saveSettings();
					});
			});

		// Tag match mode dropdown
		new Setting(ruleContainer)
			.setName('Tag match mode')
			.setDesc('How tags will be combined for this rule')
			.addDropdown((dd) => {
				dd.addOption('any', 'Match any tag (or)');
				dd.addOption('all', 'Match all tags (and)');

				dd.setValue(rule.tagMatchMode ?? 'any');

				dd.onChange(async (value: string) => {
					rule.tagMatchMode = value as TagMatchMode;
					await this.plugin.saveSettings();
				});
			});

		// Tags section header
		const tagsHeaderEl = ruleContainer.createDiv({ cls: 'auto-note-mover-tags-header' });
		new Setting(tagsHeaderEl).setName('Tags').setDesc('Add one or more tags for this rule');

		// Render each tag with remove button
		rule.tags.forEach((tag, tagIndex) => {
			new Setting(ruleContainer)
				.addSearch((cb) => {
					new TagSuggest(this.app, cb.inputEl);
					cb.setPlaceholder('#tag')
						.setValue(tag)
						.onChange(async (value) => {
							rule.tags[tagIndex] = value.trim();
							await this.plugin.saveSettings();
						});
				})
				.addExtraButton((btn) => {
					btn.setIcon('trash')
						.setTooltip('Remove tag')
						.onClick(async () => {
							rule.tags.splice(tagIndex, 1);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});

		// Add tag button
		new Setting(ruleContainer).addButton((btn) => {
			btn.setButtonText('Add tag')
				.setTooltip('Add new tag for this rule')
				.onClick(async () => {
					rule.tags.push('');
					await this.plugin.saveSettings();
					this.display();
				});
		});

		// Title pattern input
		new Setting(ruleContainer)
			.setName('Title pattern')
			.setDesc('Regular expression for note title (optional)')
			.addText((text) => {
				text.setPlaceholder('.*Meeting.*')
					.setValue(rule.titlePattern ?? '')
					.onChange(async (value) => {
						rule.titlePattern = value.trim() || undefined;
						await this.plugin.saveSettings();
					});
			});
	}
}
