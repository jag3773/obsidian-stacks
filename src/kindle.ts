import { familyFromFullName } from "./citekey";
import { normalizeTitle, paragraphs } from "./duplicates";
import { ReferenceData } from "./metadata/types";
import { displayName, parseName } from "./names";
import { asText } from "./text";

/**
 * Notes written by the Kindle Highlights plugin (hadynz/obsidian-kindle-plugin). It marks each
 * note with its book's id, title and author as `kindle-*` properties (older versions nest
 * them under `kindle-sync`), finds its notes again by that id inside its highlights folder
 * (not by file name), and on a later sync keeps every other property and inserts new
 * highlights after the lines ending in a `^ref-…` block id. So a reference note can hold a
 * book's Kindle highlights and still be kept up to date by that plugin, as long as it stays in
 * that plugin's folder with its `kindle-*` properties and the `^ref-…` ids.
 */

type Fm = Record<string, unknown>;

export interface KindleBook {
	bookId: string;
	title: string;
	/** As Amazon writes it: "Nicole Forsgren PhD, Jez Humble, and Gene Kim". */
	author: string;
}

/** The Kindle book a note was written for, or null when the Kindle plugin didn't write it. */
export function kindleBook(fm: Fm): KindleBook | null {
	const nested = fm["kindle-sync"];
	const src: Fm = fm["kindle-bookId"] !== undefined ? { bookId: fm["kindle-bookId"], title: fm["kindle-title"], author: fm["kindle-author"] } : nested && typeof nested === "object" ? (nested as Fm) : {};
	const bookId = asText(src.bookId).trim();
	return bookId ? { bookId, title: asText(src.title).trim(), author: asText(src.author).trim() } : null;
}

/** The Kindle plugin's own properties: `kindle-*`, and `kindle-sync` from older versions. */
export function kindleProperties(fm: Fm): Fm {
	return Object.fromEntries(Object.entries(fm).filter(([k]) => k.startsWith("kindle-")));
}

/** Degrees and titles Amazon puts on a name: "Nicole Forsgren PhD", "Dr. Henry Cloud". */
const DEGREE = /^(?:dr\.?|prof\.?)\s+|,?\s+(?:ph\.?\s?d\.?|d\.?\s?min\.?|m\.?d\.?|th\.?\s?d\.?|ed\.?\s?d\.?)$/i;

/**
 * An author line as names in display order. Amazon writes "Nicole Forsgren PhD, Jez Humble,
 * and Gene Kim"; `My Clippings.txt` and sideloaded books often write "Lewis, C. S." or
 * "Forsgren, Nicole;Humble, Jez". A line with ";" is split there alone, and "Surname, Given"
 * (a one-word surname before the only comma) is one inverted name.
 */
export function kindleAuthors(author: string): string[] {
	const line = author.trim();
	const parts = line.includes(";")
		? line.split(/\s*;\s*/)
		: /^[^\s,]+,\s*[^,]+$/.test(line) && !/\s(?:and|&)\s/i.test(line)
			? [line]
			: line.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i);
	return parts
		.map((a) => a.replace(DEGREE, "").replace(DEGREE, "").trim())
		.filter((a) => a && !/^(?:ph\.?\s?d\.?|m\.?d\.?|jr\.?|sr\.?)$/i.test(a))
		.map((a) => (a.includes(",") ? displayName(parseName(a)) : a));
}

/** A reference made from what the Kindle plugin knows, when no catalog has the book. */
export function fromKindle(book: KindleBook): ReferenceData {
	const authors = kindleAuthors(book.author);
	return { type: "book", title: book.title, authors, familyNames: authors.map(familyFromFullName), source: "the Kindle plugin" };
}

/**
 * The part of a title before its subtitle, for comparing, without a series or edition name in
 * trailing parentheses: "Mistborn (The Mistborn Saga Book 1)", "Mere Christianity (C.S. Lewis
 * Signature Classics)".
 */
