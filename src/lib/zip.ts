function u16le(n: number) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32le(n: number) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

// CRC32 (IEEE) implementation.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function sanitizeZipPath(p: string) {
  // Normalize separators and strip leading slashes.
  const s = String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\r|\n|\0/g, "");
  // Avoid directory traversal.
  const parts = s.split("/").filter((x) => x && x !== "." && x !== "..");
  return parts.join("/") || "file";
}

export type ZipInputFile = {
  path: string;
  data: Uint8Array;
};

// Creates a basic ZIP (store method, no compression) as a Uint8Array.
export function createZip(files: ZipInputFile[], opts?: { mtime?: Date }) {
  const mtime = opts?.mtime ?? new Date();
  const { dosTime, dosDate } = dosDateTime(mtime);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];

  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(sanitizeZipPath(f.path), "utf8");
    const data = Buffer.from(f.data);
    const crc = crc32(f.data);

    // Local file header
    // 0x04034b50
    const localHeader = Buffer.concat([
      u32le(0x04034b50),
      u16le(20), // version needed
      u16le(0x0800), // flags: UTF-8
      u16le(0), // compression method: store
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(data.length),
      u32le(data.length),
      u16le(name.length),
      u16le(0), // extra len
      name,
    ]);

    localParts.push(localHeader, data);

    // Central directory header
    // 0x02014b50
    const centralHeader = Buffer.concat([
      u32le(0x02014b50),
      u16le(0x0314), // version made by (3.20)
      u16le(20), // version needed
      u16le(0x0800), // flags UTF-8
      u16le(0), // store
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(data.length),
      u32le(data.length),
      u16le(name.length),
      u16le(0), // extra
      u16le(0), // comment
      u16le(0), // disk
      u16le(0), // internal attrs
      u32le(0), // external attrs
      u32le(offset), // local header offset
      name,
    ]);

    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralOffset = offset;
  const centralSize = centralDir.length;

  // End of central directory
  const eocd = Buffer.concat([
    u32le(0x06054b50),
    u16le(0),
    u16le(0),
    u16le(files.length),
    u16le(files.length),
    u32le(centralSize),
    u32le(centralOffset),
    u16le(0),
  ]);

  const out = Buffer.concat([...localParts, centralDir, eocd]);
  return new Uint8Array(out);
}
