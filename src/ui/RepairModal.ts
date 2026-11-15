import { App, Modal, Setting } from "obsidian";
import { AttachmentRepair } from "../health";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Preview of attachment repairs, each with a toggle. Nothing changes until Repair is chosen. */
export class RepairModal extends Modal {
	private chosen: Set<AttachmentRepair>;

	constructor(
		app: App,
		private repairs: AttachmentRepair[],
		private attachmentsProperty: string,
		private legacyProperty: string,
		private onApply: (chosen: AttachmentRepair[]) => void
	) {
		super(app);
		this.chosen = new Set(repairs);
	}

	/** One line saying what the repair changes. */
	private describe(r: AttachmentRepair): string {
		const parts: string[] = [];
		if (r.legacy !== undefined && r.legacy !== r.previous) parts.push(`${this.legacyProperty} ${r.legacy}  →  ${this.attachmentsProperty}`);
		if (r.file !== undefined) {
			const from = r.previous !== undefined ? `${r.previous} (not found)` : "(nothing)";
			parts.push(`${r.legacy !== undefined && r.legacy === r.previous ? `${this.legacyProperty} ` : ""}${from}  →  ${r.file}`);
		}
		return parts.join("; ");
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Repair attachment links");
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: `Each note's ${this.attachmentsProperty} will link the file shown, in place of a link that doesn't resolve. A ${this.legacyProperty} property is moved into ${this.attachmentsProperty} and removed. Note bodies aren't touched. Untick any you don't want.`,
		});
		for (const r of this.repairs) {
			new Setting(contentEl)
				.setName(nameOf(r.note).replace(/\.md$/, ""))
				.setDesc(this.describe(r))
				.addToggle((t) =>
					t.setValue(true).onChange((on) => {
						if (on) this.chosen.add(r);
						else this.chosen.delete(r);
					})
				);
		}
		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Repair")
					.setCta()
					.onClick(() => {
						this.close();
						this.onApply(this.repairs.filter((r) => this.chosen.has(r)));
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
