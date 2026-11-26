# Stacks website

The site at <https://jag3773.github.io/obsidian-stacks/>: a landing page (`src/pages/index.astro`) and the guides, built with [Astro Starlight](https://starlight.astro.build).

The guides are not written here. `npm run build` first runs `scripts/sync-docs.mjs`, which copies `../docs/*.md` into `src/content/docs/docs/` (git-ignored), turning each page's `# Title` into frontmatter and its links into site URLs. Edit the Markdown in `docs/`; add a new page to the sidebar in `astro.config.mjs`.

```sh
cd site
npm ci
npm run dev       # http://localhost:4321/obsidian-stacks/
npm run build     # static site in dist/
```

Pushes to `main` that touch `site/` or `docs/` deploy through `.github/workflows/site.yml`. The design source is `brand/design/Main.dc.html`; logos come from `brand/stacks-logo/`.
