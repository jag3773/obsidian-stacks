# Metadata and privacy

Stacks uses Open Library and Google Books for ISBNs (and Open Library's search, with a title and author, for a clipped book page that came back with no ISBN), Crossref and doi.org for DOIs, arXiv for arXiv IDs, NCBI E-utilities (PubMed) for PMIDs and PubMed links, GitHub's public API for repositories, and a web page's own metadata for other URLs. No API keys are required. **Find PDF**, only when you run it, asks Unpaywall (with your contact email) and the work's landing page for an open-access PDF.

For a web page, Stacks trusts the most specific source first:

1. **Site readers** for Amazon, Goodreads, and Kobo book pages and GitHub repositories, which keep their best data outside the standard tags.
2. **schema.org JSON-LD**, including a book's edition (`workExample`) and author references elsewhere in the page's data.
3. **COinS,** when the page has one COinS span and it describes the page itself.
4. **Standard tags:** Highwire `citation_*` (used by Google Scholar), Dublin Core, PRISM, and Open Graph.
5. **The page body,** as a last resort: bylines (microdata, `rel="author"`, author-page links) and the article's `<time>`.

A page that names a DOI is looked up through Crossref; a PubMed record through E-utilities, then Crossref. A book page that names an ISBN gets a missing date, publisher, or description from Open Library and Google Books; the page's own values win. A bot check served in place of the page (Kobo, Cloudflare, an Amazon captcha) is recognized and ignored. When a clipped book page comes back with no date or ISBN, Stacks searches Open Library for the book by its title and author (see [Web Clipper](web-clipper.md#what-happens-to-a-clip)).

Note bodies, PDF text, and annotations are processed locally. The optional pre-extraction command runs on your computer, and the tablet round trip only copies files between your vault and a folder you choose. Lookups send the identifier or URL to the relevant service or website; identifiers discovered in a PDF may also be looked up. An optional contact email is sent to Crossref, and to Unpaywall when you run Find PDF, only when you configure it. Stacks has no telemetry or required cloud account.
