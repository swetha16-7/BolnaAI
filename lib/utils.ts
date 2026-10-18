import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => n < 10 ? '0' + n : n;
  
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // hour 0 should be 12
  
  return `${month}/${date}/${year}, ${hours}:${pad(minutes)}:${pad(seconds)} ${ampm}`;
}

export class SecureRandomUnavailableError extends Error {
  constructor(
    message = "Cryptographically secure random number generation is not supported in this environment.",
  ) {
    super(message);
    this.name = "SecureRandomUnavailableError";
  }
}

export type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

export function generateSecureClientUuid(cryptoSource?: CryptoLike): string {
  const source = cryptoSource !== undefined
    ? cryptoSource
    : (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: CryptoLike }).crypto : undefined);

  if (source && typeof source.randomUUID === "function") {
    return source.randomUUID();
  }

  if (source && typeof source.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    source.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new SecureRandomUnavailableError(
    "Cryptographically secure random number generation is not supported by your browser.",
  );
}

