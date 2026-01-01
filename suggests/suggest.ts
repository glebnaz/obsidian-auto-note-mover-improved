import { AbstractInputSuggest, App } from 'obsidian';

export const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};

export abstract class TextInputSuggest<T> extends AbstractInputSuggest<T> {
	protected inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	abstract getSuggestions(inputStr: string): T[];

	protected onSelect(suggestion: T): void {
		this.selectSuggestion(suggestion);
	}

	abstract selectSuggestion(item: T): void;
}
