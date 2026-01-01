import { App, TFile, getAllTags, CachedMetadata } from 'obsidian';

import { TextInputSuggest } from './suggest';

class GetAllTagsInTheVault {
	private app: App;
	private tagList: string[];

	constructor(app: App) {
		this.app = app;
		const fileArray = this.app.vault.getMarkdownFiles();
		const fileCache = fileArray.map((file: TFile) => this.app.metadataCache.getFileCache(file));
		const tagArray = fileCache.map((cache: CachedMetadata | null) => (cache ? getAllTags(cache) : []));
		const tagArrayJoin = tagArray.join();
		const tagArraySplit = tagArrayJoin.split(',');
		const tagArrayFilter = tagArraySplit.filter(Boolean);
		this.tagList = [...new Set(tagArrayFilter)];
	}

	pull(): string[] {
		return this.tagList;
	}
}

export class TagSuggest extends TextInputSuggest<string> {
	getSuggestions(inputStr: string): string[] {
		const tagList = new GetAllTagsInTheVault(this.app);
		const tagMatch: string[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		tagList.pull().forEach((tag: string) => {
			if (tag.toLowerCase().contains(lowerCaseInputStr)) {
				tagMatch.push(tag);
			}
		});

		return tagMatch;
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag);
	}

	selectSuggestion(tag: string): void {
		this.inputEl.value = tag;
		this.inputEl.trigger('input');
		this.close();
	}
}