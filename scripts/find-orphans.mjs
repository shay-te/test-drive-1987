// Lists exported symbols that nothing else in src/ imports or references (dead code).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE_DIRS = ['src'];
const ENTRY_POINTS = new Set(['src/main.js']);
const EXPORT_PATTERN = /export\s+(?:const|let|function\*?|class|async\s+function)\s+([A-Za-z_$][\w$]*)/g;

const listFiles = (dir) => {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? listFiles(path) : path.endsWith('.js') ? [path] : [];
    });
};

const files = SOURCE_DIRS.flatMap((dir) => {
    return listFiles(join(ROOT, dir));
});
const sources = new Map(
    files.map((file) => {
        return [file, readFileSync(file, 'utf8')];
    }),
);

const orphans = [];
for (const [file, text] of sources) {
    if (ENTRY_POINTS.has(relative(ROOT, file))) continue;
    for (const [, name] of text.matchAll(EXPORT_PATTERN)) {
        const word = new RegExp(`\\b${name.replace('$', '\\$')}\\b`);
        const usedElsewhere = [...sources].some(([other, otherText]) => {
            return other !== file && word.test(otherText);
        });
        const occurrences = text.match(new RegExp(`\\b${name}\\b`, 'g')).length;
        if (!usedElsewhere && occurrences < 2) orphans.push(`${relative(ROOT, file)}: ${name}`);
    }
}

if (orphans.length) {
    console.error(`Orphaned exports (${orphans.length}):\n  ${orphans.join('\n  ')}`);
    process.exit(1);
}
console.log('No orphaned exports.');
