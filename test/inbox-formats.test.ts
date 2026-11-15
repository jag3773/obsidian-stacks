// Ebooks and documents dropped in the inbox: identified by their own ISBN or DOI, looked up,
// filed and linked; described from their own metadata when no lookup finds them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { App, Notice, TFile, http } from "obsidian";
import { Inbox, fillFromFile, fromFile } from "../src/inbox";
import { Library } from "../src/library";
import { LibrarySettings, withDefaults } from "../src/settings";

/* eslint-disable @typescript-eslint/no-explicit-any */

const fetcher = async (url: string, headers?: Record<string, string>) => (await import("obsidian")).requestUrl({ url, headers });

function setup(overrides: Partial<LibrarySettings> = {}) {
	const app = new App();
	const settings = withDefaults(overrides);
	const library = new Library(app as any, () => settings);
	const inbox = new Inbox(app as any, library, fetcher, () => settings);
	http.calls = [];
	http.handler = async () => ({ status: 404, text: "" });
	Notice.messages = [];
	return { app, settings, library, inbox };
}

async function flush(rounds = 20) {
	for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

const fm = (app: App, f: TFile) => app.metadataCache.getFileCache(f)?.frontmatter ?? {};
const bytes = (name: string) => {
	const b = readFileSync(`test/fixtures/formats/${name}`);
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const offline = async (): Promise<never> => {
	throw new Error("net::ERR_INTERNET_DISCONNECTED");
};
const urls = () => http.calls.map((c: any) => (typeof c === "string" ? c : c.url) as string);

function openLibrary(isbn: string, record: Record<string, unknown>) {
	http.handler = async ({ url }: { url: string }) =>
		url.startsWith("https://openlibrary.org/") && url.includes(isbn) ? { status: 200, text: JSON.stringify({ [`ISBN:${isbn}`]: record }) } : { status: 404, text: "" };
}

test("the inbox takes ebooks, Kindle files and documents, not other files", () => {
	const { app, inbox } = setup();
	for (const name of ["a.epub", "b.kepub", "c.kepub.epub", "d.mobi", "e.azw3", "f.azw", "g.docx", "h.odt", "i.pdf", "j.md"])
		assert.equal(inbox.accepts(app.vault.addFile(`Inbox/${name}`, "")), true, name);
	for (const name of ["k.kfx", "l.doc", "m.zip", "n.txt"]) assert.equal(inbox.accepts(app.vault.addFile(`Inbox/${name}`, "")), false, name);
	assert.equal(inbox.accepts(app.vault.addFile("Elsewhere/o.epub", "")), false, "only in the inbox folder");
});

test("an EPUB is looked up by its own ISBN, filed as a book, and linked; the file fills what the lookup lacks", async () => {
	const { app, inbox } = setup();
	openLibrary("9780306406157", { title: "The Quiet Orchard", authors: [{ name: "Miriam Okafor" }, { name: "Tomás Reyes" }], publish_date: "2019" });
	const file = app.vault.addFile("Inbox/download (3).epub", bytes("orchard.epub"));
	const note = await inbox.process(file);
	await flush();
	assert.ok(note);
	assert.ok(urls().some((u) => u.includes("9780306406157")), "looked up by the ISBN in the metadata");
	assert.equal(file.path, "References/attachments/okaforQuietOrchard2019.epub");
	const props = fm(app, note!);
	assert.equal(props.type, "book");
	assert.equal(props.title, "The Quiet Orchard");
	assert.equal(props.isbn, "9780306406157");
	assert.equal(props.publisher, "Fieldstone Press", "the lookup had none; the EPUB's");
	assert.deepEqual(props.attachments, ["[[okaforQuietOrchard2019.epub]]"]);
	assert.ok(Notice.messages.some((m) => m.startsWith("Stacks: created okaforQuietOrchard2019 from Open Library")));
});

test("an EPUB with its ISBN only on the copyright page is looked up by that", async () => {
	const { app, inbox } = setup();
	openLibrary("9781566199094", { title: "Salt Roads", authors: [{ name: "Idris Halloran" }], publish_date: "2011" });
	const note = await inbox.process(app.vault.addFile("Inbox/salt.epub", bytes("salt-roads.epub")));
	await flush();
	assert.equal(fm(app, note!).isbn, "9781566199094");
	assert.equal(fm(app, note!).title, "Salt Roads");
});

test("a Kindle book no lookup knows is filed from its own metadata, as a book", async () => {
	const { app, inbox } = setup();
	const file = app.vault.addFile("Inbox/B00XYZ.azw3", bytes("harbour-lights.azw3"));
	const note = await inbox.process(file);
	await flush();
	assert.ok(urls().some((u) => u.includes("9781841953021")), "the lookup was tried");
	const props = fm(app, note!);
	assert.equal(props.type, "book");
	assert.equal(props.title, "Harbour Lights");
	assert.deepEqual(props.authors, ["[[Søren Ní Bhriain]]", "[[Ada Quist]]"]);
	assert.equal(props.publisher, "Tidewater & Sons");
	assert.equal(props.published, "2015-09-30");
	assert.equal(props.year, 2015);
	assert.equal(props.isbn, "9781841953021");
	assert.deepEqual(props.attachments, [`[[${file.name}]]`]);
	assert.equal(file.extension, "azw3");
	assert.ok(Notice.messages.some((m) => /from Kindle book$/.test(m)));
});

test("an ebook naming an ISBN stays in the inbox while offline, and is filed once online", async () => {
	const { app, inbox } = setup();
	http.handler = offline;
	const file = app.vault.addFile("Inbox/harbour.mobi", bytes("harbour-lights.azw3"));
	assert.equal(await inbox.process(file), null);
	assert.equal(file.path, "Inbox/harbour.mobi");
	assert.equal(app.vault.getMarkdownFiles().length, 0);
	http.handler = async () => ({ status: 404, text: "" });
	assert.ok(await inbox.process(file));
	assert.ok(file.path.startsWith("References/attachments/"));
});

test("a Word document is looked up by the DOI in its text", async () => {
	const { app, inbox } = setup();
	http.handler = async ({ url }: { url: string }) =>
		url.includes(encodeURIComponent("10.1234/e2e.water"))
			? { status: 200, text: JSON.stringify({ message: { type: "report", title: ["Water Points in the Upper Valley"], author: [{ given: "Grace", family: "Mbeki" }], issued: { "date-parts": [[2024]] }, DOI: "10.1234/e2e.water" } }) }
			: { status: 404, text: "" };
	const file = app.vault.addFile("Inbox/report final v2.docx", bytes("water-report.docx"));
	const note = await inbox.process(file);
	await flush();
	assert.equal(fm(app, note!).doi, "10.1234/e2e.water");
	assert.equal(file.extension, "docx");
	assert.deepEqual(fm(app, note!).attachments, [`[[${file.name}]]`]);
});

test("an OpenDocument no lookup knows is filed as a document with its title and authors", async () => {
	const { app, inbox } = setup();
	const note = await inbox.process(app.vault.addFile("Inbox/report.odt", bytes("water-report.odt")));
	await flush();
	const props = fm(app, note!);
	assert.equal(props.type, "document");
	assert.equal(props.title, "Water Points in the Upper Valley");
	assert.deepEqual(props.authors, ["[[Grace Mbeki]]", "[[Lukas Brandt]]"]);
	assert.equal(props.doi, undefined, "a DOI the lookup didn't confirm isn't written");
});

test("an ebook still being copied is left in the inbox; Process inbox now files it as it is", async () => {
	const { app, inbox } = setup();
	const whole = bytes("orchard.epub");
	const file = app.vault.addFile("Inbox/partial.epub", whole.slice(0, 3000));
	assert.equal(await inbox.process(file), null);
	assert.ok(Notice.messages.some((m) => m.includes("partial.epub looks incomplete")));
	assert.equal(file.path, "Inbox/partial.epub");
	// Explicitly: it can't be read, so it is filed under its name (a book, being an EPUB).
	const note = await inbox.process(file, true);
	await flush();
	assert.equal(fm(app, note!).title, "partial");
	assert.equal(fm(app, note!).type, "book");
});

test("an ebook of a reference already in the library is attached to it, not filed twice", async () => {
	const { app, inbox } = setup();
	app.vault.addFile("References/attachments/okaforQuietOrchard2019.pdf", "%PDF");
	const existing = app.vault.addFile(
		"References/okaforQuietOrchard2019.md",
		`---\n{"citekey":"okaforQuietOrchard2019","type":"book","title":"The Quiet Orchard","isbn":"9780306406157","attachments":["[[okaforQuietOrchard2019.pdf]]"]}\n---\n`
	);
	const file = app.vault.addFile("Inbox/orchard.epub", bytes("orchard.epub"));
	assert.equal(await inbox.process(file), existing);
	await flush();
	assert.equal(app.vault.getMarkdownFiles().length, 1);
	assert.equal(file.path, "References/attachments/okaforQuietOrchard2019.epub");
	assert.deepEqual(fm(app, existing).attachments, ["[[okaforQuietOrchard2019.epub]]", "[[okaforQuietOrchard2019.pdf]]"]);
	assert.ok(Notice.messages.some((m) => m === "Stacks: attached orchard.epub to existing okaforQuietOrchard2019"));
	// A second copy of the same file isn't filed again.
	const again = app.vault.addFile("Inbox/orchard copy.epub", bytes("orchard.epub"));
	assert.equal(await inbox.process(again), null);
	assert.equal(again.path, "Inbox/orchard copy.epub");
});

test("fromFile and fillFromFile: an ebook is a book; the lookup's values win", () => {
	const info = { identifiers: [{ kind: "isbn" as const, value: "9780306406157" }], text: "", title: "T", authors: ["Jane Doe"], date: "2001-05", publisher: "P", book: true };
	const own = fromFile(info, "file", "EPUB");
	assert.equal(own.type, "book");
	assert.equal(own.year, 2001);
	assert.equal(own.isbn, "9780306406157");
	assert.equal(fromFile(null, "scan 12", "Word document").title, "scan 12");
	const filled = fillFromFile({ type: "book", title: "Looked up", authors: ["A B"], familyNames: ["B"], publisher: "Theirs", source: "Open Library" }, info);
	assert.equal(filled.title, "Looked up");
	assert.deepEqual(filled.authors, ["A B"]);
	assert.equal(filled.publisher, "Theirs");
	assert.equal(filled.date, "2001-05");
});

test("without the platform's decompression (older iOS), an ebook is still filed, under its filename", async () => {
	const { app, inbox } = setup();
	const saved = (globalThis as any).DecompressionStream;
	delete (globalThis as any).DecompressionStream;
	try {
		const note = await inbox.process(app.vault.addFile("Inbox/Some Book.epub", bytes("orchard.epub")));
		await flush();
		assert.equal(fm(app, note!).title, "Some Book");
		assert.equal(fm(app, note!).type, "book", "an EPUB is a book even when it can't be read");
	} finally {
		(globalThis as any).DecompressionStream = saved;
	}
});
