import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import * as mammoth from "mammoth/mammoth.browser.js";
import { parseResumeText, type ResumeParseResult } from "./parse-text";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");

async function extractPdf(bytes: ArrayBuffer): Promise<string> {
  const loading = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loading.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current = "";
    let previousY: number | undefined;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (previousY !== undefined && Math.abs(y - previousY) > 2 && current.trim()) {
        lines.push(current.trim());
        current = "";
      }
      current += `${item.str} `;
      previousY = y;
      if (item.hasEOL && current.trim()) {
        lines.push(current.trim());
        current = "";
        previousY = undefined;
      }
    }
    if (current.trim()) lines.push(current.trim());
    pages.push(lines.join("\n"));
  }
  await loading.destroy();
  return pages.join("\n\n");
}

async function extractDocx(bytes: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: bytes });
  return result.value;
}

export async function parseResumeFile(file: File, bytes: ArrayBuffer): Promise<ResumeParseResult> {
  const name = file.name.toLowerCase();
  let text: string;
  if (file.type === "application/pdf" || name.endsWith(".pdf")) text = await extractPdf(bytes);
  else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) text = await extractDocx(bytes);
  else if (file.type.startsWith("text/") || name.endsWith(".txt")) text = new TextDecoder().decode(bytes);
  else throw new Error("Local resume parsing supports PDF, DOCX, and TXT files. Legacy .doc files must be saved as DOCX or PDF first.");
  if (text.trim().length < 40) throw new Error("The resume contains too little extractable text. It may be a scanned image; OCR is not enabled.");
  return parseResumeText(text);
}
