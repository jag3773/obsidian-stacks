import { test } from "node:test";
import assert from "node:assert/strict";
import { HealthNote, checkHealth, dateMs, healthReportMarkdown, pathLink, problemCount } from "../src/health";
import { DEFAULT_PROPERTY_NAMES } from "../src/properties";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 9).getTime();
const options = { properties: DEFAULT_PROPERTY_NAMES, staleDays: 365, staleStatuses: ["reading"], now: NOW };

function note(path: string, frontmatter: Record<string, unknown> | null, extra: Partial<HealthNote> = {}): HealthNote {
	const basename = path.replace(/^.*\//, "").replace(/\.md$/, "");
	const key = frontmatter?.citekey as string | undefined;
	return { path, basename, frontmatter, expectedBasename: key, attachments: [], attachmentNames: key ? [key] : [], linked: [], modified: NOW, ...extra };
}

const book = (key: string, extra: Record<string, unknown> = {}) => ({ citekey: key, type: "book", title: "T", authors: ["A B"], year: 2020, publisher: "P", ...extra });

test("a clean library has no problems", () => {
	const r = checkHealth({ notes: [note("R/a.md", book("a"))], files: [], duplicates: [] }, options);
	assert.equal(problemCount(r), 0);
	assert.match(healthReportMarkdown(r, ctx), /Nothing to fix\./);
});

test("citekey checks: missing, duplicated (any case), not matching the filename", () => {
	const r = checkHealth(
		{
			notes: [note("R/a.md", book("a")), note("R/A 1.md", book("A")), note("R/none.md", { title: "x" }), note("R/old.md", book("new"))],
			files: [],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.missingCitekey, ["R/none.md"]);
	assert.deepEqual(r.duplicateCitekeys, [{ citekey: "A", paths: ["R/A 1.md", "R/a.md"] }]);
	assert.deepEqual(
		r.filenameMismatch.map((m) => [m.path, m.expected]),
		[
			["R/A 1.md", "A"],
			["R/old.md", "new"],
		]
	);
});

test("broken frontmatter is reported and its note skips the other checks", () => {
	const r = checkHealth({ notes: [note("R/bad.md", null, { parseError: "bad indentation\nat line 2" })], files: [], duplicates: [] }, options);
	assert.deepEqual(r.brokenFrontmatter, [{ path: "R/bad.md", error: "bad indentation\nat line 2" }]);
	assert.deepEqual(r.missingCitekey, []);
	assert.match(healthReportMarkdown(r, ctx), /- \[\[R\/bad\|bad\]\]: bad indentation\n/);
});

test("a broken attachment link is offered the file of the same format named after the citekey", () => {
	const r = checkHealth(
		{
			notes: [
				note("R/a.md", book("a"), { attachments: [{ value: "[[old.pdf]]" }, { value: "[[a.zip]]", resolvesTo: "R/attachments/a.zip" }] }),
				note("R/b.md", book("b"), { attachments: [{ value: "[[gone.pdf]]" }] }),
				// An ebook's broken link is offered the ebook, not the PDF with the same name.
				note("R/c.md", book("c"), { attachments: [{ value: "[[Old title.epub|Book]]" }] }),
			],
			files: [
				{ path: "Elsewhere/a.pdf", inAttachments: false },
				{ path: "R/attachments/a.pdf", inAttachments: true },
				{ path: "R/attachments/a.zip", inAttachments: true },
				{ path: "R/attachments/c.pdf", inAttachments: true },
				{ path: "R/attachments/c.epub", inAttachments: true },
			],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.unresolvedAttachments, [
		{ path: "R/a.md", value: "[[old.pdf]]", candidate: "R/attachments/a.pdf" },
		{ path: "R/b.md", value: "[[gone.pdf]]", candidate: undefined },
		{ path: "R/c.md", value: "[[Old title.epub|Book]]", candidate: "R/attachments/c.epub" },
	]);
	assert.deepEqual(r.repairs, [
		{ note: "R/a.md", file: "R/attachments/a.pdf", previous: "[[old.pdf]]", legacy: undefined },
		{ note: "R/c.md", file: "R/attachments/c.epub", previous: "[[Old title.epub|Book]]", legacy: undefined },
		{ note: "R/c.md", file: "R/attachments/c.pdf", legacy: undefined },
	]);
	// A file a repair relinks isn't offered again; c has no PDF, so its unlinked c.pdf is.
	assert.deepEqual(r.orphanAttachments, [
		{ path: "R/attachments/a.pdf", candidateNote: undefined },
		{ path: "R/attachments/a.zip", candidateNote: undefined },
		{ path: "R/attachments/c.epub", candidateNote: undefined },
		{ path: "R/attachments/c.pdf", candidateNote: "R/c.md" },
	]);
});

test("orphan files: unlinked ones in the attachments folder, linked to a note with no file in their format when named after it", () => {
	const r = checkHealth(
		{
			notes: [
				note("R/a.md", book("a")),
				note("R/b.md", book("b"), { attachments: [{ value: "[[b.pdf]]", resolvesTo: "R/att/b.pdf" }], linked: ["R/att/b.pdf"] }),
			],
			files: [
				{ path: "R/att/a.pdf", inAttachments: true },
				{ path: "R/att/b.pdf", inAttachments: true },
				// b has a PDF but no ebook: its ebook is offered too.
				{ path: "R/att/b.epub", inAttachments: true },
				{ path: "R/att/stray.pdf", inAttachments: true },
				{ path: "Other/x.pdf", inAttachments: false },
			],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.orphanAttachments, [
		{ path: "R/att/a.pdf", candidateNote: "R/a.md" },
		{ path: "R/att/b.epub", candidateNote: "R/b.md" },
		{ path: "R/att/stray.pdf", candidateNote: undefined },
	]);
	assert.deepEqual(r.repairs, [
		{ note: "R/a.md", file: "R/att/a.pdf", legacy: undefined },
		{ note: "R/b.md", file: "R/att/b.epub", legacy: undefined },
	]);
});

test("the old pdf property is reported and moved by the note's one repair", () => {
	const r = checkHealth(
		{
			notes: [
				// Still read, resolves: moved on its own.
				note("R/a.md", book("a", { pdf: "[[a.pdf]]" }), { legacyPdf: "[[a.pdf]]", attachments: [{ value: "[[a.pdf]]", resolvesTo: "R/att/a.pdf" }], linked: ["R/att/a.pdf"] }),
				// Broken, with a PDF named after the citekey: moved and relinked in one repair.
				note("R/b.md", book("b", { pdf: "[[old.pdf]]" }), { legacyPdf: "[[old.pdf]]", attachments: [{ value: "[[old.pdf]]" }] }),
				// Broken, nothing to relink: moved as it is.
				note("R/c.md", book("c", { pdf: "[[gone.pdf]]" }), { legacyPdf: "[[gone.pdf]]", attachments: [{ value: "[[gone.pdf]]" }] }),
			],
			files: [
				{ path: "R/att/a.pdf", inAttachments: true },
				{ path: "R/att/b.pdf", inAttachments: true },
			],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.legacyPdf, [
		{ path: "R/a.md", value: "[[a.pdf]]" },
		{ path: "R/b.md", value: "[[old.pdf]]" },
		{ path: "R/c.md", value: "[[gone.pdf]]" },
	]);
	assert.deepEqual(r.repairs, [
		{ note: "R/a.md", legacy: "[[a.pdf]]" },
		{ note: "R/b.md", file: "R/att/b.pdf", previous: "[[old.pdf]]", legacy: "[[old.pdf]]" },
		{ note: "R/c.md", legacy: "[[gone.pdf]]" },
	]);
});

test("an orphan linked to a note with the old pdf property takes its move along", () => {
	const r = checkHealth(
		{
			notes: [note("R/a.md", book("a", { pdf: "[[a.pdf]]" }), { legacyPdf: "[[a.pdf]]", attachments: [{ value: "[[a.pdf]]", resolvesTo: "R/att/a.pdf" }], linked: ["R/att/a.pdf"] })],
			files: [
				{ path: "R/att/a.pdf", inAttachments: true },
				{ path: "R/att/a.epub", inAttachments: true },
			],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.repairs, [{ note: "R/a.md", file: "R/att/a.epub", legacy: "[[a.pdf]]" }]);
});

test("stale items: watched statuses only, from the later of last change and date added", () => {
	const old = NOW - 400 * DAY;
	const r = checkHealth(
		{
			notes: [
				note("R/a.md", book("a", { status: "reading" }), { modified: old }),
				note("R/b.md", book("b", { status: "processed" }), { modified: old }),
				note("R/c.md", book("c", { status: "reading", added: "2026-10-01" }), { modified: old }),
				note("R/d.md", book("d", { status: "reading" }), { modified: NOW - 10 * DAY }),
			],
			files: [],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.stale, [{ path: "R/a.md", status: "reading", days: 400 }]);
	assert.deepEqual(checkHealth({ notes: [note("R/a.md", book("a", { status: "reading" }), { modified: old })], files: [], duplicates: [] }, { ...options, staleDays: 0 }).stale, []);
	assert.equal(checkHealth({ notes: [note("R/b.md", book("b", { status: "processed" }), { modified: old })], files: [], duplicates: [] }, { ...options, staleStatuses: [] }).stale.length, 1);
});

test("type checks: missing, unknown, and fields the type needs", () => {
	const r = checkHealth(
		{
			notes: [
				note("R/a.md", { citekey: "a", title: "T" }),
				note("R/b.md", { citekey: "b", title: "T", type: "podcast" }),
				note("R/c.md", { citekey: "c", title: "T", type: "book", authors: ["A B"] }),
			],
			files: [],
			duplicates: [],
		},
		options
	);
	assert.deepEqual(r.missingType, ["R/a.md"]);
	assert.deepEqual(r.unknownType, [{ path: "R/b.md", type: "podcast" }]);
	assert.deepEqual(r.missingFields, [{ path: "R/c.md", type: "book", fields: ["published or year", "publisher"] }]);
});

test("dateMs reads YYYY-MM-DD, with or without a time", () => {
	assert.equal(dateMs("2026-11-09"), NOW);
	assert.equal(dateMs("2026-11-09 1405"), NOW);
	assert.equal(dateMs("soon"), undefined);
});

test("pathLink links by full path and shows the name", () => {
	assert.equal(pathLink("References/smith2020.md"), "[[References/smith2020|smith2020]]");
	assert.equal(pathLink("top.md"), "[[top]]");
	assert.equal(pathLink("R/att/a.pdf"), "[[R/att/a.pdf|a.pdf]]");
});

const ctx = {
	date: "2026-11-09 1405",
	staleDays: 365,
	commands: { check: "Stacks: Check library health", relink: "Stacks: Repair attachment links", review: "Stacks: Review duplicates", mergeCurrent: "Stacks: Merge current" },
	properties: DEFAULT_PROPERTY_NAMES,
	legacyPdfProperty: "pdf",
};

test("the report lists each problem with a link and names the commands that fix them", () => {
	const r = checkHealth(
		{
			notes: [note("R/a.md", book("a", { pdf: "[[x.pdf]]" }), { legacyPdf: "[[x.pdf]]", attachments: [{ value: "[[x.pdf]]" }] }), note("R/b.md", book("b"))],
			files: [{ path: "R/att/a.pdf", inAttachments: true }],
			duplicates: [{ paths: ["R/a.md", "R/b.md"], pairs: [{ a: "R/a.md", b: "R/b.md", reasons: [{ kind: "doi", value: "10.1000/x" }] }] }],
		},
		options
	);
	const md = healthReportMarkdown(r, ctx);
	assert.match(md, /^# Library health check\n/);
	assert.match(md, /\| Links in attachments that don't resolve \| 1 \|/);
	assert.match(md, /\| Notes with the old pdf property \| 1 \|/);
	assert.match(md, /- \[\[R\/a\|a\]\]: `\[\[x\.pdf\]\]`\. Found \[\[R\/att\/a\.pdf\|a\.pdf\]\]/);
	assert.match(md, /Run \*\*Stacks: Repair attachment links\*\* to point these/);
	assert.match(md, /Run \*\*Stacks: Repair attachment links\*\* to move each into attachments and remove pdf\./);
	assert.match(md, /- \[\[R\/a\|a\]\] and \[\[R\/b\|b\]\]: same DOI 10\.1000\/x/);
	assert.match(md, /\*\*Stacks: Review duplicates\*\*/);
	assert.doesNotMatch(md, /Nothing to fix/);
});
