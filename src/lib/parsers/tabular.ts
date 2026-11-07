import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Cell = string | number | null;
export type Grid = Cell[][];

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Parses a CSV/TSV/TXT buffer into a 2D grid of raw strings. Never coerces numbers. */
export function parseCsv(buffer: Buffer): Grid {
  let text = stripBom(buffer.toString("utf8"));
  if (text.includes("�")) text = buffer.toString("latin1");
  const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", dynamicTyping: false });
  return res.data.map((row) => row.map((c) => (c === undefined || c === null ? "" : String(c))));
}

/** Parses an XLSX/XLS buffer. Chooses the sheet with the most non-empty rows. Dates come back as JS Dates. */
export function parseXlsx(buffer: Buffer): { sheetName: string; grid: Grid; sheets: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  let best: { name: string; grid: Grid } | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
    const grid: Grid = rows.map((r) =>
      r.map((c) => {
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        if (c === undefined) return null;
        return c as Cell;
      }),
    );
    const nonEmpty = grid.filter((r) => r.some((c) => c !== null && String(c).trim() !== "")).length;
    if (!best || nonEmpty > best.grid.length) best = { name, grid };
  }
  return { sheetName: best?.name ?? "", grid: best?.grid ?? [], sheets: wb.SheetNames };
}

export function gridToText(grid: Grid, maxRows = 40): string {
  return grid
    .slice(0, maxRows)
    .map((r, i) => `${i}\t` + r.map((c) => (c === null ? "" : String(c))).join(" | "))
    .join("\n");
}
