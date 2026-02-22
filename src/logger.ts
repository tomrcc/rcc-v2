let verbose: boolean | null = null;

function isVerbose(): boolean {
	if (verbose === null) {
		verbose = !!document.querySelector("main[data-rcc-verbose]");
	}
	return verbose;
}

export function log(...args: unknown[]): void {
	if (isVerbose()) {
		console.log("RCC:", ...args);
	}
}

export function warn(...args: unknown[]): void {
	console.warn("RCC:", ...args);
}
