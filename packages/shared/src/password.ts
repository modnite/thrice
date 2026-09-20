import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(plain, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltHex, keyHex] = hashed.split(":");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expectedKey = Buffer.from(keyHex, "hex");
    const derivedKey = scryptSync(plain, salt, expectedKey.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });

    return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}
