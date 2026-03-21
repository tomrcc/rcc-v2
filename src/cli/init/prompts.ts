import readline from "node:readline";

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
	if (!rl) {
		rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.on("close", () => process.exit(0));
	}
	return rl;
}

export function closePrompts(): void {
	if (rl) {
		rl.removeAllListeners("close");
		rl.close();
		rl = null;
	}
}

function question(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		getRL().question(prompt, (answer) => resolve(answer));
	});
}

export async function askText(
	prompt: string,
	defaultValue?: string,
): Promise<string> {
	const suffix = defaultValue ? ` (${defaultValue})` : "";
	const answer = (await question(`${prompt}${suffix}: `)).trim();
	return answer || defaultValue || "";
}

export interface SelectOption {
	label: string;
	value: string;
}

export async function askSelect(
	prompt: string,
	options: SelectOption[],
): Promise<string> {
	console.log(`\n${prompt}`);
	for (let i = 0; i < options.length; i++) {
		console.log(`  ${i + 1}) ${options[i].label}`);
	}

	while (true) {
		const answer = (await question(`Choose [1-${options.length}]: `)).trim();
		const idx = Number.parseInt(answer, 10) - 1;
		if (idx >= 0 && idx < options.length) {
			return options[idx].value;
		}
		console.log(`  Please enter a number between 1 and ${options.length}.`);
	}
}

export async function askConfirm(
	prompt: string,
	defaultYes = true,
): Promise<boolean> {
	const hint = defaultYes ? "Y/n" : "y/N";
	const answer = (await question(`${prompt} (${hint}): `)).trim().toLowerCase();
	if (answer === "") return defaultYes;
	return answer === "y" || answer === "yes";
}
