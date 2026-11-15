# Files and the main file

A reference note lists every file that belongs to it in one property, `attachments`: the book's PDF or ebook, a chapter scan, the slides that came with a talk, a download from the publisher. Each entry is a link, so it opens from the note and from a Base, and Obsidian keeps it pointing at the file when you rename or move it.

```yaml
attachments:
  - "[[smith2020.epub]]"
  - "[[smith2020.pdf]]"
  - "[[smith2020 1.zip]]"
```

## The main file

The **main file** is the attachment in your most preferred format. Set the order under Settings → Folders → **Preferred formats**, comma-separated. The default is `pdf, epub`: a reference's PDF is its main file, or its ebook when it has no PDF. If you read ebooks, set `epub, pdf`; if you keep Word documents, add `docx`.

- Among files of the same format, the one listed first wins.
- A link that doesn't resolve is skipped.
- When no attachment is in a preferred format, the first one is the main file.
- Names play no part. Renaming a file, or changing the citekey, never changes which file is the main one.

The main file is what the library base's **File** column opens, and what its **Missing file** view looks for: a reference shows up there when it has no file in any of your preferred formats.

Highlights, the reading round trip and Find PDF work with PDFs. They use the reference's first PDF, whatever your preferred formats are.

## How files are added

When Stacks files a file for a reference (from the inbox, Find PDF, or an import), it is named with the **Attachment filename format** (the citekey by default) and linked in `attachments`. It goes first in the list when the reference has no file in that format yet, and last otherwise. A file with a name that is already taken gets a number (`smith2020 1.pdf`), so supplementary files never replace the main one.

Imports list each record's files with your preferred formats first.

## Dropping files in the inbox

Drop a file in your inbox folder and Stacks identifies it, creates its reference note (or finds the one you already have) and files it:

| Format | Extensions | What Stacks reads |
|---|---|---|
| PDF | `.pdf` | A DOI, ISBN or PubMed ID in the first pages; the document's title and author |
| EPUB, including Kobo | `.epub`, `.kepub`, `.kepub.epub` | The book's ISBN, title, authors (not translators or editors), publisher, date, language and description from its package metadata; an ISBN on the copyright page when the metadata has none |
| Kindle | `.mobi`, `.azw`, `.azw3`, `.prc` | The ISBN, title, authors, publisher, date, language and description in the book's header. It isn't encrypted, so books with DRM are identified too |
| Word | `.docx` | The document's title and author, and a DOI, ISBN or PubMed ID in its text |
| OpenDocument text | `.odt` | The same as Word |

With an ISBN or DOI, Stacks looks the work up as **Add reference** does, and the file's own metadata fills what the lookup lacks, such as a publisher. Without one, or when no lookup knows it, the reference is made from the file alone: a book for an ebook, a document otherwise, titled by the file's metadata or its filename.

An ebook of a book you already have (the same ISBN) is attached to that reference rather than filed again, so your PDF and your EPUB end up side by side in its `attachments`. The same file dropped twice is left in the inbox with a notice.

A file still being copied or synced waits in the inbox until it is complete, and one that names an ISBN or DOI waits while you are offline; see [sync, backups and mobile](sync-and-mobile.md).

Not read: Kindle KFX files (their format isn't documented), older Word `.doc` files, and Kobo's highlight database.

## Notes from earlier versions

Earlier versions of Stacks also linked the PDF in a separate `pdf` property. Stacks still reads it, as the reference's first attachment, so its PDF stays the same and nothing stops working; the library base's **File** column and **Missing file** view read it the same way. It no longer writes it.

**Check library health** lists the notes that still have it, and **Repair attachment links** moves each one into `attachments` and removes `pdf`, after a preview. See [library health](maintenance.md#repair-attachment-links). If your settings mapped the PDF field to another property name, that name is the one Stacks reads and moves.
