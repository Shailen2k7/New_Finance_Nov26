// pdf-parse v1 entry file has a debug side effect; import the library module directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number; info?: Record<string, unknown> }>;

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  try {
    const res = await pdfParse(buffer, { max: 0 });
    return { text: res.text ?? "", pages: res.numpages ?? 0 };
  } catch {
    return { text: "", pages: 0 };
  }
}
