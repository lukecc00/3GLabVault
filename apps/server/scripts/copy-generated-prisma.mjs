import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(appRoot, 'src', 'generated', 'prisma');
const targetDir = path.join(appRoot, 'dist', 'generated', 'prisma');

if (!existsSync(sourceDir)) {
  throw new Error(`Prisma client not found at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(path.dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
