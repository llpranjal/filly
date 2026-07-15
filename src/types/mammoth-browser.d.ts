declare module "mammoth/mammoth.browser.js" {
  export interface RawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
}
