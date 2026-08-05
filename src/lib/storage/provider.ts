import type { PresignedUpload, StorageHeadResult } from "@/lib/storage/types";

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
    expiresIn?: number,
  ): Promise<string>;
  head(key: string): Promise<StorageHeadResult>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  putObject(input: {
    key: string;
    body: Uint8Array | Buffer;
    contentType: string;
  }): Promise<void>;
}
