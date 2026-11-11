const HEX = "0123456789abcdef";

type CryptoSource = {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  const source = (globalThis as { crypto?: CryptoSource }).crypto;

  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  let output = "";
  for (const byte of bytes) {
    output += HEX[byte >> 4] + HEX[byte & 15];
  }
  return output;
}

/** 16 random bytes, the width expected by OpenTelemetry trace ids. */
export function newTraceId(): string {
  return randomHex(32);
}

/** 8 random bytes, the width expected by OpenTelemetry span ids. */
export function newSpanId(): string {
  return randomHex(16);
}
