// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const repo = "https://github.com/jag3773/obsidian-stacks";
const fonts =
	"https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

const docs = (...slugs) => slugs.map((s) => `docs/${s}`);

export default defineConfig({
	site: "https://jag3773.github.io",
	base: "/obsidian-stacks",
	trailingSlash: "always",
	integrations: [
		starlight({
			title: "Stacks",
			description: "A research library inside your Obsidian vault.",
			logo: {
				light: "./src/assets/stacks-logo-horizontal-light.svg",
				dark: "./src/assets/stacks-logo-horizontal-dark.svg",
				replacesTitle: true,
			},
			favicon: "/favicon.svg",
			social: [{ icon: "github", label: "GitHub", href: repo }],
			customCss: ["./src/styles/starlight.css"],
			head: [
				{ tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
				{ tag: "link", attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true } },
				{ tag: "link", attrs: { rel: "stylesheet", href: fonts } },
				{ tag: "link", attrs: { rel: "apple-touch-icon", href: "/obsidian-stacks/apple-touch-icon.png" } },
				{ tag: "meta", attrs: { property: "og:image", content: "https://jag3773.github.io/obsidian-stacks/og-image.png" } },
				{ tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
			],
			sidebar: [
				{ label: "Start here", items: docs("getting-started", "install", "features") },
				{ label: "Collect", items: docs("web-clipper", "attachments", "find-pdf", "kindle", "importing") },
				{ label: "Read", items: docs("annotations", "sync-and-mobile") },
				{ label: "Organize", items: docs("batch-and-collections", "searching", "citation-fields") },
				{ label: "Cite", items: docs("citing") },
				{ label: "Maintain", items: docs("maintenance") },
				{ label: "Move from Zotero", items: docs("migrating-from-zotero") },
				{
					label: "Project",
					items: [
						...docs("roadmap", "privacy", "contributing"),
						{ label: "Releases", link: `${repo}/releases`, attrs: { target: "_blank" } },
						{ label: "Report an issue", link: `${repo}/issues/new`, attrs: { target: "_blank" } },
					],
				},
			],
		}),
	],
});
