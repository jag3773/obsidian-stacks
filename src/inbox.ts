import { App, Notice, TFile, getFrontMatterInfo, parseYaml } from "obsidian";
import { familyFromFullName } from "./citekey";
import { FORMAT_LABELS, FileInfo, InboxFormat, fileComplete, identifiersOf, inboxFormat, readFile } from "./formats";
import { Identifier, normalizeDoi } from "./identifiers";
import { Library } from "./library";
import { Fetcher } from "./metadata/http";
import { parseDate, yearOf } from "./metadata/dates";
import { truncated } from "./metadata/found";
import { fillGaps, lookup, lookupBookByTitle } from "./metadata/lookup";
import { ReferenceData } from "./metadata/types";
import { readPdf } from "./pdf";
import { PropertyKey } from "./properties";
import { LibrarySettings } from "./settings";
import { NetworkTracker, looksComplete } from "./sync";

/** Handles files that land in the inbox folder. */
export class Inbox {
	constructor(
		private app: App,
		private library: Library,
		private fetch: Fetcher,
		private settings: () => LibrarySettings
	) {}

	accepts(file: TFile): boolean {
		const inbox = this.settings().inboxFolder.trim();
		// An empty inbox setting would match the whole vault, so treat it as "off".
		if (!inbox || inbox === "/") return false;
		return (file.extension === "md" || inboxFormat(file.extension) !== null) && this.library.inFolder(file, inbox);
	}

	/** Still in the inbox after a network wait (not moved, renamed out or deleted meanwhile). */
	private stillWaiting(file: TFile): boolean {
		return this.library.exists(file) && this.accepts(file);
	}

	/**
	 * File one inbox item. `explicit` (Process inbox now) files a file that looks incomplete as
	 * it is; automatic processing leaves it for when it has fully arrived.
	 */
	async process(file: TFile, explicit = false): Promise<TFile | null> {
		if (file.extension === "md") return this.processNote(file);
		const format = inboxFormat(file.extension);
		return format ? this.processFile(file, format, explicit) : null;
	}

