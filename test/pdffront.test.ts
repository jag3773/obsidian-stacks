// What a PDF's first page says about itself when it names no DOI or ISBN: the byline under
// its title, and for a web page printed from a browser, the page's URL and the print date.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error: pdfjs-dist ships .d.mts types that this tsconfig doesn't resolve; tests only.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { App, Notice, http, pdf } from "obsidian";
import { Inbox } from "../src/inbox";
import { Library } from "../src/library";
import { PdfLine, readFront } from "../src/pdfFront";
import { withDefaults } from "../src/settings";
import { buildPdf } from "./pdf-fixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const DOC_URL = "https://docs.google.com/document/u/0/d/1GoApoXwAjcmYvHPhnhezVeLjBes0NQheRIH6Qi1xk0M/mobilebasic";

const line = (text: string, size: number, y = 0): PdfLine => ({ text, size, y });
const body = (n: number) => Array.from({ length: n }, (_, i) => line(`Body text line ${i} that runs on for a while like a paragraph does.`, 11));

/** A Google Doc printed to PDF from Chrome, as its first page reads. */
const printedDoc = (): PdfLine[] => [
	line("Translation Quality Standards Comparison Chart", 14),
	line("Teryl Gonzalez", 14),
	line("Feb 9, 2026", 14),
	line("1. FOBAI", 12),
	...body(12),
	line("11/20/26, 2:04 PM Translation Quality Standards Compared", 8),
	line(`${DOC_URL} 1/3`, 8),
];

test("the byline under the title gives the author and the date", () => {
	const front = readFront(printedDoc(), {});
	assert.deepEqual(front.authors, ["Teryl Gonzalez"]);
	assert.equal(front.date, "2026-02-09");
});

test("a page printed from a browser gives its URL and the date it was printed", () => {
	const front = readFront(printedDoc(), { creator: CHROME, created: "D:20261120190433+00'00'" });
	assert.equal(front.url, DOC_URL);
	assert.equal(front.accessed, "2026-11-20");
});

test("a URL is only taken from a PDF a browser printed", () => {
	const front = readFront(printedDoc(), { creator: "Microsoft Word", created: "D:20261120190433" });
	assert.equal(front.url, undefined);
	assert.equal(front.accessed, undefined);
});

test("'By' names the authors, several of them, with or without a date", () => {
	const front = readFront([line("A Study of Things", 18), line("By Ana Lima, Bo Chen and Teryl van der Berg", 13), ...body(10)], {});
	assert.deepEqual(front.authors, ["Ana Lima", "Bo Chen", "Teryl van der Berg"]);
	assert.equal(front.date, undefined);
});

test("a heading or subtitle beside the title isn't taken for an author", () => {
	// No date and no "By": a short capitalized line could be anything.
	assert.deepEqual(readFront([line("Annual Report", 18), line("Field Practices Compared", 14), ...body(10)], {}).authors, []);
	// The title itself is never the author, even next to a date.
	assert.deepEqual(readFront([line("Teryl Gonzalez", 18), line("March 2024", 14), ...body(10)], {}).authors, []);
	// A document's label or an organization beside the date isn't a person (seen in a library).
	assert.deepEqual(readFront([line("Mission Command", 18), line("White Paper", 14), line("3 April 2012", 14), ...body(10)], {}).authors, []);
	assert.deepEqual(readFront([line("Masalit Timeline", 18), line("JESUS Film", 14), line("January 2018", 14), ...body(10)], {}).authors, []);
	assert.deepEqual(readFront([line("Lead Indicators", 18), line("Lutheran Bible Translators", 14), line("October 15, 2021", 14), ...body(10)], {}).authors, []);
	assert.deepEqual(readFront([line("CDO Interview", 18), line("Candidate Interview Questionnaire", 14), line("August 2023", 14), ...body(10)], {}).authors, []);
	// A line in the body, past the title block, isn't read.
	assert.deepEqual(readFront([line("Title Here", 18), ...body(3), line("Ana Lima", 11), line("Feb 9, 2026", 11), ...body(5)], {}).authors, []);
});

test("a title block in the body's own size gives nothing", () => {
	const front = readFront([line("Plain Title", 11), line("Ana Lima", 11), line("Feb 9, 2026", 11), ...body(10)], {});
	assert.deepEqual(front.authors, []);
	assert.equal(front.date, undefined);
});

// Through the inbox, with the real PDF.js ------------------------------------------------------

test("a printed Google Doc in the inbox is filed with its author, date, URL and print date", async () => {
	pdf.impl = pdfjs;
	const app = new App();
	const settings = withDefaults({});
	const library = new Library(app as any, () => settings);
	const inbox = new Inbox(app as any, library, async (url, headers) => (await import("obsidian")).requestUrl({ url, headers }), () => settings);
	http.calls = [];
	http.handler = async () => ({ status: 404, text: "" });
	Notice.messages = [];
	const bodyText = Array.from({ length: 12 }, (_, i) => ({ x: 72, y: 560 - i * 14, size: 11, text: `Bible translation agencies who participate in the forum, line ${i}.` }));
	const bytes = buildPdf(
		[
			{
				text: [
					{ x: 72, y: 665, size: 14, text: "Translation Quality Standards Comparison Chart" },
					{ x: 72, y: 649, size: 14, text: "Teryl Gonzalez" },
					{ x: 72, y: 632, size: 14, text: "Feb 9, 2026" },
					...bodyText,
					{ x: 20, y: 770, size: 8, text: "11/20/26, 2:04 PM Translation Quality Standards Compared" },
					{ x: 20, y: 17, size: 8, text: `${DOC_URL} 1/3` },
				],
			},
		],
		{ info: { Title: "Translation Quality Standards Compared", Creator: CHROME, Producer: "Skia/PDF m157", CreationDate: "D:20261120190433+00'00'" } }
	);
	const file = await app.vault.createBinary("Inbox/TranslationQualityStandards.pdf", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
	const note = await inbox.process(file);
	assert.ok(note, Notice.messages.join("; "));
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
	const props = app.metadataCache.getFileCache(note)?.frontmatter ?? {};
	assert.equal(props.title, "Translation Quality Standards Compared");
	assert.deepEqual(props.authors, ["[[Teryl Gonzalez]]"]);
	assert.equal(props.published, "2026-02-09");
	assert.equal(props.year, 2026);
	assert.equal(props.url, DOC_URL);
	assert.equal(props.accessed, "2026-11-20");
	assert.match(String(props.citekey), /^gonzalez.*2026$/);
});
