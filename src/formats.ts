/**
 * Pure module: the file formats the inbox files besides notes, and what can be read from each
 * without the network. PDFs are read with Obsidian's PDF.js (src/pdf.ts); the others here:
 *
 * - EPUB, including Kobo's .kepub and .kepub.epub: the package metadata (title, creators,
 *   ISBN, publisher, date, language, description), and the text of the first and last pages,
 *   where a copyright page names the ISBN when the metadata doesn't.
 * - Kindle MOBI, AZW and AZW3 (and old .prc): the EXTH header (author, publisher, ISBN,
 *   date, title). It isn't encrypted, so DRM-protected books are identified too.
 * - Word .docx and OpenDocument .odt: the document's title and author, and its text.
 *
 * Kindle KFX isn't read: its format isn't documented.
 */
import { Identifier, findIdentifierInText, normalizeDoi, normalizeIsbn } from "./identifiers";
import { zipComplete, zipEntries, zipText } from "./zip";

export type InboxFormat = "pdf" | "epub" | "mobi" | "docx" | "odt";

/** File extensions the inbox files, and the format each is read as. */
export const INBOX_EXTENSIONS: Record<string, InboxFormat> = {
	pdf: "pdf",
	epub: "epub",
	kepub: "epub",
	mobi: "mobi",
	azw: "mobi",
	azw3: "mobi",
	prc: "mobi",
	docx: "docx",
	odt: "odt",
};

/** How each format is named in messages and as a reference's source. */
export const FORMAT_LABELS: Record<InboxFormat, string> = {
	pdf: "PDF",
	epub: "EPUB",
	mobi: "Kindle book",
	docx: "Word document",
	odt: "OpenDocument text",
};

/** The format the inbox reads a file extension as, if any. */
export function inboxFormat(extension: string): InboxFormat | null {
	return INBOX_EXTENSIONS[extension.toLowerCase()] ?? null;
}

/** What a file says about itself, before any lookup. */
export interface FileInfo {
	/** Identifiers from the file's own metadata, most reliable first. */
	identifiers: Identifier[];
	/** Text to search for a DOI, ISBN or PMID (opening pages, copyright page, body). */
	text: string;
	title?: string;
	authors: string[];
	/** Publication date as written. */
	date?: string;
	publisher?: string;
	language?: string;
	description?: string;
	/** True for ebooks: a reference made from the file alone is a book. */
	book: boolean;
}

/** The identifiers to look a file up by: its metadata's, then the first found in its text. */
export function identifiersOf(info: FileInfo): Identifier[] {
	const out = [...info.identifiers];
	const fromText = findIdentifierInText(info.text);
	if (fromText && !out.some((i) => i.kind === fromText.kind && i.value === fromText.value)) out.push(fromText);
	return out;
}

// ---------------------------------------------------------------- completeness

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/**
 * True when a Kindle file has arrived in full: its record table is there and the last record
 * starts inside the file. A copy still being written ends before it.
 */
export function mobiComplete(b: Uint8Array): boolean {
	if (b.length < 78 || latin1(b.subarray(60, 68)) !== "BOOKMOBI") return false;
	const n = u16be(b, 76);
	if (!n || b.length < 78 + n * 8) return false;
	const last = u32be(b, 78 + (n - 1) * 8);
	return last < b.length;
}

/** Whether a non-PDF inbox file looks complete (see sync.looksComplete for PDFs). */
export function fileComplete(format: Exclude<InboxFormat, "pdf">, b: Uint8Array): boolean {
	return format === "mobi" ? mobiComplete(b) : zipComplete(b);
}

// ---------------------------------------------------------------- XML helpers

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Text with XML/HTML character references decoded. */
export function decodeXml(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === "#") {
			const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});
}

/** Markup as plain text: block ends become line breaks, tags go, entities are decoded. */
export function markupText(xml: string): string {
	return decodeXml(
		xml
			.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
			.replace(/<\/(p|div|h[1-6]|li|tr|text:p|text:h|w:p)>|<br\b[^>]*>|<w:br\b[^>]*>|<w:tab\b[^>]*>/gi, "\n")
			.replace(/<[^>]+>/g, "")
	)
		.replace(/[ \t\u00a0]+/g, " ")
		.replace(/\n\s*\n+/g, "\n")
		.trim();
}

const clean = (s: string | undefined) => (s === undefined ? undefined : markupText(s).replace(/\s+/g, " ").trim() || undefined);