	/** A clipped note: read its URL, enrich, set the clip status, file it. */
	async processNote(file: TFile): Promise<TFile | null> {
		const s = this.settings();
		const content = await this.app.vault.read(file);
		const info = getFrontMatterInfo(content);
		const fm = ((info.exists ? parseYaml(info.frontmatter) : {}) ?? {}) as Record<string, unknown>;
		const url = s.urlProperties.map((k) => fm[k]).find((v) => typeof v === "string" && /^https?:\/\//i.test(v)) as string | undefined;
		if (!url) {
			new Notice(`Stacks: no URL found in ${file.name}; left in the inbox.`);
			return null;
		}
		const net = new NetworkTracker();
		let data = await lookup(net.wrap(this.fetch), { kind: "url", value: url }, { crossrefMailto: s.crossrefMailto });
		// Offline (no request got an answer): keep the clip as it is, for Process inbox to retry.
		if (!data && net.unreachable) {
			new Notice(`Stacks: couldn't reach the network for ${file.name}; left in the inbox to retry.`);
			return null;
		}
		// A DOI the clipper read from the page (citation_doi) finds the work even when the
		// site turns the plugin's own request away.
		const clipDoi = normalizeDoi(str(fm[s.propertyNames.doi] ?? fm.doi));
		if (clipDoi && !data?.doi) {
			const work = await lookup(this.fetch, { kind: "doi", value: clipDoi }, { crossrefMailto: s.crossrefMailto });
			if (work) data = { ...work, url: work.url ?? url };
		}
		// Effective metadata: the lookup result with the clip's URL kept. What the clipper saved
		// (read in the browser, so it works on sites that block the plugin's request) fills any
		// gaps, or stands in when the lookup failed. The URL ends up in the configured url
		// property even if the clipper used "source".
		const clip = fromClip(fm, s.propertyNames, file.basename);
		let basis: ReferenceData = data ? fillFromClip({ ...data, url: data.url ?? url }, clip) : { ...clip, url };
		// A book page that came back without the book on it (a bot check in its place), clipped
		// with no date or ISBN: find the book by its title and author instead.
		if (basis.type === "book" && !basis.isbn && !basis.date) {
			const book = await lookupBookByTitle(this.fetch, basis.title, basis.authors, { crossrefMailto: s.crossrefMailto });
			if (book) basis = fillFromCatalog(basis, book);
		}
		return this.library.exclusive(async () => {
			if (!this.stillWaiting(file)) return null;
			// Check the enriched identifiers and the clip's own URL, whether or not the lookup worked.
			const dup = (await this.library.findExistingOnDisk(basis, file)) ?? (await this.library.findExistingOnDisk({ url }, file));
			if (dup) {
				new Notice(`Stacks: ${file.name} matches existing ${dup.basename}; left in the inbox.`);
				return null;
			}
			if (!this.stillWaiting(file)) return null;
			// The clip keeps the URL property it came from, so later captures of the same original
			// URL still match after the mapped url becomes the canonical one.
			const moved = await this.library.complete(file, basis, s.clipStatus, [url], data ? fm : undefined);
			new Notice(`Stacks: filed ${moved.basename}`);
			return moved;
		});
	}

	/** What a file says about itself; null when it can't be read as its format. */
	private async read(file: TFile, format: InboxFormat, bytes: Uint8Array): Promise<FileInfo | null> {
		try {
			if (format !== "pdf") return await readFile(format, bytes);
			const pdf = await readPdf(this.app, file);
			const authors = pdf.author ? pdf.author.split(/\s*(?:;|,| and )\s*/).filter(Boolean) : [];
			return { identifiers: [], text: pdf.text, title: pdf.title, authors, book: false };
		} catch (e) {
			console.warn(`[stacks] could not read ${FORMAT_LABELS[format]}`, file.path, e);
			return null;
		}
	}

	/**
	 * A PDF, ebook or document: find an ISBN or DOI in its metadata or text, look it up, create
	 * the note (or find the existing one), file the file. What the file says about itself fills
	 * what the lookup lacks, or stands in when nothing is found.
	 */
	async processFile(file: TFile, format: InboxFormat, explicit = false): Promise<TFile | null> {
		const s = this.settings();
		const label = FORMAT_LABELS[format];
		const bytes = new Uint8Array(await this.app.vault.readBinary(file));
		// A file still being copied or synced in: filing it now would file a truncated copy under
		// its filename. Its next change brings it back here (main.ts watches inbox changes).
		if (!explicit && !(format === "pdf" ? looksComplete(bytes) : fileComplete(format, bytes))) {
			new Notice(`Stacks: ${file.name} looks incomplete (still being copied or synced?); left in the inbox until it is complete.`);
			return null;
		}
		const info = await this.read(file, format, bytes);
		const net = new NetworkTracker();
		let data: ReferenceData | null = null;
		// The file's own ISBN first, then one found in its text.
		for (const id of info ? identifiersOf(info).slice(0, 3) : []) {
			data = await lookup(net.wrap(this.fetch), id, { crossrefMailto: s.crossrefMailto });
			if (data || net.unreachable) break;
		}
		// The file names an identifier but the network is down: retry later rather than file it
		// under what the file alone says.
		if (!data && net.unreachable) {
			new Notice(`Stacks: couldn't reach the network for ${file.name}; left in the inbox to retry.`);
			return null;
		}
		data = data ? fillFromFile(data, info) : fromFile(info, file.basename, label, format === "epub" || format === "mobi");
		const found = data;
		// The note's frontmatter may not be indexed yet (new, or reserved by a concurrent
		// capture), so pass the naming values along; values already on the note win.
		const naming = { title: found.title, familyNames: found.familyNames, year: found.year };
		return this.library.exclusive(async () => {
			if (!this.stillWaiting(file)) return null;
			const dup = await this.library.findExistingOnDisk(found);
			if (dup) {
				// Filed already, by another device or an earlier run: never add a second copy.
				const same = await this.library.alreadyFiled(dup, file, naming);
				if (same) {
					new Notice(`Stacks: ${file.name} is already filed as ${same.path}; left in the inbox.`);
					return null;
				}
				if (!this.stillWaiting(file)) return null;
				// Named as it arrived: attaching renames it.
				const arrived = file.name;
				await this.library.attach(dup, file, naming);
				new Notice(`Stacks: attached ${arrived} to existing ${dup.basename}`);
				return dup;
			}
			if (!this.stillWaiting(file)) return null;
			const note = await this.library.create(found, s.defaultStatus);
			await this.library.attach(note, file, naming);
			new Notice(`Stacks: created ${note.basename} from ${found.source}`);
			return note;
		});
	}
}

const str = (v: unknown): string =>
	typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : v instanceof Date && !isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : "";

/** Names in a property value: a list, a string of [[links]], or one plain name. */
function names(v: unknown): string[] {
	const items = Array.isArray(v) ? v.map(str) : [str(v)];
	return items
		.flatMap((item) => {
			const links = [...item.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1].trim());
			return links.length ? links : [item];
		})
		.filter(Boolean);
}

