import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Supabase Storage exposes an S3-compatible protocol. We talk to it with the plain AWS
// S3 SDK rather than the @supabase/* packages, since what we were given is an S3 access
// key/secret pair for that endpoint, not a Supabase service-role key.
const endpoint = process.env.SUPABASE_S3_ENDPOINT;
const region = process.env.SUPABASE_S3_REGION;
const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET;

let client: S3Client | null = null;

function getClient() {
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Supabase S3 storage is not configured (missing SUPABASE_S3_* env vars).");
  }
  if (!client) {
    client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Required for S3-compatible endpoints that aren't AWS itself (Supabase, MinIO, ...).
      forcePathStyle: true,
    });
  }
  return client;
}

function getBucket() {
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET is not configured.");
  return bucket;
}

/** Uploads a file's bytes to the configured bucket under `key` and returns that key. */
export async function uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: buffer, ContentType: contentType })
  );
  return key;
}

/** Generates a short-lived (1 hour) signed URL to read back a previously-uploaded file. */
export async function getSignedDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn: 3600 });
}

/**
 * Distinguishes a real storage object key (produced by `uploadFile`) from a legacy
 * manually-pasted URL, so old rows entered before uploads existed keep rendering as a
 * plain external link instead of being run through the signer.
 */
export function isStorageKey(value: string): boolean {
  return !/^https?:\/\//i.test(value);
}

/** Builds a namespaced object key for an upload, e.g. `payments/<uuid>-receipt.jpg`. */
export function buildKey(folder: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${folder}/${randomUUID()}-${safeName}`;
}
