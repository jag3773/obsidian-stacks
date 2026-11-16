// Create library base, then open it in Obsidian's Bases and read what each view selects.
// Desktop, Obsidian 1.10 and later (see wdio.conf.mts).
//
// What this proves: Obsidian parses the generated .base, evaluates every view's filters,
// including note[...].isEmpty() on notes that lack the property, have an empty list or an
// empty string, without an error, and the views select exactly the expected notes. Rows are
// read from the Bases query controller's results (the internal API behind the table) and
// cross-checked against the rendered table and its result count. The table only draws the
// rows that fit in the window (CI tiles two Obsidian windows side by side), so it is scrolled
// through and every row it draws is collected.
import { browser, expect } from "@wdio/globals";
import { beforeEach, describe, it } from "mocha";
import { frontmatter, getSetting, read, renameInVault, resetLibrary, runCommand, setSettings, waitForFiles, waitForNotice } from "../../helpers/stacks";

interface ViewResult {
	error: string | null;
	errorText: string;
	files: string[];
	count: string;
	/** The text of each table row, once each, in the order drawn. */
	rendered: string[];
	/** By row title (the first cell): the link target in the second cell (the File column), or "". */
	secondCellLinks: Record<string, string>;
}

/** Open a view of a base in the active tab and read what it shows once its query has run. */
async function openView(file: string, viewName: string): Promise<ViewResult> {
	return browser.executeObsidian(
		async ({ app }, path, name) => {
			const leaf = app.workspace.getLeaf(false);
			await leaf.setViewState({ type: "bases", state: { file: path, viewName: name } });
			const view = leaf.view as any;
			if (view.getViewType() !== "bases") throw new Error(`opened a ${view.getViewType()} view`);
			const c = view.controller;
			// Wait for the query to run and the table to render.
			for (let i = 0; i < 100 && (c.viewName !== name || !view.containerEl.querySelector(".bases-toolbar-result-count")?.textContent); i++)
				await new Promise((r) => setTimeout(r, 100));
			await new Promise((r) => setTimeout(r, 500));
			const el = view.containerEl as HTMLElement;
			// Every row, scrolling the table's scroller from top to bottom: rows off screen aren't drawn.
			const rows = new Map<string, { text: string; link: string }>();
			const collect = () => {
				for (const row of Array.from(el.querySelectorAll(".bases-tbody .bases-tr"))) {
					const cells = Array.from(row.querySelectorAll(".bases-td"));
					const title = cells[0]?.textContent?.trim() ?? "";
					// Bases renders links as <span class="internal-link" data-href>, in older versions as <a href>.
					const link = cells[1]?.querySelector(".internal-link");
					rows.set(title, { text: row.textContent ?? "", link: link?.getAttribute("data-href") ?? link?.getAttribute("href") ?? "" });
				}
			};
			let scroller = el.querySelector(".bases-tbody") as HTMLElement | null;
			while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
			collect();
			for (let i = 0; scroller && i < 50; i++) {
				const before = scroller.scrollTop;
				scroller.scrollTop = before + Math.max(50, scroller.clientHeight * 0.7);
				await new Promise((r) => setTimeout(r, 150));
				collect();
				if (scroller.scrollTop === before) break;
			}
			if (scroller) scroller.scrollTop = 0;
			return {
				error: c.error ? String(c.error) : null,
				errorText: Array.from(el.querySelectorAll(".bases-error")).map((e) => e.textContent ?? "").join(""),
				files: Array.from((c.results as Map<{ path: string }, unknown>).keys()).map((f) => f.path).sort(),
				count: el.querySelector(".bases-toolbar-result-count")?.textContent ?? "",
				rendered: [...rows.values()].map((r) => r.text),
				secondCellLinks: Object.fromEntries([...rows].map(([title, r]) => [title, r.link])),
			};
		},
		file,
		viewName
	);
}

