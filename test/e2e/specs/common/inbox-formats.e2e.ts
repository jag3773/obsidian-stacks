// Runs on desktop, emulated mobile and Android: an EPUB, a Kindle book and a Word document
// dropped in the inbox are read by Obsidian itself (ZIP entries are inflated by the platform's
// DecompressionStream), identified, filed and linked.
import { browser, expect } from "@wdio/globals";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "mocha";
import { frontmatter, resetLibrary, stubLog, syncWrite, waitForFiles } from "../../helpers/stacks";

const fixture = (name: string) => new Uint8Array(readFileSync(`test/fixtures/formats/${name}`));

/** Reference notes by title, with their properties, once `count` new ones exist. */
async function filedByTitle(before: string[], count: number): Promise<Record<string, Record<string, unknown>>> {
	const refs = await waitForFiles("References", (p) => p.filter((x) => x.endsWith(".md") && !before.includes(x)).length >= count, "not everything was filed", 30000);
	const out: Record<string, Record<string, unknown>> = {};
	for (const path of refs.filter((x) => x.endsWith(".md") && !before.includes(x))) {
		const fm = (await frontmatter(path)) ?? {};
		out[String(fm.title)] = { ...fm, path };
	}
	return out;
}

describe("Ebooks and documents in the inbox", function () {
	beforeEach(async function () {
		await resetLibrary();
	});

	it("files an EPUB, a Kindle book and a Word document, each with its own metadata or lookup", async function () {
		const before = await waitForFiles("References", () => true, "");
		await syncWrite("Inbox/orchard.kepub.epub", fixture("orchard.epub"));
		await syncWrite("Inbox/B0HARBOUR.azw3", fixture("harbour-lights.azw3"));
		await syncWrite("Inbox/report final.docx", fixture("water-report.docx"));
		const filed = await filedByTitle(before, 3);

		// No lookup knows the EPUB's ISBN: it is described from its own package metadata.
		expect(filed["The Quiet Orchard"]).toMatchObject({
			type: "book",
			isbn: "9780306406157",
			publisher: "Fieldstone Press",
			published: "2019-04-02",
			authors: ["[[Miriam Okafor]]", "[[Tomás Reyes]]"],
			attachments: ["[[okaforQuietOrchard2019.epub]]"],
		});
		// The Kindle book's EXTH header.
		expect(filed["Harbour Lights"]).toMatchObject({ type: "book", isbn: "9781841953021", publisher: "Tidewater & Sons", year: 2015 });
		expect(String((filed["Harbour Lights"].attachments as string[])[0])).toMatch(/\.azw3\]\]$/);
		// The Word document's DOI, looked up through the stub.
		expect(filed["Water Points in the Upper Valley"]).toMatchObject({ doi: "10.1234/e2e.water", year: 2024 });
		expect(String((filed["Water Points in the Upper Valley"].attachments as string[])[0])).toMatch(/\.docx\]\]$/);

		await waitForFiles("Inbox", (p) => p.filter((x) => !x.endsWith(".gitkeep")).length === 0, "something stayed in the inbox");
		const log = await stubLog();
		expect(log.requests.some((u) => u.includes("9780306406157"))).toBe(true);
		expect(log.requests.some((u) => u.startsWith("https://api.crossref.org/works/10.1234%2Fe2e.water"))).toBe(true);
		await browser.pause(0);
	});
});
