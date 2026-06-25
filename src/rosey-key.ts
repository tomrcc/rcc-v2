/**
 * Resolve an element's full Rosey key by walking up its ancestors, collecting
 * `data-rosey-ns` namespace segments until a `data-rosey-root` boundary, and
 * joining them with the element's own `data-rosey` value (`ns:ns:localKey`).
 */
export function resolveRoseyKey(el: Element): string | null {
	const localKey = el.getAttribute("data-rosey");
	if (!localKey) return null;

	const nsParts: string[] = [];
	let current = el.parentElement;

	while (current) {
		const root = current.getAttribute("data-rosey-root");
		if (root !== null) {
			if (root) nsParts.push(root);
			break;
		}
		const ns = current.getAttribute("data-rosey-ns");
		if (ns) nsParts.push(ns);
		current = current.parentElement;
	}

	nsParts.reverse();
	return [...nsParts, localKey].join(":");
}
