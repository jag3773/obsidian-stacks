/**
 * Pure module: which of a reference's attachments is its main file.
 *
 * A reference keeps every file in one attachments list. Its main file is the attachment in
 * the most preferred format (Settings → Preferred formats, "pdf, epub" by default); among
 * files of the same format, the one listed first. A file in no preferred format is the main
 * file only when nothing in a preferred format is attached. Names play no part, so renaming a
 * file or changing a citekey never changes which file is the main one.
 */

export const DEFAULT_FORMATS = ["pdf", "epub"];

/** "pdf, .EPUB docx" → ["pdf", "epub", "docx"]: lower case, no dots, no repeats. */
export function parseFormats(text: string | string[]): string[] {
	const parts = Array.isArray(text) ? text : text.split(/[\s,;]+/);
	const out: string[] = [];
	for (const p of parts) {
		const f = p.trim().replace(/^\.+/, "").toLowerCase();
		if (f && !out.includes(f)) out.push(f);
	}
	return out;
}

/** The position of a file extension in the preferred formats; formats.length when absent. */
export function formatRank(extension: string, formats: string[]): number {
	const i = formats.indexOf(extension.toLowerCase());
	return i === -1 ? formats.length : i;
}

/** The main file among a note's attachments, in list order; null when there are none. */
export function pickMain<T extends { extension: string }>(files: T[], formats: string[]): T | null {
	let best: T | null = null;
	let bestRank = Infinity;
	for (const f of files) {
		const r = formatRank(f.extension, formats);
		if (r < bestRank) {
			best = f;
			bestRank = r;
		}
	}
	return best;
}

/** The extension of a link path or file name ("a/b.PDF#page=2" → "pdf"); "" when none. */
export function extensionOf(linkpath: string): string {
	const path = linkpath.split("#")[0];
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Sort paths so the preferred formats come first, keeping the given order otherwise. */
export function byPreference(paths: string[], formats: string[]): string[] {
	return paths
		.map((p, i) => ({ p, i, r: formatRank(extensionOf(p), formats) }))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map((x) => x.p);
}