const mainTitle = (t: string) => normalizeTitle(t.replace(/(?:\s*\([^()]*\))+\s*$/, "").split(/\s*:\s+/)[0] ?? "");

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const ROMAN = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

function romanValue(s: string): number {
	const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
	let total = 0;
	const chars = s.toLowerCase().split("");
	chars.forEach((c, i) => (total += v[c] < (v[chars[i + 1]] ?? 0) ? -v[c] : v[c]));
	return total;
}

/** The volume, part or book number a title names ("Volume 2", "Vol. II", "Book One"), if any. */
export function volumeOf(title: string): number | undefined {
	const m = title.match(/\b(?:vol(?:ume)?|part|book|bk|tome)\.?\s+(\d+|[ivxlc]+|[a-z]+)\b/i);
	if (!m) return undefined;
	const n = m[1].toLowerCase();
	if (/^\d+$/.test(n)) return Number(n);
	if (NUMBER_WORDS.includes(n)) return NUMBER_WORDS.indexOf(n);
	return ROMAN.test(n) ? romanValue(n) : undefined;
}

/**
 * True when a reference with this title and these authors is the Kindle book: the same title
 * before any subtitle or parenthesized series name (Amazon adds both), and the Kindle book's
 * first author among the reference's family names. Two titles that each name a different
 * volume, part or book number are different books. A Kindle edition's ISBN usually isn't the
 * print edition's, so identifiers alone miss it.
 */
export function sameBook(book: Pick<KindleBook, "title" | "author">, title: string, families: string[]): boolean {
	const want = mainTitle(book.title);
	const first = kindleAuthors(book.author)[0];
	if (!want || !first || mainTitle(title) !== want) return false;
	const [va, vb] = [volumeOf(book.title), volumeOf(title)];
	if (va !== undefined && vb !== undefined && va !== vb) return false;
	const fam = normalizeTitle(familyFromFullName(first));
	return families.some((f) => normalizeTitle(f) === fam);
}

const norm = (p: string) => p.replace(/\s+/g, " ").trim();
/** The Kindle plugin's block id, at the end of the line with the highlight's text. */
const BLOCK_ID = /\^ref-[\w-]+(?=\s*$)/m;
/** A separator such as the Kindle plugin's default "---" between highlights. */
const isRule = (p: string) => /^[-*_\s]+$/.test(p);

/**
 * The reference's body with the Kindle note's highlights added at the end: every paragraph it
 * doesn't already have (a highlight with the same `^ref-…` id counts as had), with the section
 * heading each sat under. The Kindle note's title heading is left out. Null when nothing is new.
 */
export function addKindleHighlights(refBody: string, kindleBody: string): string | null {
	const have = new Set(paragraphs(refBody).map(norm));
	const ids = new Set(paragraphs(refBody).map((p) => p.match(BLOCK_ID)?.[0]).filter(Boolean));
	const added: string[] = [];
	let heading: string | undefined;
	for (const p of paragraphs(kindleBody)) {
		if (/^#{1,6}\s/.test(p) && !p.includes("\n")) {
			heading = /^#\s/.test(p) ? undefined : p;
			continue;
		}
		if (isRule(p)) {
			// Kept with the highlights it separates; dropped if none of them are new.
			if (added.length && !isRule(added[added.length - 1])) added.push(p);
			continue;
		}
		const id = p.match(BLOCK_ID)?.[0];
		if (have.has(norm(p)) || (id && ids.has(id))) continue;
		if (heading && !have.has(norm(heading))) added.push(heading);
		heading = undefined;
		added.push(p);
		have.add(norm(p));
	}
	while (added.length && isRule(added[added.length - 1])) added.pop();
	if (!added.length) return null;
	const sep = refBody.endsWith("\n\n") ? "" : refBody.endsWith("\n") ? "\n" : refBody ? "\n\n" : "";
	return `${refBody}${sep}${added.join("\n\n")}\n`;
}
