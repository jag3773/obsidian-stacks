// Notes written by the Kindle Highlights plugin (hadynz/obsidian-kindle-plugin 2.3.1) inside the
// references folder: completed as references, or taken into the reference already there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { App, Notice, TFile, http } from "obsidian";
import { addKindleHighlights, kindleAuthors, kindleBook, sameBook } from "../src/kindle";
import LibraryPlugin from "../src/main";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function flush(rounds = 20) {
	for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

async function setupPlugin() {
	const app = new App();
	const plugin = new LibraryPlugin(app as any, { id: "stacks" } as any);
	(plugin as any).data = {};
	await plugin.onload();
	http.calls = [];
	http.handler = async () => ({ status: 404, text: "" });
	Notice.messages = [];
	return { app, plugin };
}

const fm = (app: App, f: TFile) => app.metadataCache.getFileCache(f)?.frontmatter ?? {};

/** A note as the Kindle plugin writes it, with `extra` frontmatter from the File template. */
function kindleNote(extra: Record<string, unknown> = {}, highlights = HIGHLIGHTS) {
	const props = {
		...extra,
		"kindle-bookId": "B07B9F83WM-1",
		"kindle-title": "Accelerate: The Science of Lean Software and DevOps: Building and Scaling High Performing Technology Organizations",
		"kindle-author": "Nicole Forsgren PhD, Jez Humble, and Gene Kim",
		"kindle-asin": "B07B9F83WM",
		"kindle-highlightsCount": 2,
		"kindle-lastAnnotatedDate": "2021-05-20",
	};
	return `---\n${JSON.stringify(props)}\n---\n# Accelerate\n\n## Kindle highlights\n\n${highlights}\n`;
}
const HIGHLIGHTS = [
	"Speed depends on stability. — location: [147](kindle://book?action=open&asin=B07B9F83WM&location=147) ^ref-11111",
	"---",
	"Measure outcomes, not output. — location: [302](kindle://book?action=open&asin=B07B9F83WM&location=302) ^ref-22222",
	"---",
].join("\n\n");

const OL_RECORD = (isbn: string, title: string, date: string) =>
	JSON.stringify({ [`ISBN:${isbn}`]: { title, authors: [{ name: "Nicole Forsgren" }, { name: "Jez Humble" }, { name: "Gene Kim" }], publish_date: date, publishers: [{ name: "IT Revolution" }] } });

// What the Kindle plugin writes -----------------------------------------------------------------

test("a Kindle note is recognized by its flat properties, or the nested kindle-sync of older versions", () => {
	assert.deepEqual(kindleBook({ "kindle-bookId": "B1", "kindle-title": "T", "kindle-author": "A B" }), { bookId: "B1", title: "T", author: "A B" });
	assert.deepEqual(kindleBook({ "kindle-sync": { bookId: "B2", title: "T2", author: "C D" } }), { bookId: "B2", title: "T2", author: "C D" });
	assert.equal(kindleBook({ title: "Not Kindle" }), null);
});

test("Amazon's author line becomes names, without degrees", () => {
	assert.deepEqual(kindleAuthors("Nicole Forsgren PhD, Jez Humble, and Gene Kim"), ["Nicole Forsgren", "Jez Humble", "Gene Kim"]);
	assert.deepEqual(kindleAuthors("Dr. Henry Cloud & John Townsend"), ["Henry Cloud", "John Townsend"]);
	assert.deepEqual(kindleAuthors("Chip Heath and Dan Heath"), ["Chip Heath", "Dan Heath"]);
	assert.ok(sameBook({ title: "Accelerate: The Science…", author: "Nicole Forsgren PhD, Jez Humble" }, "Accelerate: the science behind DevOps", ["Forsgren", "Humble"]), "the PhD is not the family name");
});

test("the same book: the title before any subtitle, and the first author", () => {
	const book = { title: "The Forgotten Ways: Reactivating Apostolic Movements", author: "Alan Hirsch" };
	assert.ok(sameBook(book, "The forgotten ways: reactivating the missional church", ["Hirsch"]));
	assert.ok(!sameBook(book, "The Forgotten Ways Handbook", ["Hirsch"]), "a different title");
	assert.ok(!sameBook(book, "The Forgotten Ways", ["Smith"]), "a different author");
	assert.ok(!sameBook({ title: "Scrum", author: "Jeff Sutherland" }, "Scrum: a breathtakingly brief and agile introduction", ["Sims"]), "same short title, another author");
});

test("highlights are added once: a highlight with the same block id is already there", () => {
	const ref = "# Accelerate\n\nMy notes.\n";
	const once = addKindleHighlights(ref, "# Accelerate\n\n## Kindle highlights\n\n" + HIGHLIGHTS + "\n");
	assert.ok(once);
	assert.match(once, /^# Accelerate\n\nMy notes\.\n\n## Kindle highlights\n\nSpeed depends on stability\..*\^ref-11111\n\n---\n\nMeasure outcomes.*\^ref-22222\n$/s, "the title heading is left out, the trailing rule dropped");
	assert.equal(addKindleHighlights(once, "# Accelerate\n\n## Kindle highlights\n\n" + HIGHLIGHTS), null, "nothing new");
	const edited = once.replace("Speed depends on stability.", "Speed depends on stability (my edit).");
	assert.equal(addKindleHighlights(edited, HIGHLIGHTS), null, "an edited highlight keeps its block id");
	const more = addKindleHighlights(once, HIGHLIGHTS + "\n\nNew one. ^ref-33333");
	assert.match(more ?? "", /\^ref-22222\n\nNew one\. \^ref-33333\n$/);
});

// Through completion ------------------------------------------------------------------------

test("a Kindle note with an ISBN is completed where it is and keeps what the Kindle plugin needs", async () => {
	const { app, plugin } = await setupPlugin();
	http.handler = async ({ url }) =>
		url.includes("openlibrary.org/api/books") && url.includes("9781942788331") ? { status: 200, text: OL_RECORD("9781942788331", "Accelerate", "2018") } : { status: 404, text: "" };
	const note = app.vault.addFile("References/Kindle/Accelerate.md", kindleNote({ isbn: "9781942788331", type: "book" }));
	await flush();
	await plugin.completeFromProperties(note, false);
	await flush();
	assert.equal(note.path, "References/Kindle/forsgrenAccelerate2018.md", "renamed, and kept in the Kindle plugin's folder");
	const props = fm(app, note);
	assert.equal(props.citekey, "forsgrenAccelerate2018");
	assert.equal(props["kindle-bookId"], "B07B9F83WM-1");
	assert.match(await app.vault.read(note), /\^ref-22222/);
	plugin.unload();
});

test("a Kindle note for a book already in the library goes into that reference, which moves into the Kindle folder", async () => {
	const { app, plugin } = await setupPlugin();
	// The library has the print edition; the Kindle edition's ISBN is another one.
	const ref = app.vault.addFile(
		"References/forsgrenAccelerateScienceDevOps2018.md",
		`---\n${JSON.stringify({ citekey: "forsgrenAccelerateScienceDevOps2018", title: "Accelerate: the science behind DevOps", authors: ["[[Nicole Forsgren]]", "[[Jez Humble]]", "[[Gene Kim]]"], isbn: "978-1-942788-33-1", status: "processed" })}\n---\n# Accelerate\n\nMy notes on it.\n`
	);
	await app.vault.createFolder("References/Kindle");
	http.handler = async ({ url }) =>
		url.includes("openlibrary.org/api/books") ? { status: 200, text: OL_RECORD("9781942788355", "Accelerate", "2018-03-27") } : { status: 404, text: "" };
	const note = app.vault.addFile("References/Kindle/Accelerate.md", kindleNote({ isbn: "9781942788355" }));
	await flush();
	await plugin.completeFromProperties(note, false);
	await flush();
	assert.equal(app.vault.getAbstractFileByPath("References/Kindle/Accelerate.md"), null, "the Kindle note went to the trash");
	assert.equal(ref.path, "References/Kindle/forsgrenAccelerateScienceDevOps2018.md", "the reference moved into the Kindle folder");
	const props = fm(app, ref);
	assert.equal(props["kindle-bookId"], "B07B9F83WM-1", "the Kindle plugin will find it on its next sync");
	assert.equal(props["kindle-highlightsCount"], 2);
	assert.equal(props.citekey, "forsgrenAccelerateScienceDevOps2018", "its own properties are kept");
	assert.equal(props.isbn, "978-1-942788-33-1");
	assert.equal(props.status, "processed");
	const text = await app.vault.read(ref);
	assert.match(text, /My notes on it\.\n\n## Kindle highlights\n\nSpeed depends on stability.*\^ref-11111/s);
	assert.match(Notice.messages.at(-1) ?? "", /added the Kindle highlights for Accelerate.* to forsgrenAccelerateScienceDevOps2018/);
	plugin.unload();
});

test("a Kindle note with no ISBN is found by its title and author", async () => {
	const { app, plugin } = await setupPlugin();
	http.handler = async ({ url }) => {
		if (url.startsWith("https://openlibrary.org/search.json"))
			return { status: 200, text: JSON.stringify({ docs: [{ title: "Accelerate", author_name: ["Nicole Forsgren", "Jez Humble"], isbn: ["9781942788331"] }] }) };
		if (url.includes("openlibrary.org/api/books")) return { status: 200, text: OL_RECORD("9781942788331", "Accelerate", "2018") };
		return { status: 404, text: "" };
	};
	const note = app.vault.addFile("References/Kindle/Accelerate.md", kindleNote());
	await flush();
	await plugin.completeFromProperties(note, false);
	await flush();
	const props = fm(app, note);
	assert.equal(props.isbn, "9781942788331");
	assert.equal(props.year, 2018);
	assert.equal(props.type, "book");
	assert.equal(note.path, "References/Kindle/forsgrenAccelerate2018.md");
	plugin.unload();
});

test("a Kindle note no catalog knows is completed from the Kindle plugin's title and author", async () => {
	const { app, plugin } = await setupPlugin();
	const note = app.vault.addFile("References/Kindle/Accelerate.md", kindleNote());
	await flush();
	await plugin.completeFromProperties(note, false);
	await flush();
	const props = fm(app, note);
	assert.equal(props.type, "book");
	assert.deepEqual(props.authors, ["[[Nicole Forsgren]]", "[[Jez Humble]]", "[[Gene Kim]]"]);
	assert.match(String(props.citekey), /^forsgrenAccelerate/);
	plugin.unload();
});

test("a Kindle note with no identifier is completed automatically after it settles", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const { app, plugin } = await setupPlugin();
	const note = app.vault.addFile("References/Kindle/Accelerate.md", "");
	await app.vault.modify(note, kindleNote());
	await flush();
	t.mock.timers.tick(2000);
	await flush(40);
	assert.match(String(fm(app, note).citekey), /^forsgrenAccelerate/);
	plugin.unload();
});

test("a note outside the references folder, or one the Kindle plugin didn't write, isn't touched", async () => {
	const { app, plugin } = await setupPlugin();
	const outside = app.vault.addFile("Kindle/Accelerate.md", kindleNote());
	const plain = app.vault.addFile("References/Plain.md", `---\n{"title":"Plain"}\n---\n`);
	await flush();
	await plugin.completeFromProperties(outside, false);
	await plugin.completeFromProperties(plain, false);
	await flush();
	assert.equal(outside.path, "Kindle/Accelerate.md");
	assert.equal(plain.path, "References/Plain.md");
	assert.equal(http.calls.length, 0);
	plugin.unload();
});
