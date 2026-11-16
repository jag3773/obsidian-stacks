// Runs on desktop, emulated mobile and Android: data.json changed outside Obsidian (a sync
// service, git, an edit by hand) is taken up by the running plugin, and its next save doesn't
// write the old settings back over it.
import { browser, expect } from "@wdio/globals";
import { beforeEach, describe, it } from "mocha";
import { diskRead, getSetting, resetLibrary, setSettings, syncWrite } from "../../helpers/stacks";

/** data.json's path in the vault: Obsidian's config folder, then the plugin's folder. */
const dataPath = () => browser.executeObsidian(({ app }) => `${(app as any).plugins.plugins.stacks.manifest.dir}/data.json`);
const onDisk = async (): Promise<Record<string, unknown>> => JSON.parse(new TextDecoder().decode(await diskRead(await dataPath())));

describe("Settings changed outside Obsidian", function () {
	beforeEach(async function () {
		await resetLibrary();
		await setSettings({ libraryBase: "Library.base", defaultStatus: "queued" });
	});

	it("takes data.json as changed on disk, and doesn't save the old settings over it", async function () {
		const path = await dataPath();
		const data = await onDisk();
		expect(data.libraryBase).toBe("Library.base");

		// A sync client writes a changed data.json, as from another device.
		await syncWrite(path, JSON.stringify({ ...data, libraryBase: "Stacks.base", defaultStatus: "reading" }, null, 2));
		await browser.waitUntil(async () => (await getSetting("defaultStatus")) === "reading", { timeout: 20000, timeoutMsg: "the change on disk wasn't taken up" });
		expect(await getSetting("libraryBase")).toBe("Stacks.base");

		// Any later save writes the new values, not the ones the plugin started with.
		await setSettings({ clipStatus: "shelved" });
		expect(await onDisk()).toMatchObject({ libraryBase: "Stacks.base", defaultStatus: "reading", clipStatus: "shelved" });
	});

	it("ignores a data.json that isn't valid JSON, keeping the current settings", async function () {
		const path = await dataPath();
		await syncWrite(path, '{"libraryBase": "Sta');
		await browser.pause(3000);
		expect(await getSetting("libraryBase")).toBe("Library.base");
		expect(await getSetting("defaultStatus")).toBe("queued");
		// And a later save writes them back whole.
		await setSettings({ clipStatus: "shelved" });
		expect(await onDisk()).toMatchObject({ libraryBase: "Library.base", defaultStatus: "queued" });
	});
});
