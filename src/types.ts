// ---------------------------------------------------------------------------
// Shared types for the CloudCannon live-editing API and tracked elements.
// ---------------------------------------------------------------------------

export interface TrackedElement {
	element: HTMLElement;
	roseyKey: string;
	originalContent: string;
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

/** A single entry in a Rosey locale file. */
export interface LocaleEntry {
	original: string;
	value: string;
	/** Source text as of the last build; powers stale detection. RCC-only field. */
	_base_original?: string;
}

/**
 * A locale entry as read back from the CC data API: any field may be absent
 * (partial writes, newly-created entries) and the whole entry may be null.
 */
export type LocaleEntryData = Partial<LocaleEntry>;

export interface CCFile {
	data: {
		get(opts?: { slug?: string }): Promise<LocaleEntryData | null>;
		// slug can address the whole entry (value is a LocaleEntry) or a single
		// field like `key.value` (value is a string).
		set(opts: {
			slug: string;
			value: string | LocaleEntry | LocaleEntryData;
		}): Promise<unknown>;
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