/** An attribute's value from an element's attribute text, any namespace prefix. */
function attr(attrs: string, name: string): string | undefined {
	const m = attrs.match(new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
	return m ? decodeXml(m[2] ?? m[3] ?? "") : undefined;
}

interface XmlElement {
	name: string;
	attrs: string;
	text: string;
}

/** Elements with these local names (any prefix), in document order. */
function elements(xml: string, ...names: string[]): XmlElement[] {
	const re = new RegExp(`<((?:[\\w-]+:)?(${names.join("|")}))\\b([^>]*?)(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, "gi");
	return [...xml.matchAll(re)].map((m) => ({ name: m[2].toLowerCase(), attrs: m[3] ?? "", text: m[4] ?? "" }));
}

/** A file identifier value as an ISBN or DOI, when it is one. */
function identifierFrom(value: string, scheme = ""): Identifier | null {
	const v = decodeXml(value).trim();
	const isbnish = v.replace(/^(?:urn:)?isbn:?\s*/i, "");
	if (/isbn/i.test(scheme) || /^(?:urn:)?isbn/i.test(v) || /^[\d\s-]{9,17}[\dX]$/i.test(isbnish)) {
		const isbn = normalizeIsbn(isbnish);
		if (isbn) return { kind: "isbn", value: isbn };
	}
	if (/doi/i.test(scheme) || /^(?:urn:)?doi:|^10\.\d{4,}\//i.test(v) || /doi\.org\//i.test(v)) {
		const doi = normalizeDoi(v.replace(/^urn:doi:/i, ""));
		if (doi) return { kind: "doi", value: doi };
	}
	return null;
}

const unique = (ids: (Identifier | null)[]): Identifier[] =>
	ids.filter((i, n, all): i is Identifier => !!i && all.findIndex((x) => x?.kind === i.kind && x.value === i.value) === n);

/** Creator roles that aren't authors (MARC relator codes): editors, translators, producers. */
const NOT_AUTHOR = /^(edt|trl|bkp|ill|nrt|pbl|ctb|com|adp|ann|aui|aft|dsr|cov|pfr|red|mrk)$/i;

// ---------------------------------------------------------------- EPUB

/** Pages of the book searched for an identifier: the first and last few. */
const EPUB_PAGES_FRONT = 10;
const EPUB_PAGES_BACK = 3;
const MAX_TEXT = 200_000;

/** Join a path relative to a folder inside the archive ("OEBPS/", "../Text/a.xhtml"). */
function resolveIn(base: string, href: string): string {
	const parts = (base ? base.split("/") : []).concat(decodeURIComponent(href.split("#")[0]).split("/"));
	const out: string[] = [];
	for (const p of parts) {
		if (p === "..") out.pop();
		else if (p && p !== ".") out.push(p);
	}
	return out.join("/");
}

/** Read an EPUB's package metadata and the text of its first and last pages. */
export async function readEpub(b: Uint8Array): Promise<FileInfo> {
	const entries = zipEntries(b);
	const container = await zipText(b, "META-INF/container.xml", entries);
	const opfPath = container ? attr(elements(container, "rootfile")[0]?.attrs ?? "", "full-path") : undefined;
	const opf = (opfPath && (await zipText(b, opfPath, entries))) || "";
	if (!opf) throw new Error("not an EPUB: no package document");
	const metadata = opf.match(/<(?:[\w-]+:)?metadata\b[\s\S]*?<\/(?:[\w-]+:)?metadata\s*>/i)?.[0] ?? opf;

	// EPUB 3 gives a creator's role in a <meta refines="#id" property="role">.
	const roles = new Map<string, string>();
	for (const m of elements(metadata, "meta")) {
		const refines = attr(m.attrs, "refines");
		if (refines && attr(m.attrs, "property") === "role") roles.set(refines.replace(/^#/, ""), clean(m.text) ?? "");
	}
	const dc = (name: string) => elements(metadata, name);

	const identifiers = unique(dc("identifier").map((e) => identifierFrom(markupText(e.text), attr(e.attrs, "scheme") ?? "")));
	const authors = dc("creator")
		.filter((e) => {
			const id = attr(e.attrs, "id");
			const role = attr(e.attrs, "role") ?? (id ? roles.get(id) : undefined);
			return !role || !NOT_AUTHOR.test(role);
		})
		.map((e) => clean(e.text))
		.filter((n): n is string => !!n);
	// A publication date wins over others (EPUB 2 marks them with opf:event).
	const dates = dc("date");
	const date = clean((dates.find((e) => /publication/i.test(attr(e.attrs, "event") ?? "")) ?? dates.find((e) => !attr(e.attrs, "event")) ?? dates[0])?.text);

	// The first and last pages in reading order, for a copyright page naming the ISBN.
	const base = opfPath!.includes("/") ? opfPath!.slice(0, opfPath!.lastIndexOf("/")) : "";
	const manifest = new Map<string, string>();
	for (const item of elements(opf, "item")) {
		const id = attr(item.attrs, "id");
		const href = attr(item.attrs, "href");
		if (id && href && /html/i.test(attr(item.attrs, "media-type") ?? "")) manifest.set(id, resolveIn(base, href));
	}
	const spine = elements(opf, "itemref")
		.map((e) => manifest.get(attr(e.attrs, "idref") ?? ""))
		.filter((p): p is string => !!p);
	const encryption = await zipText(b, "META-INF/encryption.xml", entries);
	const encrypted = new Set((encryption ? elements(encryption, "CipherReference") : []).map((e) => resolveIn("", attr(e.attrs, "URI") ?? "")));
	const pages = [...new Set([...spine.slice(0, EPUB_PAGES_FRONT), ...spine.slice(-EPUB_PAGES_BACK)])].filter((p) => !encrypted.has(p));
	let text = "";
	for (const page of pages) {
		if (text.length > MAX_TEXT) break;
		const html = await zipText(b, page, entries).catch(() => null);
		if (html) text += markupText(html) + "\n";
	}

	return {
		identifiers,
		text,
		title: clean(dc("title")[0]?.text),
		authors,
		date,
		publisher: clean(dc("publisher")[0]?.text),
		language: clean(dc("language")[0]?.text),
		description: clean(dc("description")[0]?.text),
		book: true,
	};
}

// ---------------------------------------------------------------- Kindle

function latin1(b: Uint8Array): string {
	let s = "";
	for (const x of b) s += String.fromCharCode(x);
	return s;
}

/** Read a Kindle file's EXTH metadata (MOBI, AZW, AZW3). */
export function readMobi(b: Uint8Array): FileInfo {
	if (!mobiComplete(b)) throw new Error("not a Kindle book");
	const rec0 = u32be(b, 78);
	if (latin1(b.subarray(rec0 + 16, rec0 + 20)) !== "MOBI") throw new Error("not a Kindle book: no MOBI header");
	const headerLength = u32be(b, rec0 + 20);
	const decoder = new TextDecoder(u32be(b, rec0 + 28) === 65001 ? "utf-8" : "windows-1252");
	const nameOffset = u32be(b, rec0 + 84);
	const nameLength = u32be(b, rec0 + 88);
	const fullName = decoder.decode(b.subarray(rec0 + nameOffset, rec0 + nameOffset + nameLength)).trim();

	const exth = new Map<number, string[]>();
	const at = rec0 + 16 + headerLength;
	if (u32be(b, rec0 + 128) & 0x40 && latin1(b.subarray(at, at + 4)) === "EXTH") {
		const count = u32be(b, at + 8);
		let p = at + 12;
		for (let i = 0; i < count && p + 8 <= b.length; i++) {
			const type = u32be(b, p);
			const length = u32be(b, p + 4);
			if (length < 8 || p + length > b.length) break;
			exth.set(type, [...(exth.get(type) ?? []), decoder.decode(b.subarray(p + 8, p + length)).trim()]);
			p += length;
		}
	}
	const one = (type: number) => exth.get(type)?.find(Boolean);
	// EXTH 100 is the author, repeated for several; 104 the ISBN; 503 the updated title.
	const authors = (exth.get(100) ?? []).flatMap((a) => (a.includes(";") ? a.split(/\s*;\s*/) : [a])).filter(Boolean);
	return {
		identifiers: unique((exth.get(104) ?? []).map((v) => identifierFrom(v, "isbn"))),
		text: "",
		title: one(503) || fullName || undefined,
		authors,
		date: one(106),
		publisher: one(101),
		language: one(524),
		description: clean(one(103)),
		book: true,
	};
}

// ---------------------------------------------------------------- Word and OpenDocument

/** A document creator field as names: "A; B" or "A, B and C" become several. */
function splitCreators(s: string | undefined): string[] {
	if (!s) return [];
	return s
		.split(/\s*(?:;|\band\b|&)\s*/)
		.map((x) => x.trim())
		.filter(Boolean);
}

/** Read a Word document's title and author, and its text. */
export async function readDocx(b: Uint8Array): Promise<FileInfo> {
	const entries = zipEntries(b);
	const body = await zipText(b, "word/document.xml", entries);
	if (body === null) throw new Error("not a Word document");
	const core = (await zipText(b, "docProps/core.xml", entries)) ?? "";
	return {
		identifiers: unique(elements(core, "identifier").map((e) => identifierFrom(markupText(e.text)))),
		text: markupText(body).slice(0, MAX_TEXT),
		title: clean(elements(core, "title")[0]?.text),
		authors: splitCreators(clean(elements(core, "creator")[0]?.text)),
		language: clean(elements(core, "language")[0]?.text),
		description: clean(elements(core, "description")[0]?.text),
		book: false,
	};
}

/** Read an OpenDocument text's title and author, and its text. */
export async function readOdt(b: Uint8Array): Promise<FileInfo> {
	const entries = zipEntries(b);
	const content = await zipText(b, "content.xml", entries);
	if (content === null) throw new Error("not an OpenDocument text");
	const meta = (await zipText(b, "meta.xml", entries)) ?? "";
	// The author is the initial creator; dc:creator is whoever saved it last.
	const creator = clean(elements(meta, "initial-creator")[0]?.text) ?? clean(elements(meta, "creator")[0]?.text);
	return {
		identifiers: [],
		text: markupText(content).slice(0, MAX_TEXT),
		title: clean(elements(meta, "title")[0]?.text),
		authors: splitCreators(creator),
		language: clean(elements(meta, "language")[0]?.text),
		description: clean(elements(meta, "description")[0]?.text),
		book: false,
	};
}

/** Read a non-PDF inbox file. Throws when the file isn't what its extension says. */
export async function readFile(format: Exclude<InboxFormat, "pdf">, b: Uint8Array): Promise<FileInfo> {
	switch (format) {
		case "epub":
			return readEpub(b);
		case "mobi":
			return readMobi(b);
		case "docx":
			return readDocx(b);
		case "odt":
			return readOdt(b);
	}
}
