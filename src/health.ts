/**
 * Pure module: the library health check. Takes what the vault layer read (notes, their
 * frontmatter or parse error, which links resolve, the files) and returns the problems, plus
 * the repairs that can be offered. Writes nothing. docs/maintenance.md is the user-facing
 * version.
 */
import { extensionOf } from "./attachments";
import { CSL_TYPES, missingFields, noteToCsl } from "./citation";
import { DuplicateGroup, describeReason } from "./duplicates";
import { PropertyKey } from "./properties";
import { asText } from "./text";

type Fm = Record<string, unknown>;

const DAY_MS = 86_400_000;

export interface HealthNote {
	path: string;
	basename: string;
	/** Null when the note's frontmatter doesn't parse. */
	frontmatter: Fm | null;
	parseError?: string;
	/** The filename (without extension) the note's citekey gives under the filename format. */
	expectedBasename?: string;
	/**
	 * The note's attachments as written, and the file each resolves to (undefined when it
	 * doesn't). The property earlier versions kept the PDF in comes first when set.
	 */
	attachments: { value: string; resolvesTo?: string }[];
	/** The value of that earlier PDF property, when the note still has it. */
	legacyPdf?: string;
	/** File names, without extension, a file named after this note's citekey would have ("key"). */
	attachmentNames: string[];
	/** Paths of files the note links to (properties and body). */
	linked: string[];
	/** Last modification time, ms. */
	modified: number;
}

export interface HealthOptions {
	properties: Record<PropertyKey, string>;
	/** Report items unchanged for longer than this many days; 0 turns the check off. */
	staleDays: number;
	/** Statuses the stale check watches; empty watches every status. */
	staleStatuses: string[];
	now: number;
}

export interface HealthInput {
	notes: HealthNote[];
	/** Every file in the vault that isn't a note, and whether it is in the attachments folder. */
	files: { path: string; inAttachments: boolean }[];
	duplicates: DuplicateGroup[];
}

/**
 * A change to one note's attachments: link `file`, in place of the broken value `previous`
 * when given; and when `legacy` is given, move that value of the earlier PDF property into
 * the attachments list and remove the property.
 */
export interface AttachmentRepair {
	note: string;
	file?: string;
	previous?: string;
	legacy?: string;
}

export interface HealthReport {
	checked: number;
	brokenFrontmatter: { path: string; error: string }[];
	missingCitekey: string[];
	duplicateCitekeys: { citekey: string; paths: string[] }[];
	filenameMismatch: { path: string; citekey: string; expected: string }[];
	unresolvedAttachments: { path: string; value: string; candidate?: string }[];
	orphanAttachments: { path: string; candidateNote?: string }[];
	legacyPdf: { path: string; value: string }[];
	stale: { path: string; status: string; days: number }[];
	missingType: string[];
	unknownType: { path: string; type: string }[];
	missingFields: { path: string; type: string; fields: string[] }[];
	duplicates: DuplicateGroup[];
	repairs: AttachmentRepair[];
}

const text = (v: unknown) => (Array.isArray(v) ? asText(v[0]) : asText(v)).trim();
const byPath = <T extends { path: string }>(a: T, b: T) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** A date property (YYYY-MM-DD, with or without a time) as local ms, or undefined. */
export function dateMs(v: unknown): number | undefined {
	if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.getTime();
	const m = text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return undefined;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return isNaN(d.getTime()) ? undefined : d.getTime();
}

