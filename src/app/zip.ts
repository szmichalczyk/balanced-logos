// Minimal ZIP writer (stored / no compression) so multiple exported logo files can be packed into
// one download without a third-party dependency.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

export function createZip(entries: readonly ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // local file header signature
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // compression: stored
      ...u16(0), // mod time
      ...u16(0), // mod date
      ...u32(crc),
      ...u32(size), // compressed size
      ...u32(size), // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...nameBytes,
    ]);
    chunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, // central dir signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset), // local header offset
      ...nameBytes,
    ]);
    central.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, // end of central dir signature
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ]);

  const parts = [...chunks, ...central, end] as unknown as BlobPart[];
  return new Blob(parts, { type: "application/zip" });
}

/** Make a filesystem-safe base name from an uploaded file name, without extension. */
export function safeBaseName(fileName: string, fallback: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}
