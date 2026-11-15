import { App, TFile } from "obsidian";
import { applyAnnotationBlock, currentAnnotationBlock, headingLevel, parseColorMap, renderAnnotations } from "./annotations";
import { Cancelled, Library } from "./library";
import { readAnnotations } from "./pdf";
import { LibrarySettings } from "./settings";
import { asText, localDate } from "./text";

export interface ExtractSummary {
	note: TFile;
	pdf: TFile;
	count: number;
	/** False when the note already showed exactly these annotations. */
	changed: boolean;
	skipped: number;
	pagesWithoutText: number[];
}

/** Turns a reference's PDF annotations into the annotations block of its note. */
export class Extractor {
	constructor(
		private app: App,
		private library: Library,
		private settings: () => LibrarySettings,
		/** False once the plugin is unloaded; checked before every write. */
		private active: () => boolean = () => true
	) {}

	private assertActive(): void {
		if (!this.active()) throw new Cancelled();
	}

	/** The note's PDF: the first PDF among its attachments. */
	pdfFor(note: TFile): TFile | null {
		return this.library.pdfOf(note);
	}

	/** Reference notes whose attachments link to this PDF, those with it as their PDF first. */
	notesFor(pdf: TFile): TFile[] {
		const notes = this.library.referenceFiles().filter((n) => this.library.attachmentFiles(n).includes(pdf));
		return [...notes.filter((n) => this.pdfFor(n) === pdf), ...notes.filter((n) => this.pdfFor(n) !== pdf)];
	}

	/**
	 * Read the PDF's annotations and write them into the note between the markers; update the
	 * highlight count, the date (when the annotations changed) and optionally the status.
	 * `bytes` stands in for the PDF's current content (e.g. a copy just brought back).
	 * Writes nothing when the note already shows the same annotations.
	 */
	async extract(note: TFile, bytes?: ArrayBuffer): Promise<ExtractSummary> {
		const s = this.settings();
		const pdf = this.pdfFor(note);
		if (!pdf) throw new Error(`${note.basename} has no PDF in its ${this.library.prop("attachments")} property.`);
		const data = bytes ?? (await this.app.vault.readBinary(pdf));
		const result = await readAnnotations(data, pdf.name);
		const block = renderAnnotations(result.annotations, {
			linktext: this.app.metadataCache.fileToLinktext(pdf, note.path, false),
			colors: parseColorMap(s.colorMap).map,
			pageHeadingLevel: (headingLevel(s.annotationsHeading) || 1) + 1,
		});
		const summary: ExtractSummary = {
			note,
			pdf,
			count: result.annotations.length,
			changed: false,
			skipped: result.skipped,
			pagesWithoutText: result.pagesWithoutText,
		};
		const content = await this.app.vault.read(note);
		const current = currentAnnotationBlock(content);
		const fm = this.library.frontmatter(note);
		const countKey = this.library.prop("highlights");
		const sameBlock = current === null ? !block : current === block.trim();
		const sameCount = Number(fm[countKey]) === summary.count || (!summary.count && fm[countKey] === undefined);
		// The status only moves when there is something to review.
		const status = summary.count ? this.statusToSet(fm) : null;
		if (sameBlock && sameCount && !status) return summary;
		if (!this.library.exists(note)) return summary;
		// Reading the PDF can take a while; don't write if the plugin was unloaded meanwhile.
		this.assertActive();
		if (!sameBlock) {
			await this.app.vault.process(note, (c) => applyAnnotationBlock(c, block, s.annotationsHeading));
			summary.changed = true;
		}
		this.assertActive();
		await this.app.fileManager.processFrontMatter(note, (f: Record<string, unknown>) => {
			f[countKey] = summary.count;
			if (!sameBlock) f[this.library.prop("lastHighlighted")] = localDate();
			if (status) f[this.library.prop("status")] = status;
		});
		return summary;
	}

	/** The status-after-extraction, when it moves the note forward in the status list. */
	private statusToSet(fm: Record<string, unknown>): string | null {
		const s = this.settings();
		const target = s.statusAfterExtraction.trim();
		if (!target) return null;
		const current = asText(fm[this.library.prop("status")]).trim();
		if (current === target) return null;
		const ti = s.statuses.indexOf(target);
		const ci = s.statuses.indexOf(current);
		return !current || (ti !== -1 && ci !== -1 && ci < ti) ? target : null;
	}
}

/** One line for a notice: what extraction did. */
export function describeExtraction(r: ExtractSummary): string {
	const parts = [
		!r.count ? `no highlights or comments found in ${r.pdf.name}` : r.changed ? `${r.count} annotation${r.count === 1 ? "" : "s"} written to ${r.note.basename}` : `${r.note.basename} is up to date (${r.count} annotation${r.count === 1 ? "" : "s"})`,
	];
	if (r.pagesWithoutText.length)
		parts.push(`page${r.pagesWithoutText.length === 1 ? "" : "s"} ${r.pagesWithoutText.join(", ")} ha${r.pagesWithoutText.length === 1 ? "s" : "ve"} no text layer (scanned?), so those highlights are embedded as page images`);
	if (r.skipped) parts.push(`${r.skipped} other annotation${r.skipped === 1 ? "" : "s"} (drawings, shapes, or replies to them) skipped`);
	return parts.join("; ") + ".";
}
