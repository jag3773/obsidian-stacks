// Runs on desktop, emulated mobile and Android: Check library health writes its report note.
import { browser, expect } from "@wdio/globals";
import { beforeEach, describe, it } from "mocha";
import { pdfWithText } from "../../helpers/pdf";
import { clearNotices, frontmatter, read, resetLibrary, runCommand, waitForFiles, waitForNotice } from "../../helpers/stacks";

const REPORT = "Stacks health check.md";
const pdf = (text: string) => pdfWithText(text).buffer as ArrayBuffer;

/** Problems added to the fixture library, one per check this test looks at. */
const PROBLEMS = {
	// No citekey.
	"References/Untitled draft reference.md": "---\ntype: book\ntitle: A reference without a citekey\nauthors: [Jane Doe]\nyear: 2001\npublisher: Nowhere Press\n---\n",
	// The pdf property earlier versions wrote, with a link that doesn't resolve, and a PDF named
	// after the citekey that the repair command can use.
	"References/turingComputingMachinery1950.md":
		'---\ncitekey: turingComputingMachinery1950\ntype: article\ntitle: Computing Machinery and Intelligence\nauthors: ["[[Alan Turing]]"]\nyear: 1950\njournal: Mind\nvolume: "59"\nissue: "236"\npages: 433-460\npdf: "[[turing-old-name.pdf]]"\n---\n',
	"References/attachments/turingComputingMachinery1950.pdf": pdf("Computing Machinery and Intelligence"),
	// A PDF no note links to.
	"References/attachments/stray scan.pdf": pdf("A stray scan"),
	// An ebook named after a note that has none: the repair links it.
	"References/attachments/hookerLaws1989.epub": "not really an ebook",
};

describe("Check library health", function () {
	beforeEach(async function () {
		await resetLibrary(PROBLEMS);
	});

	it("writes the report note with its marker and the problems found", async function () {
		await runCommand("check-library-health");
		await waitForFiles("", (p) => p.includes(REPORT), "no report note");
		const notice = await waitForNotice(/Stacks: \d+ problems? in 5 notes/);
		expect(notice).toContain("2 notes' attachments can be repaired");

		expect(await frontmatter(REPORT)).toEqual({ stacks: "health-check" });
		const text = await read(REPORT);
		expect(text).toContain("# Library health check");
		expect(text).toContain("Checked 5 reference notes");
		expect(text).toMatch(/## No citekey \(1\)\n[\s\S]*Untitled draft reference/);
		expect(text).toMatch(/## Links in attachments that don't resolve \(1\)\n[\s\S]*turingComputingMachinery1950[\s\S]*turing-old-name\.pdf[\s\S]*Found [^\n]*turingComputingMachinery1950\.pdf/);
		// Unlinked: the ebook, the stray PDF, and the PDF the broken link should point at.
		expect(text).toMatch(/## Files in the attachments folder with no note \(3\)\n[\s\S]*hookerLaws1989\.epub[\s\S]*stray scan\.pdf[\s\S]*turingComputingMachinery1950\.pdf/);
		expect(text).toMatch(/## Notes with the old pdf property \(1\)\n[\s\S]*turingComputingMachinery1950/);
		// The report opens.
		expect(await browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path)).toBe(REPORT);
	});

	it("repairs attachment links after a preview: the old pdf property moved and relinked, the ebook linked", async function () {
		await runCommand("relink-pdfs");
		const modal = browser.$(".modal-container .modal");
		await expect(modal.$(".modal-title")).toHaveText("Repair attachment links");
		// One toggle per repair (the button row has none).
		await expect(modal.$$(".checkbox-container")).toBeElementsArrayOfSize(2);
		await modal.$("button=Repair").click();
		await waitForNotice("Stacks: repaired 2 notes.");
		await browser.waitUntil(async () => (await frontmatter("References/turingComputingMachinery1950.md"))?.pdf === undefined, { timeoutMsg: "pdf property not moved" });
		expect((await frontmatter("References/turingComputingMachinery1950.md"))?.attachments).toEqual(["[[turingComputingMachinery1950.pdf]]"]);
		expect((await frontmatter("References/hookerLaws1989.md"))?.attachments).toEqual(["[[hookerLaws1989.epub]]"]);
	});

	it("rewrites its own report, and never overwrites a note of yours with the same name", async function () {
		await runCommand("check-library-health");
		await waitForFiles("", (p) => p.includes(REPORT), "no report note");
		await clearNotices();
		await runCommand("check-library-health");
		await waitForNotice(/in 5 notes/);
		await browser.pause(1000);
		expect((await waitForFiles("", () => true, "")).filter((p) => p.startsWith("Stacks health check"))).toEqual([REPORT]);

		// A note of the user's that has the report's name stays as it is.
		await resetLibrary({ ...PROBLEMS, [REPORT]: "My own notes about library health.\n" });
		await runCommand("check-library-health");
		await waitForFiles("", (p) => p.includes("Stacks health check 1.md"), "the report wasn't written beside the user's note");
		expect(await read(REPORT)).toBe("My own notes about library health.\n");
		expect(await frontmatter("Stacks health check 1.md")).toEqual({ stacks: "health-check" });
	});
});