const EDGE_CASES = {
	// An empty collections list and an empty attachments string count as empty too.
	"References/dijkstraGoToStatement1968.md":
		'---\ncitekey: dijkstraGoToStatement1968\ntype: article\ntitle: Go To Statement Considered Harmful\nauthors:\n  - "[[Edsger W. Dijkstra]]"\nyear: 1968\njournal: Communications of the ACM\ncollections: []\nattachments: ""\nstatus: queued\n---\n',
	// An ebook (a preferred format) after a broken link: not missing a file; the ebook is the main file.
	"References/knuthArtComputerProgramming1968.md":
		'---\ncitekey: knuthArtComputerProgramming1968\ntype: book\ntitle: The Art of Computer Programming\nauthors:\n  - "[[Donald Knuth]]"\nyear: 1968\npublisher: Addison-Wesley\ncollections: ["[[Strategy]]"]\nattachments:\n  - "[[gone.pdf]]"\n  - "[[knuthArtComputerProgramming1968.EPUB]]"\nstatus: shelved\n---\n',
	"References/attachments/knuthArtComputerProgramming1968.EPUB": "not really an ebook",
	// Only a download in no preferred format: missing a file, though the column still links it.
	"References/shannonMathematicalTheory1948.md":
		'---\ncitekey: shannonMathematicalTheory1948\ntype: article\ntitle: A Mathematical Theory of Communication\nauthors:\n  - "[[Claude Shannon]]"\nyear: 1948\njournal: Bell System Technical Journal\ncollections: ["[[Strategy]]"]\nattachments:\n  - "[[shannon-figures.zip]]"\nstatus: shelved\n---\n',
	"References/attachments/shannon-figures.zip": "zip",
	// Only the pdf property earlier versions wrote: not missing a file; that PDF is the main file.
	"References/hopperCompilers1952.md":
		'---\ncitekey: hopperCompilers1952\ntype: report\ntitle: The Education of a Computer\nauthors:\n  - "[[Grace Hopper]]"\nyear: 1952\ncollections: ["[[Strategy]]"]\npdf: "[[hopper-scan.pdf]]"\nstatus: shelved\n---\n',
	"References/attachments/hopper-scan.pdf": "%PDF",
	// The old pdf property names the main PDF; attachments lists a supplement first. Stacks
	// reads the pdf property first, and so must the base.
	"References/lamportTimeClocks1978.md":
		'---\ncitekey: lamportTimeClocks1978\ntype: article\ntitle: Time, Clocks, and the Ordering of Events\nauthors:\n  - "[[Leslie Lamport]]"\nyear: 1978\ncollections: ["[[Strategy]]"]\npdf: "[[lamport-paper.pdf]]"\nattachments:\n  - "[[lamport-errata.pdf]]"\n  - "[[lamport-paper.pdf]]"\nstatus: shelved\n---\n',
	"References/attachments/lamport-paper.pdf": "%PDF",
	"References/attachments/lamport-errata.pdf": "%PDF",
	// Not a reference (no citekey): never in the library base.
	"References/Reading notes.md": "---\ntitle: Notes about my reading\n---\nJust notes.\n",
};

