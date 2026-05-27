import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const UPPERCASE_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE_PASSWORD_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const NUMBER_PASSWORD_CHARS = '23456789';
const PASSWORD_CHARS =
  `${UPPERCASE_PASSWORD_CHARS}${LOWERCASE_PASSWORD_CHARS}${NUMBER_PASSWORD_CHARS}`;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d!@#$%^&*()_\-+=.?]{10,64}$/;
export const PASSWORD_COMPLEXITY_MESSAGE =
  '密码至少 10 位，且需同时包含大写字母、小写字母和数字';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const [salt, key] = passwordHash.split(':');

  if (!salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, 'hex');

  return (
    derivedKey.length === storedKey.length &&
    timingSafeEqual(derivedKey, storedKey)
  );
}

export function generateTemporaryPassword(length = 14): string {
  const normalizedLength = Math.max(length, PASSWORD_MIN_LENGTH);
  const passwordChars = [
    UPPERCASE_PASSWORD_CHARS,
    LOWERCASE_PASSWORD_CHARS,
    NUMBER_PASSWORD_CHARS,
  ].map((charset) => pickRandomCharacter(charset));

  while (passwordChars.length < normalizedLength) {
    passwordChars.push(pickRandomCharacter(PASSWORD_CHARS));
  }

  const shuffledChars = [...passwordChars];
  for (let index = shuffledChars.length - 1; index > 0; index -= 1) {
    const randomIndex = randomBytes(1)[0] % (index + 1);
    [shuffledChars[index], shuffledChars[randomIndex]] = [
      shuffledChars[randomIndex],
      shuffledChars[index],
    ];
  }

  return shuffledChars.join('');
}

function pickRandomCharacter(charset: string) {
  const [byte] = randomBytes(1);
  return charset[byte % charset.length];
}
