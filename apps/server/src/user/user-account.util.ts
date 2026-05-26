import pinyin from 'pinyin';

export function normalizeUsernameBase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function createUsernameBaseFromPinyin(namePinyin: string): string {
  const normalized = normalizeUsernameBase(namePinyin);

  if (normalized) {
    return normalized.slice(0, 30);
  }

  return 'user';
}

export function createUsernameBase(realName: string): string {
  const transliterated = pinyin(realName, {
    style: pinyin.STYLE_NORMAL,
  })
    .flat()
    .join('')
    .toLowerCase();
  const normalized = normalizeUsernameBase(transliterated);

  if (normalized) {
    return normalized.slice(0, 24);
  }

  return 'user';
}

export function createMailboxAddress(
  username: string,
  mailDomain: string,
): string {
  return `${username}@${mailDomain}`;
}
