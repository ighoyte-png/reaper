import type { PresignedUpload, StorageHeadResult } from "@/lib/storage/types";

export type StorageObjectResult = {
  /** Web stream of object bytes (NextResponse-friendly). */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
};

export interface StorageProvider {
  readonly name: "r2";
  readonly bucket: string;
  createPresignedUpload(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<PresignedUpload>;
  createSignedDownloadUrl(
    key: string,
    options?: {
      expiresIn?: number;
      /** When set, ResponseContentDisposition forces a browser download. */
      downloadFilename?: string;
    },
  ): Promise<string>;
  /** Stream object bytes (for immutable avatar proxy, etc.). */
  getObject(key: string): Promise<StorageObjectResult>;
  head(key: string): Promise<StorageHeadResult>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  putObject(input: {
    key: string;
    body: Uint8Array | Buffer;
    contentType: string;
  }): Promise<void>;
}
