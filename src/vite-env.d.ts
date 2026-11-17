/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser.js' {
  interface ExtractResult {
    value: string;
    messages: unknown[];
  }
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
  };
  export default mammoth;
}
