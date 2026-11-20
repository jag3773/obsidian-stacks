import { familyFromFullName } from "../citekey";
import { normalizeTitle } from "../duplicates";
import { canonicalIsbn } from "../identifiers";
import { truncated } from "./found";
import { Fetcher, getJson } from "./http";
import { parseDate, yearOf } from "./dates";
import { ReferenceData, joinTitle, yearFrom } from "./types";

interface OLBook {
	title?: string;
	subtitle?: string;
	authors?: { name: string }[];
	publishers?: { name: string }[];
	publish_places?: { name: string }[];
	publish_date?: string;
	url?: string;
	notes?: string | { value: string };
}

export function parseOpenLibrary(json: Record<string, OLBook> | null, isbn: string): ReferenceData | null {
	const book = json?.[`ISBN:${isbn}`];
	if (!book?.title) return null;
	const authors = (book.authors ?? []).map((a) => a.name);
	return {
		type: "book",
		title: joinTitle(book.title, book.subtitle),
		authors,
		familyNames: authors.map(familyFromFullName),
		date: parseDate(book.publish_date),
		year: yearOf(parseDate(book.publish_date)) ?? yearFrom(book.publish_date),
		publisher: book.publishers?.[0]?.name,
		place: book.publish_places?.[0]?.name,
		isbn,
		source: "Open Library",
	};
}

export async function lookupOpenLibrary(fetch: Fetcher, isbn: string): Promise<ReferenceData | null> {
	const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
	return parseOpenLibrary(await getJson<Record<string, OLBook>>(fetch, url), isbn);
}

interface OLSearchDoc {
	title?: string;
	subtitle?: string;
	author_name?: string[];
	isbn?: string[];
}

/**
 * The title to search for: a site's " | Goodreads" suffix, a " by Author" byline naming
 * `family`, and a word cut off by "…" dropped. `cut` is true when the title was cut off, so
 * it is only a prefix.
 */
export function searchableTitle(title: string, family: string): { text: string; cut: boolean } {
	let t = title.replace(/\s+\|\s+[^|]*$/, "").trim();
	const cut = truncated(t);
	if (cut) t = t.replace(/(…|\.\.\.)\s*$/, "").replace(/\s*\S*$/, "").trim();
	const byline = t.match(/\s+by\s+([^:]+)$/i);
	if (byline && family && normalizeTitle(byline[1]).split(" ").includes(normalizeTitle(family))) t = t.slice(0, byline.index).trim();
	return { text: t, cut };
}

/** The part of a title before its subtitle. */
const mainTitle = (t: string) => t.split(/\s*:\s+/)[0];

/**
 * The ISBN of the search result that is this book: by an author with this family name, and
 * with the same title before any subtitle (or, for a cut-off title, a title that starts with
 * it). Null when no result is a confident match.
 */
export function pickSearchMatch(docs: OLSearchDoc[], title: string, family: string): string | null {
	const { text, cut } = searchableTitle(title, family);
	const want = normalizeTitle(text);
	const wantMain = normalizeTitle(mainTitle(text));
	const fam = normalizeTitle(family);
	for (const d of docs) {
		if (!d.title || !(d.author_name ?? []).some((n) => normalizeTitle(familyFromFullName(n)) === fam)) continue;
		const full = normalizeTitle(joinTitle(d.title, d.subtitle));
		// A cut-off title that reaches into the subtitle still has its whole main title.
		const titled = cut && wantMain === want ? full.startsWith(want) : normalizeTitle(d.title) === wantMain || full === want;
		if (!titled) continue;
		const isbns = (d.isbn ?? []).map((i) => canonicalIsbn(i)).filter((i): i is string => !!i);
		const isbn = isbns.find((i) => i.length === 13) ?? isbns[0];
		if (isbn) return isbn;
	}
	return null;
}

/** Search Open Library for a book by its title and an author's family name; its ISBN, or null. */
export async function searchOpenLibrary(fetch: Fetcher, title: string, family: string): Promise<string | null> {
	const { text } = searchableTitle(title, family);
	if (!text || !family) return null;
	const q = new URLSearchParams({ title: mainTitle(text), author: family, limit: "10", fields: "title,subtitle,author_name,isbn" });
	const json = await getJson<{ docs?: OLSearchDoc[] }>(fetch, `https://openlibrary.org/search.json?${q}`);
	return pickSearchMatch(json?.docs ?? [], title, family);
}
