/**
 * F7-3: validasi nama file di supabase/migrations/*.sql (awalan NNNN_, tanpa duplikat).
 * Jalankan dari root repo: node scripts/verify-migration-files.mjs
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const migDir = join(__dirname, "..", "supabase", "migrations");

let names;
try {
  names = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
} catch (e) {
  console.error("ERROR: tidak bisa membaca", migDir, e.message);
  process.exit(1);
}

if (names.length === 0) {
  console.error("ERROR: tidak ada file .sql di", migDir);
  process.exit(1);
}

const re = /^[0-9]{4}_.+\.sql$/;
for (const n of names) {
  if (!re.test(n)) {
    console.error(
      "ERROR: nama migration tidak valid (harus 0001_nama.sql):",
      n
    );
    process.exit(1);
  }
}

if (new Set(names).size !== names.length) {
  console.error("ERROR: nama file migration duplikat");
  process.exit(1);
}

const sorted = [...names].sort();
const prefixes = sorted.map((n) => n.slice(0, 4));
const uniquePrefixes = new Set(prefixes);
if (uniquePrefixes.size !== prefixes.length) {
  console.error(
    "ERROR: awalan 4 digit duplikat — setiap migration harus punya nomor unik"
  );
  process.exit(1);
}

console.log(`OK: ${names.length} file migration di ${migDir}`);
