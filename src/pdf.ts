import { App, TFile, loadPdfJs } from "obsidian";
import { ExtractResult, PdfDocumentLike, PdfOps, collectAnnotations } from "./annotations";
import { PdfLine } from "./pdfFront";

/** The parts of PDF.js (Obsidian's loadPdfJs) this plugin uses. */
interface PdfDocument extends PdfDocumentLike {
	getMetadata(): Promise<{ info?: unknown } | null>;
	destroy(): Promise<void>;
}
interface PdfJs {
	getDocument(src: { data: Uint8Array; isEvalSupported: boolean; enableScripting: boolean; verbosity?: number }): { promise: Promise<PdfDocument> };
	OPS: PdfOps;
}
const loadPdf = async (): Promise<PdfJs> => (await loadPdfJs()) as PdfJs;

export interface PdfInfo {
	text: string;
	title?: string;
	author?: string;
	/** The first page's lines, with their font sizes. */
	lines: PdfLine[];
	creator?: string;
	/** /CreationDate as written. */
	created?: string;
}

interface TextItem {
	str?: string;
	hasEOL?: boolean;
	transform?: number[];
}

/** A page's text items as lines: PDF.js marks each line's end (hasEOL). */
export function pageLines(items: unknown[]): PdfLine[] {
	const lines: PdfLine[] = [];
	let cur: PdfLine = { text: "", size: 0, y: 0 };
	const end = () => {
		cur.text = cur.text.replace(/\s+/g, " ").trim();
		if (cur.text) lines.push(cur);
		cur = { text: "", size: 0, y: 0 };
	};
	for (const raw of items) {
		const it = raw as TextItem;
		if (typeof it.str !== "string") continue;
		if (it.str.trim()) {
			const [a = 0, b = 0, , d = 0, , y = 0] = it.transform ?? [];
			const size = Math.abs(d) || Math.hypot(a, b);
			if (!cur.text.trim()) cur.y = y;
			cur.size = Math.max(cur.size, size);
		}
		cur.text += it.str;
		if (it.hasEOL) end();
	}
	end();
	return lines;
}

/** Read the opening pages and document metadata with Obsidian's bundled PDF.js. */
export async function readPdf(app: App, file: TFile, pages = 3): Promise<PdfInfo> {
	const pdfjs = await loadPdf();
	const data = await app.vault.readBinary(file);
	// PDFs in the inbox may come from anywhere: disable eval-based font rendering (CVE-2024-4367)
	// and scripting.
	const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, enableScripting: false }).promise;
	try {
		const parts: string[] = [];
		let lines: PdfLine[] = [];
		for (let i = 1; i <= Math.min(pages, doc.numPages); i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			parts.push(content.items.map((it) => (it as { str?: string }).str ?? "").join(" "));
			if (i === 1) lines = pageLines(content.items);
		}
		const meta = await doc.getMetadata().catch(() => null);
		const info = (meta?.info ?? {}) as { Title?: string; Author?: string; Creator?: string; CreationDate?: string };
		const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
		return { text: parts.join("\n"), title: str(info.Title), author: str(info.Author), lines, creator: str(info.Creator), created: str(info.CreationDate) };
	} finally {
		await doc.destroy();
	}
}

/** A PDF the extractor can't read, with a reason fit to show the user. */
export class PdfReadError extends Error {
	constructor(
		message: string,
		public reason: "encrypted" | "unreadable"
	) {
		super(message);
		this.name = "PdfReadError";
	}
}

/** Open PDF bytes with PDF.js; turns PDF.js's exceptions into PdfReadError. */
export async function openPdf(pdfjs: PdfJs, data: ArrayBuffer | Uint8Array, name: string): Promise<PdfDocument> {
	try {
		// Copy: PDF.js transfers the buffer to its worker.
		const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
		return await pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableScripting: false, verbosity: 0 }).promise;
	} catch (e) {
		const n = (e as { name?: string })?.name;
		if (n === "PasswordException") throw new PdfReadError(`${name} is password-protected; remove the password to extract annotations.`, "encrypted");
		throw new PdfReadError(`${name} couldn't be read as a PDF (${e instanceof Error ? e.message : String(e)}).`, "unreadable");
	}
}

/** Read the annotations of a PDF with Obsidian's bundled PDF.js. */
export async function readAnnotations(data: ArrayBuffer | Uint8Array, name: string): Promise<ExtractResult> {
	const pdfjs = await loadPdf();
	const doc = await openPdf(pdfjs, data, name);
	try {
		return await collectAnnotations(doc, pdfjs.OPS);
	} finally {
		await doc.destroy();
	}
}
