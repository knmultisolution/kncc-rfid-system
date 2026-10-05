export type CsvRow = Record<string, string>;

function normalizeHeader(value: string) {
  return value
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: CsvRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  return "\ufeff" + lines.join("\r\n");
}

export function downloadCsv(filename: string, rows: CsvRow[]) {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values) => {
    const result: CsvRow = {};
    headers.forEach((header, index) => {
      if (header) result[header] = (values[index] ?? "").trim();
    });
    return result;
  });
}

export function firstValue(row: CsvRow, ...aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] != null && row[key] !== "") return row[key].trim();
  }
  return "";
}
