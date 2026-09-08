/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare module 'bwip-js' {
  export interface ToBufferOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    backgroundcolor?: string;
    [key: string]: any;
  }
  export function toBuffer(opts: ToBufferOptions): Promise<Buffer>;
  export function toSVG(opts: ToBufferOptions): string;
  const bwipjs: {
    toBuffer(opts: ToBufferOptions): Promise<Buffer>;
    toSVG(opts: ToBufferOptions): string;
  };
  export default bwipjs;
}
