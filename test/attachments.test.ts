import { test } from "node:test";
import assert from "node:assert/strict";
import { byPreference, extensionOf, formatRank, parseFormats, pickMain } from "../src/attachments";

const f = (name: string) => ({ name, extension: name.slice(name.lastIndexOf(".") + 1) });

test("formats are parsed from a comma list, lower case, without dots or repeats", () => {
	assert.deepEqual(parseFormats("pdf, .EPUB  docx;pdf"), ["pdf", "epub", "docx"]);
	assert.deepEqual(parseFormats(" "), []);
	assert.deepEqual(parseFormats(["PDF", "", "epub"]), ["pdf", "epub"]);
});

test("the main file: most preferred format first, list order among equals, else the first file", () => {
	const files = [f("x.zip"), f("b.epub"), f("a.PDF"), f("c.pdf")];
	assert.equal(pickMain(files, ["pdf", "epub"])?.name, "a.PDF");
	assert.equal(pickMain(files, ["epub", "pdf"])?.name, "b.epub");
	assert.equal(pickMain(files, ["docx"])?.name, "x.zip");
	assert.equal(pickMain(files, [])?.name, "x.zip");
	assert.equal(pickMain([], ["pdf"]), null);
	assert.equal(formatRank("EPUB", ["pdf", "epub"]), 1);
	assert.equal(formatRank("zip", ["pdf", "epub"]), 2);
});

test("extensions come from link paths, ignoring subpaths and folders", () => {
	assert.equal(extensionOf("a/b.v2/Book.PDF#page=3"), "pdf");
	assert.equal(extensionOf("folder.d/README"), "");
	assert.equal(extensionOf(".hidden"), "");
});

test("import order puts preferred formats first and keeps the rest in order", () => {
	assert.deepEqual(byPreference(["a.zip", "b.epub", "c.pdf", "d.txt", "e.pdf"], ["pdf", "epub"]), ["c.pdf", "e.pdf", "b.epub", "a.zip", "d.txt"]);
});
