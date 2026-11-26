// Copy ../docs/*.md into the Starlight content folder so the repo's docs stay the
// single source. Each page's leading "# Title" becomes frontmatter, links between
// docs become site URLs, and links that leave docs/ point to the file on GitHub.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..", "..", "docs");
const outDir = join(here, "..", "src", "content", "docs", "docs");
const repoBlob = "https://github.com/jag3773/obsidian-stacks/blob/main/";

function firstParagraph(body) {
	for (const block of body.split(/\n\s*\n/)) {
		const text = block.trim();
		if (!text || /^(#|\||```|<|>|-|\d+\.)/.test(text)) continue;
		const plain = text
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/[*_`]/g, "")
			.replace(/\s+/g, " ");
		return plain.length > 180 ? plain.slice(0, 177).replace(/\s+\S*$/, "") + "…" : plain;
	}
	return undefined;
}

function rewriteLinks(body) {
	return body.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
		if (/^(https?:|mailto:|#)/.test(target)) return match;
		if (target.startsWith("../")) return `](${repoBlob}${target.slice(3)})`;
		const m = target.match(/^([\w-]+)\.md(#.*)?$/);
		if (m) return `](../${m[1]}/${m[2] ?? ""})`;
		return match;
	});
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const files = (await readdir(docsDir)).filter((f) => f.endsWith(".md"));
for (const file of files) {
	const src = await readFile(join(docsDir, file), "utf8");
	const m = src.match(/^#\s+(.+)\n/);
	if (!m) throw new Error(`${file}: expected a leading "# Title" line`);
	const title = m[1].trim();
	const body = rewriteLinks(src.slice(m[0].length).replace(/^\s+/, ""));
	const description = firstParagraph(body);
	const front = [
		"---",
		`title: ${JSON.stringify(title)}`,
		...(description ? [`description: ${JSON.stringify(description)}`] : []),
		`editUrl: ${JSON.stringify(repoBlob.replace("/blob/", "/edit/") + "docs/" + file)}`,
		"---",
		"",
	].join("\n");
	await writeFile(join(outDir, file), front + body);
}
console.log(`sync-docs: ${files.length} pages from docs/`);