/** Run every check. Deterministic for the same input. */
export function checkHealth(input: HealthInput, o: HealthOptions): HealthReport {
	const p = o.properties;
	const r: HealthReport = {
		checked: input.notes.length,
		brokenFrontmatter: [],
		missingCitekey: [],
		duplicateCitekeys: [],
		filenameMismatch: [],
		unresolvedAttachments: [],
		orphanAttachments: [],
		legacyPdf: [],
		stale: [],
		missingType: [],
		unknownType: [],
		missingFields: [],
		duplicates: input.duplicates,
		repairs: [],
	};
	const notes = [...input.notes].sort(byPath);
	const keys = new Map<string, { citekey: string; paths: string[] }>();
	const watched = new Set(o.staleStatuses.map((s) => s.trim()).filter(Boolean));

	// Files by lower-case file name, for finding one named after a citekey.
	const filesByName = new Map<string, { path: string; inAttachments: boolean }[]>();
	for (const f of input.files) {
		const k = fileName(f.path).toLowerCase();
		filesByName.set(k, [...(filesByName.get(k) ?? []), f]);
	}
	/** The one file of this format named after the note, preferring the attachments folder; undefined if none or ambiguous. */
	const candidateFor = (n: HealthNote, ext: string): string | undefined => {
		if (!ext) return undefined;
		const found = [...new Set(n.attachmentNames.map((x) => `${x}.${ext}`.toLowerCase()))].flatMap((x) => filesByName.get(x) ?? []);
		const inAtt = found.filter((f) => f.inAttachments);
		const pool = inAtt.length ? inAtt : found;
		return pool.length === 1 ? pool[0].path : undefined;
	};

	const linked = new Set<string>();
	for (const n of notes) for (const l of n.linked) linked.add(l);

	for (const n of notes) {
		const fm = n.frontmatter;
		if (!fm) {
			r.brokenFrontmatter.push({ path: n.path, error: n.parseError ?? "invalid YAML" });
			continue;
		}
		const citekey = text(fm[p.citekey]);
		if (!citekey) r.missingCitekey.push(n.path);
		else {
			const k = citekey.toLowerCase();
			const entry = keys.get(k) ?? { citekey, paths: [] };
			entry.paths.push(n.path);
			keys.set(k, entry);
			if (n.expectedBasename !== undefined && n.expectedBasename !== n.basename)
				r.filenameMismatch.push({ path: n.path, citekey, expected: n.expectedBasename });
		}

		// The earlier PDF property moves with the note's first repair, or on its own.
		let legacy = n.legacyPdf;
		if (legacy !== undefined) r.legacyPdf.push({ path: n.path, value: legacy });
		const linkedHere = new Set(n.attachments.map((a) => a.resolvesTo).filter((x): x is string => !!x));
		for (const a of n.attachments) {
			if (a.resolvesTo) continue;
			const candidate = citekey ? candidateFor(n, extensionOf(unlinked(a.value))) : undefined;
			r.unresolvedAttachments.push({ path: n.path, value: a.value, candidate });
			if (candidate && !linkedHere.has(candidate)) {
				r.repairs.push({ note: n.path, file: candidate, previous: a.value, legacy });
				linkedHere.add(candidate);
				legacy = undefined;
			}
		}
		if (legacy !== undefined) r.repairs.push({ note: n.path, legacy });

		if (o.staleDays > 0) {
			const status = text(fm[p.status]);
			if (status && (!watched.size || watched.has(status))) {
				// Obsidian doesn't record when a property changed. The last modification is the
				// latest the status can have been set, so this never reports an item too early.
				const since = Math.max(n.modified || 0, dateMs(fm[p.added]) ?? 0);
				const days = since ? Math.floor((o.now - since) / DAY_MS) : 0;
				if (days > o.staleDays) r.stale.push({ path: n.path, status, days });
			}
		}

		const type = text(fm[p.type]);
		if (!type) r.missingType.push(n.path);
		else if (!(type in CSL_TYPES)) r.unknownType.push({ path: n.path, type });
		const item = noteToCsl(fm, p);
		if (item) {
			const missing = missingFields(item);
			if (missing.length) r.missingFields.push({ path: n.path, type: type || "(none)", fields: missing.map((f) => fieldName(f, p)) });
		}
	}

	r.duplicateCitekeys = [...keys.values()].filter((e) => e.paths.length > 1).sort((a, b) => (a.citekey < b.citekey ? -1 : 1));

	// Files in the attachments folder that no reference note links to. One named after the
	// citekey of a note with no file in its format can be linked to that note.
	const repaired = new Set(r.repairs.map((x) => x.file));
	for (const file of input.files.filter((f) => f.inAttachments && !linked.has(f.path)).sort(byPath)) {
		const name = fileName(file.path).toLowerCase();
		const ext = extensionOf(file.path);
		const owners = notes.filter(
			(n) =>
				n.frontmatter &&
				text(n.frontmatter[p.citekey]) &&
				!n.attachments.some((a) => extensionOf(a.resolvesTo ?? unlinked(a.value)) === ext) &&
				n.attachmentNames.some((x) => `${x}.${ext}`.toLowerCase() === name)
		);
		const candidateNote = owners.length === 1 ? owners[0].path : undefined;
		r.orphanAttachments.push({ path: file.path, candidateNote });
		if (candidateNote && !repaired.has(file.path) && candidateFor(owners[0], ext) === file.path) {
			// Fold this note's legacy move into this repair, so the note gets one change.
			const legacyMove = r.repairs.findIndex((x) => x.note === candidateNote && x.legacy !== undefined && !x.file);
			const legacy = legacyMove === -1 ? undefined : r.repairs.splice(legacyMove, 1)[0].legacy;
			r.repairs.push({ note: candidateNote, file: file.path, legacy });
		}
	}
	r.repairs.sort((a, b) => (a.note < b.note ? -1 : a.note > b.note ? 1 : 0));
	return r;
}

