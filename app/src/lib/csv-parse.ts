/** Hilangkan BOM UTF-8 dari awal file (umum pada CSV Excel). */
export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse one CSV line (supports quoted fields and escaped quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** Parse CSV text into row objects keyed by header names. */
export function parseSimpleCsv(raw: string): Array<Record<string, string>> {
  const lines = stripUtf8Bom(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      rec[key] = vals[j] ?? "";
    }
    rows.push(rec);
  }
  return rows;
}
