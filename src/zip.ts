/**
 * Pure module: read single entries from a ZIP archive (EPUB, DOCX and ODT are ZIP files).
 * Deflated entries are inflated with the platform's DecompressionStream ("deflate-raw"), so
 * nothing is bundled. Only what the inbox needs: no ZIP64, no encryption, no writing.
 */

/** An archive member, as the central directory lists it. */
export interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	size: number;
	/** Offset of the entry's local header. */
	offset: number;
	encrypted: boolean;
}

/** Largest entry inflated, in bytes; a bigger one (or a ZIP bomb) is skipped. */
export const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Position of the end-of-central-directory record, or -1. */
function findEnd(b: Uint8Array): number {
	// The record is 22 bytes plus a comment of at most 65535.
	for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
		if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
	}
	return -1;
}

/**
 * True when the archive has arrived in full: its end record is there and the central
 * directory it points to lies inside the file. A file a sync client or a copy is still
 * writing has neither yet.
 */
export function zipComplete(b: Uint8Array): boolean {
	const end = findEnd(b);
	if (end < 0) return false;
	const size = u32(b, end + 12);
	const offset = u32(b, end + 16);
	return offset + size <= end && u32(b, offset) === 0x02014b50;
}

/** The archive's entries; [] when it isn't a ZIP this module can read. */
export function zipEntries(b: Uint8Array): ZipEntry[] {
	const end = findEnd(b);
	if (end < 0) return [];
	const count = u16(b, end + 10);
	let p = u32(b, end + 16);
	const names = new TextDecoder("utf-8");
	const out: ZipEntry[] = [];
	for (let i = 0; i < count && p + 46 <= b.length && u32(b, p) === 0x02014b50; i++) {
		const nameLen = u16(b, p + 28);
		const extraLen = u16(b, p + 30);
		const commentLen = u16(b, p + 32);
		out.push({
			name: names.decode(b.subarray(p + 46, p + 46 + nameLen)),
			method: u16(b, p + 10),
			compressedSize: u32(b, p + 20),
			size: u32(b, p + 24),
			offset: u32(b, p + 42),
			encrypted: (u16(b, p + 8) & 1) === 1,
		});
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

/** Inflate raw deflate data, stopping (null) past `limit` bytes. */
async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array | null> {
	// A copy: Blob takes bytes backed by a plain ArrayBuffer.
	const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
	const reader = stream.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > limit) {
			await reader.cancel();
			return null;
		}
		parts.push(value);
	}
	const out = new Uint8Array(total);
	let o = 0;
	for (const part of parts) {
		out.set(part, o);
		o += part.length;
	}
	return out;
}

/**
 * The bytes of one entry, matched by exact name (case-insensitively when no exact match);
 * null when it is missing, encrypted, too big, or stored with an unsupported method.
 */
export async function zipEntry(b: Uint8Array, name: string, entries = zipEntries(b)): Promise<Uint8Array | null> {
	const e = entries.find((x) => x.name === name) ?? entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
	if (!e || e.encrypted || e.size > MAX_ENTRY_BYTES || u32(b, e.offset) !== 0x04034b50) return null;
	const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
	const data = b.subarray(start, start + e.compressedSize);
	if (data.length < e.compressedSize) return null;
	if (e.method === 0) return data;
	if (e.method === 8) return inflate(data, MAX_ENTRY_BYTES);
	return null;
}

/** An entry as UTF-8 text, or null. */
export async function zipText(b: Uint8Array, name: string, entries = zipEntries(b)): Promise<string | null> {
	const data = await zipEntry(b, name, entries);
	return data ? new TextDecoder("utf-8").decode(data) : null;
}
