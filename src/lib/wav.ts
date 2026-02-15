function readAscii(u8: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...u8.slice(offset, offset + len));
}

function u32le(u8: Uint8Array, offset: number): number {
  return (u8[offset] | (u8[offset + 1] << 8) | (u8[offset + 2] << 16) | (u8[offset + 3] << 24)) >>> 0;
}

function u16le(u8: Uint8Array, offset: number): number {
  return u8[offset] | (u8[offset + 1] << 8);
}

function writeAscii(u8: Uint8Array, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) u8[offset + i] = s.charCodeAt(i) & 0xff;
}

function writeU32le(u8: Uint8Array, offset: number, v: number) {
  u8[offset] = v & 0xff;
  u8[offset + 1] = (v >>> 8) & 0xff;
  u8[offset + 2] = (v >>> 16) & 0xff;
  u8[offset + 3] = (v >>> 24) & 0xff;
}

function writeU16le(u8: Uint8Array, offset: number, v: number) {
  u8[offset] = v & 0xff;
  u8[offset + 1] = (v >>> 8) & 0xff;
}

function buildPcmWav(opts: {
  pcm16le: Uint8Array;
  sampleRate: number;
  numChannels: number;
}): Uint8Array {
  const { pcm16le, sampleRate, numChannels } = opts;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16le.byteLength;

  const out = new Uint8Array(44 + dataSize);
  writeAscii(out, 0, "RIFF");
  writeU32le(out, 4, 36 + dataSize);
  writeAscii(out, 8, "WAVE");

  writeAscii(out, 12, "fmt ");
  writeU32le(out, 16, 16);
  writeU16le(out, 20, 1); // PCM
  writeU16le(out, 22, numChannels);
  writeU32le(out, 24, sampleRate);
  writeU32le(out, 28, byteRate);
  writeU16le(out, 32, blockAlign);
  writeU16le(out, 34, 16);

  writeAscii(out, 36, "data");
  writeU32le(out, 40, dataSize);
  out.set(pcm16le, 44);
  return out;
}

export function splitStereoPcmWavToMonoWavs(input: ArrayBuffer | Uint8Array): {
  leftWav: Uint8Array;
  rightWav: Uint8Array;
  sampleRate: number;
} {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.byteLength < 44) throw new Error("Invalid WAV: too small");
  if (readAscii(u8, 0, 4) !== "RIFF" || readAscii(u8, 8, 4) !== "WAVE") throw new Error("Invalid WAV: missing RIFF/WAVE");

  let offset = 12;
  let fmt: {
    audioFormat: number;
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
    blockAlign: number;
  } | null = null;

  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= u8.byteLength) {
    const id = readAscii(u8, offset, 4);
    const size = u32le(u8, offset + 4);
    const chunkStart = offset + 8;

    if (id === "fmt ") {
      if (chunkStart + 16 > u8.byteLength) throw new Error("Invalid WAV: fmt chunk truncated");
      const audioFormat = u16le(u8, chunkStart + 0);
      const numChannels = u16le(u8, chunkStart + 2);
      const sampleRate = u32le(u8, chunkStart + 4);
      const blockAlign = u16le(u8, chunkStart + 12);
      const bitsPerSample = u16le(u8, chunkStart + 14);
      fmt = { audioFormat, numChannels, sampleRate, bitsPerSample, blockAlign };
    }

    if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
    }

    offset = chunkStart + size;
    // Chunks are padded to even size.
    if (offset % 2 === 1) offset++;
  }

  if (!fmt) throw new Error("Invalid WAV: missing fmt chunk");
  if (dataOffset < 0) throw new Error("Invalid WAV: missing data chunk");

  if (fmt.audioFormat !== 1) throw new Error("Unsupported WAV: only PCM supported");
  if (fmt.bitsPerSample !== 16) throw new Error("Unsupported WAV: only 16-bit supported");
  if (fmt.numChannels !== 2) throw new Error("Unsupported WAV: expected stereo (2 channels)");

  const bytesPerSample = 2;
  const frameSize = fmt.numChannels * bytesPerSample;
  const end = Math.min(u8.byteLength, dataOffset + dataSize);
  const frames = Math.floor((end - dataOffset) / frameSize);
  if (frames <= 0) throw new Error("Invalid WAV: empty data");

  const left = new Uint8Array(frames * bytesPerSample);
  const right = new Uint8Array(frames * bytesPerSample);

  let inOff = dataOffset;
  for (let i = 0; i < frames; i++) {
    const outOff = i * bytesPerSample;
    left[outOff] = u8[inOff];
    left[outOff + 1] = u8[inOff + 1];
    right[outOff] = u8[inOff + 2];
    right[outOff + 1] = u8[inOff + 3];
    inOff += frameSize;
  }

  return {
    leftWav: buildPcmWav({ pcm16le: left, sampleRate: fmt.sampleRate, numChannels: 1 }),
    rightWav: buildPcmWav({ pcm16le: right, sampleRate: fmt.sampleRate, numChannels: 1 }),
    sampleRate: fmt.sampleRate,
  };
}