/**
 * Metadata a clipper already wrote into the note: under the library's property names, or
 * Web Clipper's defaults (title, author, published, description).
 */
export function fromClip(fm: Record<string, unknown>, props: Record<PropertyKey, string>, fallbackTitle: string): ReferenceData {
	const first = (...keys: string[]) => keys.map((k) => fm[k]).find((v) => (Array.isArray(v) ? v.length : str(v)));
	const authors = names(first(props.authors, "author", "authors", "creator"));
	const date = parseDate(str(first(props.published, "published", "date")) || undefined);
	return {
		type: "webpage",
		title: str(first(props.title, "title")) || fallbackTitle,
		authors,
		familyNames: authors.map(familyFromFullName),
		date,
		year: yearOf(date),
		abstract: str(first(props.abstract, "description", "abstract", "summary")) || undefined,
		source: "note",
	};
}

/**
 * found, with empty authors, date and abstract taken from the clip. A looked-up abstract that
 * was cut short ("…") gives way to a longer description the clipper saved.
 */
export function fillFromClip(found: ReferenceData, clip: ReferenceData): ReferenceData {
	const out = { ...found };
	// A page without a title comes back titled with its URL; the clip's title is better.
	if (/^https?:\/\//i.test(out.title) && clip.title) out.title = clip.title;
	if (!out.authors.length && clip.authors.length) {
		out.authors = clip.authors;
		out.familyNames = clip.familyNames;
	}
	if (!out.date && clip.date) {
		out.date = clip.date;
		out.year ??= clip.year;
	}
	if (out.abstract && clip.abstract && truncated(out.abstract) && !truncated(clip.abstract) && clip.abstract.length > out.abstract.length)
		out.abstract = clip.abstract;
	out.abstract ??= clip.abstract;
	return out;
}

/**
 * found, with its gaps (date, publisher, ISBN…) filled from the book's catalog record, and a
 * cut-off title replaced by the record's.
 */
export function fillFromCatalog(found: ReferenceData, book: ReferenceData): ReferenceData {
	const out = fillGaps(found, book);
	out.isbn ??= book.isbn;
	if (truncated(out.title) && book.title) out.title = book.title;
	return out;
}

/**
 * A reference from what a file says about itself: an ebook is a book, anything else a
 * document. `book` decides when the file couldn't be read at all.
 */
export function fromFile(info: FileInfo | null, fallbackTitle: string, source: string, book = false): ReferenceData {
	const authors = info?.authors ?? [];
	const date = parseDate(info?.date);
	const isbn = info?.identifiers.find((i): i is Identifier => i.kind === "isbn")?.value;
	const doi = info?.identifiers.find((i): i is Identifier => i.kind === "doi")?.value;
	return {
		type: (info?.book ?? book) ? "book" : "document",
		title: info?.title || fallbackTitle,
		authors,
		familyNames: authors.map(familyFromFullName),
		date,
		year: yearOf(date),
		publisher: info?.publisher,
		language: info?.language,
		abstract: info?.description,
		isbn,
		doi,
		source,
	};
}

/** A looked-up reference, with what it lacks taken from the file's own metadata. */
export function fillFromFile(found: ReferenceData, info: FileInfo | null): ReferenceData {
	if (!info) return found;
	const own = fromFile(info, found.title, found.source);
	const out = { ...found };
	if (!out.authors.length && own.authors.length) {
		out.authors = own.authors;
		out.familyNames = own.familyNames;
	}
	if (!out.date && own.date) {
		out.date = own.date;
		out.year ??= own.year;
	}
	out.publisher ??= own.publisher;
	out.language ??= own.language;
	out.abstract ??= own.abstract;
	return out;
}
