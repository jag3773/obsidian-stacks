import { familyFromFullName } from "./citekey";
import { normalizeTitle, paragraphs } from "./duplicates";
import { ReferenceData } from "./metadata/types";
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

/** Amazon's author line as names: "Nicole Forsgren PhD, Jez Humble, and Gene Kim" → three names. */
export function kindleAuthors(author: string): string[] {
	return author
		.split(/\s*;\s*|\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
		.map((a) => a.replace(DEGREE, "").replace(DEGREE, "").trim())
		.filter((a) => a && !/^(?:ph\.?\s?d\.?|m\.?d\.?|jr\.?|sr\.?)$/i.test(a));
}

/** A reference made from what the Kindle plugin knows, when no catalog has the book. */
export function fromKindle(book: KindleBook): ReferenceData {
	const authors = kindleAuthors(book.author);
	return { type: "book", title: book.title, authors, familyNames: authors.map(familyFromFullName), source: "the Kindle plugin" };
}

/** The part of a title before its subtitle, for comparing. */
const mainTitle = (t: string) => normalizeTitle(t.split(/\s*:\s+/)[0] ?? "");

/**
 * True when a reference with this title and these authors is the Kindle book: the same title
 * before any subtitle (Amazon adds subtitles and series names), and the Kindle book's first
 * author among the reference's family names. A Kindle edition's ISBN usually isn't the print
 * edition's, so identifiers alone miss it.
 */
export function sameBook(book: Pick<KindleBook, "title" | "author">, title: string, families: string[]): boolean {
	const want = mainTitle(book.title);
	const first = kindleAuthors(book.author)[0];
	if (!want || !first || mainTitle(title) !== want) return false;
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
