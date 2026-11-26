<p align="center">
  <a href="https://jag3773.github.io/obsidian-stacks/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="brand/stacks-logo/svg/stacks-logo-horizontal-dark.svg">
      <img src="brand/stacks-logo/svg/stacks-logo-horizontal-light.svg" alt="Stacks" width="320">
    </picture>
  </a>
</p>

<h3 align="center">Your sources. Your ideas. One home.</h3>

<p align="center">A research library inside your Obsidian vault.</p>

<p align="center">
  <a href="https://jag3773.github.io/obsidian-stacks/"><strong>Website</strong></a> ·
  <a href="https://jag3773.github.io/obsidian-stacks/docs/getting-started/"><strong>Getting started</strong></a> ·
  <a href="https://jag3773.github.io/obsidian-stacks/docs/features/">Features</a> ·
  <a href="https://jag3773.github.io/obsidian-stacks/docs/migrating-from-zotero/">Coming from Zotero</a> ·
  <a href="https://github.com/jag3773/obsidian-stacks/releases">Releases</a>
</p>

> **The guides live on the website: [jag3773.github.io/obsidian-stacks](https://jag3773.github.io/obsidian-stacks/).** This README is the short version.

https://github.com/user-attachments/assets/ced9d074-954a-471c-9409-3585323aaea8

Stacks brings the work of a reference manager into your vault: collect sources, read deeply, connect ideas and cite with confidence. Every reference is an ordinary Markdown note, and its PDFs, ebooks and documents live in ordinary folders. The library stays useful if you remove the plugin.

- **Add a source** by ISBN, DOI, arXiv ID or URL, or clip it with Obsidian Web Clipper.
- **Drop in files**: PDF, EPUB and Kobo, Kindle, Word and OpenDocument. Stacks reads the identifier, looks it up and files the file beside its note.
- **Turn highlights into notes**, and send PDFs to a tablet and bring the highlights home.
- **Cite as you write**, and export CSL-JSON, BibLaTeX or BibTeX for Pandoc and Quarto.
- **Move from Zotero** with a preview and undo, and keep the library healthy with a report and previewed repairs.

See [everything Stacks does](https://jag3773.github.io/obsidian-stacks/docs/features/).

> **Early release.** Stacks is in Obsidian's community plugin directory, and has been tested on its author's own vault so far. Keep a backup of your vault, and [tell us what you find](https://github.com/jag3773/obsidian-stacks/issues/new).

## Install

In Obsidian, open **Settings → Community plugins → Browse**, search for **Stacks**, then install and enable it. Then follow [getting started](https://jag3773.github.io/obsidian-stacks/docs/getting-started/) to choose your folders and create your library base. [Manual installation and upgrade notes](https://jag3773.github.io/obsidian-stacks/docs/install/).

## Contribute

Bug reports, notes on what worked, and pull requests are all welcome. See [contributing](https://jag3773.github.io/obsidian-stacks/docs/contributing/) for how to build, test and release, and the [roadmap](https://jag3773.github.io/obsidian-stacks/docs/roadmap/) for what's next.

```sh
npm ci && npm run build   # the plugin
npm test                  # unit tests
```

The guides are written in [`docs/`](docs) and published by [`site/`](site), an Astro Starlight site deployed to GitHub Pages; edit the Markdown in `docs/` and the site follows. Logos and design sources are in [`brand/`](brand).

## License

MIT. See [LICENSE](LICENSE). Bundled third-party components (the citation processor, citation style, and locale) keep their own licences; see [NOTICE.md](NOTICE.md).
