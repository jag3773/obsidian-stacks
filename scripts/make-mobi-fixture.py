#!/usr/bin/env python3
"""Writes a small Kindle (MOBI) book for the inbox tests: a PalmDB with a MOBI header, an EXTH
header with the metadata Stacks reads, one uncompressed text record and an end-of-file record.
Layout from the MobileRead wiki's MOBI and PDB pages (offsets there are from record 0;
here, inside `mobi`, from the MOBI header, 16 bytes in). Run with --check to read it back with KindleUnpack
(pip install mobi==0.3.3), an independent parser, and compare.

Usage: make-mobi-fixture.py OUT [--check]
"""
import struct
import sys

TITLE = "Harbour Lights"
AUTHORS = ["Søren Ní Bhriain", "Ada Quist"]
EXTH = [
    (100, AUTHORS[0]),
    (100, AUTHORS[1]),
    (101, "Tidewater & Sons"),
    (103, "<p>Stories from a <b>working</b> harbour.</p>"),
    (104, "978-1-84195-302-1"),
    (106, "2015-09-30"),
    (503, TITLE),
    (524, "en"),
]
TEXT = "<html><body><p>The lamps came on one by one.</p></body></html>".encode("utf-8")


def exth_block():
    records = b""
    for kind, value in EXTH:
        data = value.encode("utf-8")
        records += struct.pack(">II", kind, 8 + len(data)) + data
    block = b"EXTH" + struct.pack(">II", 12 + len(records), len(EXTH)) + records
    return block + b"\0" * (-len(block) % 4)


def record0():
    header_length = 232
    full_name = TITLE.encode("utf-8")
    exth = exth_block()
    name_offset = 16 + header_length + len(exth)
    palmdoc = struct.pack(">HHIHHHH", 1, 0, len(TEXT), 1, 4096, 0, 0)
    mobi = bytearray(header_length)
    struct.pack_into(">4sIIII", mobi, 0, b"MOBI", header_length, 2, 65001, 0x5354_4143)
    struct.pack_into(">I", mobi, 20, 6)  # file version
    for o in range(24, 64, 4):  # index records: none
        struct.pack_into(">I", mobi, o, 0xFFFFFFFF)
    struct.pack_into(">IIII", mobi, 64, 2, name_offset, len(full_name), 9)  # first non-book, name, locale en
    # Offsets in `mobi` are from the MOBI header, 16 bytes into record 0.
    struct.pack_into(">IIIIII", mobi, 80, 0, 0, 6, 0xFFFFFFFF, 0, 0)  # languages, min version, first image, huffman
    struct.pack_into(">I", mobi, 112, 0x50)  # EXTH flags: EXTH present
    struct.pack_into(">IIIII", mobi, 148, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0, 0)  # no DRM: offset and count 0xFFFFFFFF
    struct.pack_into(">HH", mobi, 176, 1, 1)  # first and last content record
    struct.pack_into(">I", mobi, 180, 1)
    struct.pack_into(">IIII", mobi, 184, 0xFFFFFFFF, 0, 0xFFFFFFFF, 0)  # no FCIS, FLIS
    struct.pack_into(">I", mobi, 208, 0xFFFFFFFF)
    struct.pack_into(">III", mobi, 212, 0, 0xFFFFFFFF, 0xFFFFFFFF)
    struct.pack_into(">I", mobi, 224, 0)  # extra record data flags
    struct.pack_into(">I", mobi, 228, 0xFFFFFFFF)  # no INDX
    rec = palmdoc + bytes(mobi) + exth + full_name
    return rec + b"\0" * (-len(rec) % 4 + 4)


def palmdb(records):
    n = len(records)
    header = TITLE.replace(" ", "_").encode()[:31].ljust(32, b"\0")
    header += struct.pack(">HHIIIIII", 0, 0, 0x5C000000, 0x5C000000, 0, 0, 0, 0)
    header += b"BOOKMOBI" + struct.pack(">IIH", 2 * n - 1, 0, n)
    offset = len(header) + 8 * n + 2
    table = b""
    for i, rec in enumerate(records):
        table += struct.pack(">II", offset, 2 * i)
        offset += len(rec)
    return header + table + b"\0\0" + b"".join(records)


def main():
    out = sys.argv[1]
    data = palmdb([record0(), TEXT, b"\xe9\x8e\x0d\x0a"])
    with open(out, "wb") as f:
        f.write(data)
    if "--check" in sys.argv:
        check(out)


def check(path):
    """Read the file back with KindleUnpack's own header parser."""
    from mobi.kindleunpack import Sectionizer  # noqa: PLC0415
    from mobi.mobi_header import MobiHeader  # noqa: PLC0415

    sect = Sectionizer(path)
    mh = MobiHeader(sect, 0)
    meta = mh.getMetaData()
    print("KindleUnpack:", {k: meta[k] for k in sorted(meta)})
    print("title:", mh.title)
    assert mh.title == TITLE, mh.title
    assert meta.get("Creator") == AUTHORS, meta.get("Creator")
    assert meta.get("ISBN") == ["978-1-84195-302-1"], meta.get("ISBN")
    assert meta.get("Publisher") == ["Tidewater & Sons"], meta.get("Publisher")
    assert meta.get("Published") == ["2015-09-30"], meta.get("Published")
    print("KindleUnpack agrees.")


if __name__ == "__main__":
    main()
