import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Config } from "@/lib/storage/config";
import type { StorageProvider } from "@/lib/storage/provider";
import type { PresignedUpload, StorageHeadResult } from "@/lib/storage/types";

let cached: { client: S3Client; bucket: string; ttl: number } | null = null;

function getClient() {
  if (cached) return cached;
  const cfg = getR2Config();
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  cached = {
    client,
    bucket: cfg.bucket,
    ttl: cfg.signedUrlTtl,
  };
  return cached;
}

export function createR2StorageProvider(): StorageProvider {
  const { client, bucket, ttl } = getClient();

  return {
    name: "r2",
    bucket,

    async createPresignedUpload(input): Promise<PresignedUpload> {
      const expiresIn = input.expiresIn ?? 600;
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      return {
        uploadUrl,
        headers: {
          "Content-Type": input.contentType,
        },
        expiresIn,
      };
    },

    async createSignedDownloadUrl(key, options = {}): Promise<string> {
      const expiresIn = options.expiresIn ?? ttl;
      const filename = options.downloadFilename?.trim();
      let contentDisposition: string | undefined;
      if (filename) {
        const ascii = filename
          .replace(/[^\x20-\x7E]/g, "_")
          .replace(/["\\]/g, "_");
        contentDisposition = `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
      }
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(contentDisposition
          ? { ResponseContentDisposition: contentDisposition }
          : {}),
      });
      return getSignedUrl(client, command, { expiresIn });
    },

    async head(key): Promise<StorageHeadResult> {
      try {
        const out = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          exists: true,
          contentLength: out.ContentLength,
          contentType: out.ContentType,
        };
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "NotFound" || name === "NoSuchKey") {
          return { exists: false };
        }
        const status = (err as { $metadata?: { httpStatusCode?: number } })
          ?.$metadata?.httpStatusCode;
        if (status === 404) return { exists: false };
        throw err;
      }
    },

    async exists(key): Promise<boolean> {
      const h = await this.head(key);
      return h.exists;
    },

    async deleteObject(key): Promise<void> {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    },

    async putObject(input): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    },
  };
}