/** A link-ish value's link path: no brackets, alias or subpath. */
function unlinked(value: string): string {
	return value.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();
}

/** A CSL field from missingFields as the property a person fills in. */
function fieldName(field: string, p: Record<PropertyKey, string>): string {
	switch (field) {
		case "title":
			return p.title;
		case "author":
			return p.authors;
		case "author or editor":
			return `${p.authors} or ${p.editors}`;
		case "issued":
			return `${p.published} or ${p.year}`;
		case "container-title":
			return p.journal;
		case "publisher":
			return p.publisher;
		case "URL":
			return p.url;
		default:
			return field;
	}
}

/** Number of problems the report lists (duplicates count once per group). */
export function problemCount(r: HealthReport): number {
	return (
		r.brokenFrontmatter.length +
		r.missingCitekey.length +
		r.duplicateCitekeys.length +
		r.filenameMismatch.length +
		r.unresolvedAttachments.length +
		r.orphanAttachments.length +
		r.legacyPdf.length +
		r.stale.length +
		r.missingType.length +
		r.unknownType.length +
		r.missingFields.length +
		r.duplicates.length
	);
}

// ---------------------------------------------------------------- report note

/** A wikilink to a vault path that resolves even when the basename isn't unique. */
export function pathLink(path: string): string {
	const shown = fileName(path).replace(/\.md$/, "");
	const target = path.replace(/\.md$/, "");
	return target === shown ? `[[${target}]]` : `[[${target}|${shown}]]`;
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

export interface ReportContext {
	/** When the check ran, as shown. */
	date: string;
	staleDays: number;
	/** Command names, as shown in the command palette. */
	commands: { check: string; relink: string; review: string; mergeCurrent: string };
	properties: Record<PropertyKey, string>;
	/** The property earlier versions kept a reference's PDF in. */
	legacyPdfProperty: string;
}

/** The report note's Markdown: a summary table, then one section per check with problems. */
export function healthReportMarkdown(r: HealthReport, c: ReportContext): string {
	const p = c.properties;
	const lines: string[] = [];
	const cmd = (name: string) => `**${name}**`;
	lines.push(
		"# Library health check",
		"",
		`Checked ${r.checked} reference notes on ${c.date}. The check only reads your notes; this report is rewritten each time ${cmd(c.commands.check)} runs, so edits here are lost. Repairs are separate commands that show a preview first.`,
		""
	);
	const rows: [string, number][] = [
		["Frontmatter that doesn't parse", r.brokenFrontmatter.length],
		["No citekey", r.missingCitekey.length],
		["Citekeys used by more than one note", r.duplicateCitekeys.length],
		["Filename doesn't match the citekey", r.filenameMismatch.length],
		[`Links in ${p.attachments} that don't resolve`, r.unresolvedAttachments.length],
		["Files in the attachments folder with no note", r.orphanAttachments.length],
		[`Notes with the old ${c.legacyPdfProperty} property`, r.legacyPdf.length],
		["Possible duplicates", r.duplicates.length],
		[`In one status for more than ${c.staleDays} days`, r.stale.length],
		[`No ${p.type}`, r.missingType.length + r.unknownType.length],
		["Missing citation fields", r.missingFields.length],
	];
	lines.push("| Check | Problems |", "|---|---|");
	for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`);
	if (!problemCount(r)) lines.push("", "Nothing to fix.");

	const section = (heading: string, items: string[], note = "") => {
		if (!items.length) return;
		lines.push("", `## ${heading} (${items.length})`, "");
		if (note) lines.push(note, "");
		for (const i of items) lines.push(`- ${i}`);
	};

	section(
		"Frontmatter that doesn't parse",
		r.brokenFrontmatter.map((b) => `${pathLink(b.path)}: ${b.error.split("\n")[0]}`),
		"Obsidian shows these notes without properties, so Stacks can't read them. Open each one in source mode and fix the YAML."
	);
	section("No citekey", r.missingCitekey.map(pathLink), "Run **Complete current reference** on each to give it one.");
	section(
		"Citekeys used by more than one note",
		r.duplicateCitekeys.map((d) => `${code(d.citekey)}: ${d.paths.map(pathLink).join(", ")}`),
		"Citations can only point at one of them. Merge them if they are the same work, or run **Regenerate citekey for current note** on one."
	);
	section(
		"Filename doesn't match the citekey",
		r.filenameMismatch.map((m) => `${pathLink(m.path)}: citekey ${code(m.citekey)}, expected filename ${code(m.expected)}`),
		"Rename the note (links update), or correct the citekey property."
	);
	section(
		`Links in ${p.attachments} that don't resolve`,
		r.unresolvedAttachments.map((u) => `${pathLink(u.path)}: ${code(u.value)}${u.candidate ? `. Found ${pathLink(u.candidate)}` : ""}`),
		r.unresolvedAttachments.some((u) => u.candidate) ? `Run ${cmd(c.commands.relink)} to point these at the file of the same format named after the citekey. You see each change before it is made.` : ""
	);
	section(
		"Files in the attachments folder with no note",
		r.orphanAttachments.map((o) => `${pathLink(o.path)}${o.candidateNote ? `, named like ${pathLink(o.candidateNote)}` : ""}`),
		`No reference note links to these.${r.orphanAttachments.some((o) => o.candidateNote) ? ` ${cmd(c.commands.relink)} can link the ones named after a note's citekey.` : ""}`
	);
	section(
		`Notes with the old ${c.legacyPdfProperty} property`,
		r.legacyPdf.map((l) => `${pathLink(l.path)}: ${code(l.value)}`),
		`Stacks now keeps every file in ${p.attachments} and still reads ${c.legacyPdfProperty} until it is moved. Run ${cmd(c.commands.relink)} to move each into ${p.attachments} and remove ${c.legacyPdfProperty}.`
	);
	section(
		"Possible duplicates",
		r.duplicates.map((g) => g.pairs.map((pair) => `${pathLink(pair.a)} and ${pathLink(pair.b)}: ${pair.reasons.map(describeReason).join("; ")}`).join("; ")),
		`Exact matches only. Run ${cmd(c.commands.review)}, or open one of the notes and run ${cmd(c.commands.mergeCurrent)}. Nothing is merged without a preview.`
	);
	section(
		`In one status for more than ${c.staleDays} days`,
		r.stale.map((s) => `${pathLink(s.path)}: ${code(s.status)} for at least ${s.days} days`),
		"Counted from the note's last change (or its date added, if later), since Obsidian doesn't record when a status was set."
	);
	section(`No ${p.type}`, [...r.missingType.map(pathLink), ...r.unknownType.map((u) => `${pathLink(u.path)}: ${code(u.type)} isn't a known type, exported as a document`)].sort(), "See docs/citation-fields.md for the types.");
	section(
		"Missing citation fields",
		r.missingFields.map((m) => `${pathLink(m.path)} (${m.type}): ${m.fields.join(", ")}`),
		"What a citation of this type needs. See docs/citation-fields.md."
	);
	return lines.join("\n") + "\n";
}
