// The inbox's file readers, against files made by real tools (scripts/make-format-fixtures.sh):
// pandoc's EPUB 3, EPUB 2 and Word output, LibreOffice's OpenDocument, and a Kindle file laid
// out per the MobileRead wiki.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeXml, fileComplete, identifiersOf, inboxFormat, markupText, mobiComplete, readDocx, readEpub, readFile, readMobi, readOdt } from "../src/formats";
import { MAX_ENTRY_BYTES, zipComplete, zipEntries, zipEntry, zipText } from "../src/zip";

const fixture = (name: string) => new Uint8Array(readFileSync(`test/fixtures/formats/${name}`));

test("extensions: ebooks (Kobo's .kepub too), Kindle files and documents, in any case", () => {
	assert.equal(inboxFormat("epub"), "epub");
	assert.equal(inboxFormat("KEPUB"), "epub");
	for (const ext of ["mobi", "azw", "azw3", "prc"]) assert.equal(inboxFormat(ext), "mobi", ext);
	assert.equal(inboxFormat("docx"), "docx");
	assert.equal(inboxFormat("odt"), "odt");
	assert.equal(inboxFormat("pdf"), "pdf");
	for (const ext of ["kfx", "doc", "md", "zip", ""]) assert.equal(inboxFormat(ext), null, ext);
});

test("EPUB 3: metadata ISBN, authors without the translator, publisher, date, language, description", async () => {
	const info = await readEpub(fixture("orchard.epub"));
	assert.deepEqual(info.identifiers, [{ kind: "isbn", value: "9780306406157" }]);
	assert.equal(info.title, "The Quiet Orchard");
	assert.deepEqual(info.authors, ["Miriam Okafor", "Tomás Reyes"]);
	assert.equal(info.publisher, "Fieldstone Press");
	assert.equal(info.date, "2019-04-02");
	assert.equal(info.language, "en-GB");
	assert.equal(info.description, "A field guide to orchards & the people who keep them.");
	assert.equal(info.book, true);
	assert.match(info.text, /Apples first\./);
});

test("EPUB 2: no ISBN in the metadata (a UUID), so the copyright page's is found in the text", async () => {
	const info = await readEpub(fixture("salt-roads.epub"));
	assert.deepEqual(info.identifiers, [], "the UUID isn't an identifier to look up");
	assert.deepEqual(info.authors, ["Idris Halloran"]);
	assert.equal(info.date, "2011");
	assert.deepEqual(identifiersOf(info), [{ kind: "isbn", value: "9781566199094" }]);
});

test("Kindle: EXTH author (twice), ISBN, publisher, date, title, language and description", () => {
	const b = fixture("harbour-lights.azw3");
	assert.equal(mobiComplete(b), true);
	const info = readMobi(b);
	assert.deepEqual(info.identifiers, [{ kind: "isbn", value: "9781841953021" }]);
	assert.equal(info.title, "Harbour Lights");
	assert.deepEqual(info.authors, ["Søren Ní Bhriain", "Ada Quist"]);
	assert.equal(info.publisher, "Tidewater & Sons");
	assert.equal(info.date, "2015-09-30");
	assert.equal(info.language, "en");
	assert.equal(info.description, "Stories from a working harbour.");
	assert.equal(info.book, true);
});

test("a Kindle file still being copied is incomplete, and isn't read", () => {
	const b = fixture("harbour-lights.azw3");
	assert.equal(mobiComplete(b.subarray(0, b.length - 70)), false, "the last record is cut off");
	assert.equal(mobiComplete(b.subarray(0, 60)), false);
	assert.equal(mobiComplete(new TextEncoder().encode("TEXtREAd".padStart(68, "x"))), false, "a PalmDOC book has no metadata");
	assert.throws(() => readMobi(b.subarray(0, 100)));
});

test("Word: title and both authors from the document properties, a DOI in the text", async () => {
	const info = await readDocx(fixture("water-report.docx"));
	assert.equal(info.title, "Water Points in the Upper Valley");
	assert.deepEqual(info.authors, ["Grace Mbeki", "Lukas Brandt"]);
	assert.equal(info.book, false);
	assert.deepEqual(identifiersOf(info), [{ kind: "doi", value: "10.1234/e2e.water" }]);
});

test("OpenDocument from LibreOffice: the initial creator is the author, the DOI is in the text", async () => {
	const info = await readOdt(fixture("water-report.odt"));
	assert.equal(info.title, "Water Points in the Upper Valley");
	assert.deepEqual(info.authors, ["Grace Mbeki", "Lukas Brandt"]);
	assert.deepEqual(identifiersOf(info), [{ kind: "doi", value: "10.1234/e2e.water" }]);
});

test("a file that isn't what its extension says is an error, not a reference", async () => {
	await assert.rejects(readFile("epub", fixture("water-report.docx")), /not an EPUB/);
	await assert.rejects(readFile("docx", fixture("orchard.epub")), /not a Word document/);
	await assert.rejects(readFile("odt", fixture("orchard.epub")), /not an OpenDocument/);
	await assert.rejects(readFile("mobi", fixture("orchard.epub")), /not a Kindle book/);
});

test("ZIP: complete only with its central directory; entries inflate; a cut-off archive is incomplete", async () => {
	const b = fixture("water-report.docx");
	assert.equal(zipComplete(b), true);
	assert.equal(fileComplete("docx", b), true);
	for (const cut of [100, b.length / 2, b.length - 30]) assert.equal(zipComplete(b.subarray(0, Math.floor(cut))), false, `cut at ${cut}`);
	const names = zipEntries(b).map((e) => e.name);
	assert.ok(names.includes("word/document.xml"));
	assert.match((await zipText(b, "docProps/core.xml"))!, /Water Points/);
	assert.equal(await zipEntry(b, "no/such/file"), null);
	// pandoc stores the EPUB's mimetype uncompressed, as the format requires.
	assert.equal(await zipText(fixture("orchard.epub"), "mimetype"), "application/epub+zip");
});

test("ZIP: an entry claiming more than the limit isn't inflated", async () => {
	const b = fixture("water-report.docx");
	const entries = zipEntries(b).map((e) => (e.name === "word/document.xml" ? { ...e, size: MAX_ENTRY_BYTES + 1 } : e));
	assert.equal(await zipEntry(b, "word/document.xml", entries), null);
	assert.equal(await zipEntry(b, "word/document.xml", entries.map((e) => (e.name === "word/document.xml" ? { ...e, encrypted: true } : e))), null);
});

test("markup becomes text: entities decoded, blocks on their own lines", () => {
	assert.equal(decodeXml("A &amp; B &#233; &#x2014; &unknown;"), "A & B é — &unknown;");
	assert.equal(markupText("<p>One</p><p>Two&nbsp;<b>bold</b></p><script>x()</script>"), "One\nTwo bold");
	assert.equal(markupText('<w:p><w:r><w:t>ISBN</w:t></w:r><w:r><w:t xml:space="preserve"> 978-1</w:t></w:r></w:p>'), "ISBN 978-1");
});
