// ---------------------------------------------------------------------------
// Shared types for the CloudCannon live-editing API and tracked elements.
// ---------------------------------------------------------------------------

export interface TrackedElement {
	element: HTMLElement;
	roseyKey: string;
	originalContent: string;
	inferredType: "span" | "block";
	focused: boolean;
	editor?: { setContent: (content?: string | null) => void };
	stale: boolean;
	baseOriginal: string | null;
	localeOriginal: string | null;
	/**
	 * Whether the key already has an entry in the current locale file. Selects
	 * the write path on edit: missing → create a full {original, value,
	 * _base_original} entry; present → patch just `.value`.
	 */
	hasLocaleEntry: boolean;
}

export interface CCFile {
	data: {
		get(opts?: { slug?: string }): Promise<any>;
		set(opts: { slug: string; value: any }): Promise<any>;
	};
}

export interface CCDataset {
	items(): Promise<CCFile | CCFile[]>;
	addEventListener(event: string, listener: () => void): void;
	removeEventListener(event: string, listener: () => void): void;
}

export interface CCApi {
	dataset(key: string): CCDataset;
	createTextEditableRegion(
		element: HTMLElement,
		onChange: (content?: string | null) => void,
		options?: {
			elementType?: string;
			editableType?: string;
			inputConfig?: Record<string, unknown>;
		},
	): Promise<{ setContent: (content?: string | null) => void }>;
}
