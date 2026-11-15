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

## Notes from earlier versions

Earlier versions of Stacks also linked the PDF in a separate `pdf` property. Stacks still reads it, as the reference's first attachment, so its PDF stays the same and nothing stops working. It no longer writes it.

**Check library health** lists the notes that still have it, and **Repair attachment links** moves each one into `attachments` and removes `pdf`, after a preview. See [library health](maintenance.md#repair-attachment-links). If your settings mapped the PDF field to another property name, that name is the one Stacks reads and moves.
