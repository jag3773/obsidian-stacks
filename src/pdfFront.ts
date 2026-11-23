import { parseDate } from "./metadata/dates";

/**
 * What a PDF's first page says about itself, for a PDF that names no DOI or ISBN to look up:
 * the byline in its title block, and, for a web page printed from a browser, the page's URL
 * (in the browser's footer) and the day it was printed.
 */

/** One line of a page as PDF.js lays it out: its text and font size. */
export interface PdfLine {
	text: string;
	size: number;
	/** Baseline height on the page. */
	y: number;
}

/** The document information that matters here. */
export interface PdfMeta {
	/** /Creator: the application that made the PDF (a browser's user agent when printed from one). */
	creator?: string;
	/** /CreationDate, as written: D:YYYYMMDDHHmmSS… */
	created?: string;
}

export interface PdfFront {
	authors: string[];
	/** Publication date, ISO. */
	date?: string;
	/** The web page a browser printed. */
	url?: string;
	/** The day it was printed, ISO. */
	accessed?: string;
}

/** A browser's user agent: Chrome, Edge, Safari and Firefox all write one as the Creator. */
const BROWSER = /Mozilla\/5\.0|\b(?:Chrome|Firefox|Safari|Edg)\/\d/;

/** A footer line with a URL and, as browsers print it, the page count ("1/3", "Page 1 of 3"). */
const FOOTER_URL = /^(https?:\/\/\S+)(?:\s+(?:\d+\s*\/\s*\d+|Page \d+ of \d+))?$/i;

/** A line that is only a date: "Feb 9, 2026", "9 February 2026", "March 2024", "2026-02-09". */
const DATE_LINE =
	/^(?:(?:published|updated|posted|last updated)\s*:?\s+)?((?:[A-Za-z]{3,9}\.? \d{1,2}, \d{4})|(?:\d{1,2} [A-Za-z]{3,9}\.? \d{4})|(?:[A-Za-z]{3,9} \d{4})|(?:\d{4}-\d{2}-\d{2}))$/i;

/** Lower-case particles inside a name: Teryl van der Berg, Ana de la Cruz. */
const PARTICLES = new Set(["van", "von", "der", "den", "de", "da", "del", "della", "di", "du", "la", "le", "bin", "al", "ten", "ter"]);
const NAME_WORD = /^(?:\p{Lu}[\p{L}'’-]*\.?|\p{Lu}\.)$/u;

/** Words that make a capitalized line a document's label or an organization, not a person. */
const NOT_A_PERSON = new Set(
	(
		"paper report draft version edition chapter volume part section introduction summary abstract contents appendix " +
		"figure table study review guide handbook manual brief overview update film press university institute center centre " +
		"foundation ministry ministries church society association council committee department office group team project " +
		"inc ltd llc company corporation agency board network alliance translators publishers partners " +
		"questionnaire questions interview worksheet template form policy plan proposal agenda minutes notes memo letter " +
		"statement standards framework strategy"
	).split(" ")
);

/** The names on a byline ("By A, B and C", "A & B"), or null when it isn't one. */
function bylineNames(text: string, needsBy: boolean): string[] | null {
	const by = /^by\s+/i.test(text);
	if (needsBy && !by) return null;
	const parts = text
		.replace(/^by\s+/i, "")
		.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
		.map((p) => p.trim())
		.filter(Boolean);
	if (!parts.length || parts.length > 8) return null;
	for (const p of parts) {
		const words = p.split(/\s+/);
		if (words.length < 2 || words.length > 5) return null;
		const last = words.length - 1;
		if (!words.every((w, i) => NAME_WORD.test(w) || (i > 0 && i < last && PARTICLES.has(w)))) return null;
		if (words.some((w) => NOT_A_PERSON.has(w.toLowerCase().replace(/[.,]$/, "")))) return null;
	}
	return parts;
}

const sizeKey = (s: number) => Math.round(s * 2) / 2;

/** The body text's font size: the size that most of the page's text is set in. */
function bodySize(lines: PdfLine[]): number | undefined {
	const chars = new Map<number, number>();
	for (const l of lines) if (l.size > 0) chars.set(sizeKey(l.size), (chars.get(sizeKey(l.size)) ?? 0) + l.text.length);
	return [...chars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** /CreationDate (D:20261120190433+00'00') as YYYY-MM-DD. */
function pdfDay(raw: string | undefined): string | undefined {
	const m = raw?.match(/^(?:D:)?(\d{4})(\d{2})(\d{2})/);
	return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

export function readFront(lines: PdfLine[], meta: PdfMeta): PdfFront {
	const out: PdfFront = { authors: [] };
	if (meta.creator && BROWSER.test(meta.creator)) {
		out.url = lines.map((l) => l.text.trim().match(FOOTER_URL)?.[1]).find(Boolean);
		out.accessed = pdfDay(meta.created);
	}
	// The title block: lines set larger than the body, from the top of the page down to the
	// first line of body text. Smaller lines (a browser's header and footer) are skipped.
	const body = bodySize(lines);
	if (body === undefined) return out;
	const block: string[] = [];
	for (const l of lines) {
		const size = sizeKey(l.size);
		if (size < body) continue;
		if (size === body) break;
		if (l.text.trim()) block.push(l.text.trim());
	}
	// The first line is the title. After it: a line that is only a date, and the names on the
	// line next to it, or on a line that starts "By".
	const d = block.findIndex((t, i) => i > 0 && DATE_LINE.test(t));
	if (d > 0) out.date = parseDate(block[d].match(DATE_LINE)?.[1]);
	for (let i = 1; i < block.length && !out.authors.length; i++) {
		if (i === d) continue;
		const names = bylineNames(block[i], !(d > 0 && Math.abs(i - d) === 1));
		if (names) out.authors = names;
	}
	return out;
}