describe("Library base in Bases", function () {
	beforeEach(async function () {
		await resetLibrary(EDGE_CASES);
	});

	it("is created next to an existing base without overwriting anything, and becomes the library base", async function () {
		const existing = await read("Reading list.base");
		await runCommand("create-library-base");
		await waitForNotice("Stacks: created Stacks.base.");
		await waitForFiles("", (p) => p.includes("Stacks.base"), "no Stacks.base");
		expect(await read("Reading list.base")).toBe(existing);
		expect(await getSetting("libraryBase")).toBe("Stacks.base");

		// A second run picks a free name.
		await runCommand("create-library-base");
		await waitForNotice("Stacks: created Stacks 1.base.");
		expect(await getSetting("libraryBase")).toBe("Stacks.base");
	});

	it("follows the library base when it, or its folder, is renamed or moved in Obsidian", async function () {
		// A base from an earlier version, still named Library.base.
		await resetLibrary({ "Library.base": "views:\n  - type: table\n    name: Library\n" });
		await setSettings({ libraryBase: "Library.base" });
		const follows = async (path: string, what: string) =>
			browser.waitUntil(async () => (await getSetting("libraryBase")) === path, { timeoutMsg: `the setting didn't follow ${what}: ${await getSetting("libraryBase")}` });
		await renameInVault("Library.base", "Stacks.base");
		await follows("Stacks.base", "the rename");
		await renameInVault("Stacks.base", "Bases/Stacks.base");
		await follows("Bases/Stacks.base", "the move");
		// Obsidian fires a rename for each file in a renamed folder.
		await renameInVault("Bases", "Library bases");
		await follows("Library bases/Stacks.base", "its folder's rename");
		// Another base's rename leaves it alone.
		await renameInVault("Reading list.base", "Reading.base");
		await browser.pause(300);
		expect(await getSetting("libraryBase")).toBe("Library bases/Stacks.base");
	});

	it("evaluates every view, including Unfiled and Missing file, without errors", async function () {
		await runCommand("create-library-base");
		await waitForFiles("", (p) => p.includes("Stacks.base"), "no Stacks.base");

		const all = [
			"References/dijkstraGoToStatement1968.md",
			"References/hookerLaws1989.md",
			"References/hopperCompilers1952.md",
			"References/knuthArtComputerProgramming1968.md",
			"References/lamportTimeClocks1978.md",
			"References/liskovProgrammingAbstractData1974.md",
			"References/porterCreatingSharedValue2011.md",
			"References/shannonMathematicalTheory1948.md",
		];
		const expected: Record<string, string[]> = {
			Library: all,
			Queued: ["References/dijkstraGoToStatement1968.md", "References/hookerLaws1989.md"],
			Reading: ["References/porterCreatingSharedValue2011.md"],
			Reviewing: [],
			Processed: ["References/liskovProgrammingAbstractData1974.md"],
			Shelved: [
				"References/hopperCompilers1952.md",
				"References/knuthArtComputerProgramming1968.md",
				"References/lamportTimeClocks1978.md",
				"References/shannonMathematicalTheory1948.md",
			],
			// No collections property (Hooker), or an empty list (Dijkstra).
			Unfiled: ["References/dijkstraGoToStatement1968.md", "References/hookerLaws1989.md"],
			// No attachments (Hooker, Liskov), an empty string (Dijkstra), or only a file in no
			// preferred format (Shannon). Porter has a PDF, Knuth an ebook, Hopper and Lamport a PDF
			// in the old pdf property.
			"Missing file": [
				"References/dijkstraGoToStatement1968.md",
				"References/hookerLaws1989.md",
				"References/liskovProgrammingAbstractData1974.md",
				"References/shannonMathematicalTheory1948.md",
			],
		};
		const names = await browser.executeObsidian(({ app }) => {
			const view = app.workspace.getMostRecentLeaf()!.view as any;
			return view.controller.getQueryViewNames() as string[];
		});
		expect(names).toEqual(Object.keys(expected));

		const titles = Object.fromEntries(
			await Promise.all(all.map(async (p) => [p, String((await frontmatter(p))?.title)] as const))
		);
		for (const [view, files] of Object.entries(expected)) {
			const r = await openView("Stacks.base", view);
			expect({ view, error: r.error, errorText: r.errorText }).toEqual({ view, error: null, errorText: "" });
			expect({ view, files: r.files }).toEqual({ view, files });
			expect({ view, count: r.count }).toEqual({ view, count: `${files.length} ${files.length === 1 ? "result" : "results"}` });
			// The table shows the same rows, each with the title the base's name formula gives it.
			expect({ view, rows: r.rendered.length }).toEqual({ view, rows: files.length });
			for (const f of files) expect({ view, title: titles[f], shown: r.rendered.some((row) => row.includes(titles[f])) }).toEqual({ view, title: titles[f], shown: true });
		}
	});

	it("links each reference's main file in the File column", async function () {
		await runCommand("create-library-base");
		await waitForFiles("", (p) => p.includes("Stacks.base"), "no Stacks.base");
		const links = (await openView("Stacks.base", "Library")).secondCellLinks;
		expect(links).toEqual({
			"Creating Shared Value": "References/attachments/porterCreatingSharedValue2011.pdf",
			"The Art of Computer Programming": "References/attachments/knuthArtComputerProgramming1968.EPUB",
			"A Mathematical Theory of Communication": "References/attachments/shannon-figures.zip",
			"The Education of a Computer": "References/attachments/hopper-scan.pdf",
			"Time, Clocks, and the Ordering of Events": "References/attachments/lamport-paper.pdf",
			"Go To Statement Considered Harmful": "",
			"Of the Laws of Ecclesiastical Polity": "",
			"Programming with Abstract Data Types": "",
		});
	});

	it("lists a Stacks batch view's rows and opens the batch preview for exactly those", async function () {
		await resetLibrary({
			...EDGE_CASES,
			"Queue.base":
				'filters:\n  and:\n    - file.inFolder("References")\n    - file.hasProperty("citekey")\nviews:\n  - type: stacks-batch\n    name: Queued\n    filters: note["status"] == "queued"\n',
		});
		const r = await openView("Queue.base", "Queued");
		expect(r.error).toBeNull();
		expect(r.files).toEqual(["References/dijkstraGoToStatement1968.md", "References/hookerLaws1989.md"]);
		const view = browser.$(".workspace-leaf.mod-active .stacks-batch-view-header");
		await expect(view).toHaveText(expect.stringContaining("2 notes in this view"));
		await view.$("button=Batch edit…").click();
		const modal = browser.$(".modal-container .modal");
		await browser.waitUntil(async () => (await modal.getText()).includes("2 in this Base view: 2 notes."), { timeoutMsg: "batch preview didn't open for the view's rows" });
	});
});
