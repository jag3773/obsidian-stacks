# Getting started

1. **Install Stacks.** In Obsidian, open **Settings → Community plugins**, choose **Browse**, search for **Stacks**, then install and enable it. (Other options are under [Install](install.md).)
2. **Choose your folders.** Open **Settings → Stacks**. Under **Folders**, set your **References folder** (where reference notes live), **Attachments folder** (where PDFs, ebooks and other files are filed), and **Inbox folder** (where new clips, PDFs, ebooks and documents land). The defaults, `References`, `References/attachments` and `Inbox`, work fine if you have no preference.
3. **Create your Stacks base.** Further down, under **Base**, press **Create base**. Stacks writes a starter base, `Stacks.base`, with views for each reading status, so you can browse your library right away. (Already have a Base? Pick it in the **Base** field instead.) Bases must be enabled in Obsidian.
4. **Add your first reference.** Click the **Add reference** icon (the library icon) in the left ribbon, or run **Stacks: Add reference** from the command palette. Paste an ISBN, DOI, arXiv ID, or URL. Stacks looks up the details, creates the note, and opens it.
5. **Clip from the web.** Install [Obsidian Web Clipper](https://obsidian.md/clipper) in your browser and set it to save into your inbox folder. Anything you clip lands in the inbox, and Stacks picks it up automatically: it fills in the metadata, gives the note a citekey, and files it in your references folder. For a ready-made template, see [capturing with Web Clipper](web-clipper.md).
6. **Drop in your files.** Put a PDF, an EPUB or Kobo ebook, a Kindle book, or a Word or OpenDocument file in the inbox. Stacks reads its ISBN or DOI, looks it up, creates the reference note and files the file beside it. See [every format your library comes in](features.md#every-format-your-library-comes-in).

That's it. Your library is a set of ordinary notes in your vault, ready to link, read, and cite.

## Set up your library


Open the Stacks settings and choose your references, attachments, and inbox folders. Under **Base**, pick an existing `.base` file or press **Create base**.

When a Base requires one folder, Stacks can use it as the references folder. Negated or ambiguous folder filters leave the configured destination unchanged. Review the field dropdowns so Stacks uses names such as `author`, `source`, or `Citation Key` the way your vault does. Web Clipper's `published` and `description` are recognized as the publication date and abstract. **Create base** preserves your mappings; **Re-read** refreshes the mapping from a selected Base.

<details>
<summary>Example Base to customize</summary>

This example assumes the default folder and property names. The settings command generates a Base using your own mappings.

```yaml
filters:
  and:
    - file.inFolder("References")
    - file.hasProperty("citekey")
formulas:
  name: file.asLink(title)
properties:
  formula.name:
    displayName: Title
views:
  - type: table
    name: Library
    groupBy:
      property: status
      direction: ASC
    order: [formula.name, authors, year, type, pdf, status]
  - type: table
    name: Queue
    filters: 'status == "queued"'
    order: [formula.name, authors, year, added]
```

</details>

## Let your reading become part of your thinking

A source deserves a place beside the ideas it inspires. Link an article to a project. Connect an author to a person note. Follow a book into a question, an experiment, or a draft. Use Obsidian's links, properties, search, and Bases to work with your references alongside the rest of your vault.

Each source is an ordinary Markdown note. Its metadata lives in properties; its PDFs, ebooks and other files live in ordinary folders. Your reading notes stay yours. The library remains useful if you remove the plugin.

Zotero has helped researchers collect, organize, and cite their work for years. Stacks shares that respect for careful research and takes an Obsidian-first approach: bring those essential workflows into the place where your knowledge already lives. The goal is to make a separate reference manager optional for Obsidian users.

## From a saved paper to a connected note


1. Run **Stacks: Add reference** and paste a DOI, or drop a PDF or ebook into your inbox.
2. Open the reference note, read the PDF in Obsidian (or on your tablet), and run **Extract annotations** to bring your highlights into the note. Add your own thoughts and links around them.
3. Browse your library in a Base, follow connections into your projects, and keep building on what you read.

No separate library database to maintain. The notes and files in your vault are the library.
