# Kindle highlights

Stacks doesn't download Kindle highlights itself. The [Kindle Highlights](https://github.com/hadynz/obsidian-kindle-plugin) plugin does: it reads your Kindle notebook from Amazon (or a `My Clippings.txt` file) and writes one note per book. Set the two plugins up as below and each Kindle book becomes one reference note. Stacks completes it, names it by its citekey, and the Kindle plugin keeps adding new highlights to the same note on every sync.

This page was written against Kindle Highlights 2.3.1.

## Why one note can serve both plugins

- **The Kindle plugin finds its notes by a property, not by name.** Each note it writes carries `kindle-bookId`, `kindle-title`, `kindle-author` and a few other `kindle-*` properties. On the next sync it looks for that `kindle-bookId` anywhere inside its highlights folder. So Stacks can rename the note to its citekey, and the Kindle plugin still finds it.
- **A Kindle sync adds, it doesn't rewrite.** It keeps every property it didn't write (your `citekey`, `status`, `collections`, `attachments`), and it inserts new highlights after the ones it wrote before. It recognizes those by the `^ref-…` block id at the end of each highlight's line.
- **Stacks completes any note in your references folder that has no citekey yet.** With **Complete notes on property edit** on (Settings → Automation, on by default), it looks the book up, fills in the empty properties, gives it a citekey, and renames it in the folder it is in. It never changes the note's body.

## Setting up

1. **Kindle Highlights → Highlights folder location:** choose a folder *inside* your Stacks references folder, such as `References/Kindle`. Don't choose the references folder itself:
   - The Kindle plugin only checks the first 1,000 notes in its folder when it syncs. Your library may be larger.
   - Stacks only completes notes inside the references folder.
2. **Kindle Highlights → Download book metadata:** turn it on, so the File template can use the book's ISBN.
3. **Kindle Highlights → Templates → File template:** start it with properties Stacks can use, then the highlights:

   ```
   ---
   {% if isbn %}isbn: {{isbn}}{% endif %}
   type: book
   status: processed
   ---
   ## Kindle highlights

   {{highlights}}
   ```

   - **Leave out `title` and `authors`.** Stacks fills them from the book's catalog record. Amazon's author line ("Nicole Forsgren PhD, Jez Humble, and Gene Kim") is a single string, and Stacks doesn't replace a value that is already there.
   - **Set `status` if you like.** Use whatever your reading workflow uses for a book you have read. Without one, Stacks gives the note its **Default status**.
   - **The File name template doesn't matter.** Stacks renames the note to its citekey.
   - **Any Highlight template works.** The Kindle plugin adds the `^ref-…` block ids itself.
4. **Sync** (Kindle Highlights: Sync highlights).

## What happens on a sync

- **A book that isn't in your library yet is completed where it is.** Stacks looks it up:
  1. by the ISBN from the File template;
  2. failing that, by its title and first author in [Open Library](https://openlibrary.org)'s search, taking only a result whose author's family name matches and whose title before any subtitle is the same;
  3. failing that, from the Kindle plugin's own title and author.

  Then it gets a citekey and is renamed in the Kindle folder.
- **Offline, or a catalog asks Stacks to wait?** Then the note is left as it is, with a notice, rather than settled on Amazon's title. This covers being offline, a rate limit, or a server error. Run **Complete current reference** on it later, or **Complete metadata** on the Kindle folder.
- **Notes are looked up one at a time.** A first sync of a large Kindle library writes many notes at once, so the lookups take a while, but the catalogs aren't flooded.
- **A book already in your library gets the Kindle highlights added to its existing reference.** Stacks recognizes it by ISBN, DOI or URL, or by its title and first author. A Kindle edition's ISBN is usually not the one on your print edition, so the title and author match is what usually finds it.
  - **The title compared** is the part before any subtitle, without a series or edition name in parentheses. So "Mistborn (The Mistborn Saga Book 1)" matches "Mistborn: The Final Empire".
  - **Different volumes stay apart.** Two titles that each name a different volume, part or book number are different books, so Volume 2 never goes into Volume 1's reference. Then:
  - the existing reference gets the `kindle-*` properties and every highlight it doesn't already have, at the end of the note;
  - the reference moves into the Kindle folder, because that is where the Kindle plugin looks next time;
  - the note the Kindle plugin just wrote goes to the trash;
  - a notice names the reference.
- **Later syncs add new highlights to the reference itself.**

## Keeping them working together

- **Keep the reference in the Kindle folder and keep its `kindle-*` properties.** If you move it out or delete them, the next sync writes a new note for the book. Stacks then adds it to the reference again, without duplicating highlights it already has, and moves the reference back into the Kindle folder.
- **Leave the `^ref-…` at the end of each highlight's line.** Write your own thoughts in a new paragraph rather than inside a highlight's line. A highlight that loses its id is added again on the next sync.
- **Highlights you copied into a reference by hand before** (from an older Kindle note, without `^ref-…` ids) aren't recognized as the same highlights. After the first sync adds the plugin's copies, delete the old section.
- **Keep the Kindle folder inside the references folder.** Running **Complete current reference** on a Kindle note somewhere else has two outcomes:
  - **A new book** is moved into the references folder, out of the Kindle plugin's folder, so the next sync writes a new note for it.
  - **A book already in your library** stays where its reference is, so the Kindle plugin won't find it on its next sync.

  A notice says which happened.
- **Books you don't want in your library:** list them under Kindle Highlights → Ignored books.
- **Highlights from `My Clippings.txt`** carry no ISBN, so those books are found by title and author. Their author lines are often "Lewis, C. S." or "Forsgren, Nicole;Humble, Jez". Stacks reads both as names, in the usual order.

## Kindle highlights in your library base

Stacks' `highlights` and `last_highlighted` properties count the annotations it extracts from PDFs. The Kindle plugin keeps its own count and date in `kindle-highlightsCount` and `kindle-lastAnnotatedDate`. To see both in a base, add formulas and use them as columns:

```yaml
formulas:
  all_highlights: if(highlights, highlights, 0) + if(note["kindle-highlightsCount"], note["kindle-highlightsCount"], 0)
  kindle_date: note["kindle-lastAnnotatedDate"]
```

To list only Kindle books in a view, give it the filter `!note["kindle-bookId"].isEmpty()`.
