const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { S3Client, DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { extractCloudinaryPublicId, extractS3Key } = require('../utils/storageUrlParsing');

const UPLOAD_URL_TTL_SECONDS = 300;

// Provider-agnostic per §36 of the product spec: business logic (the
// Document service) never talks to Cloudinary/S3 directly, only through
// this module, and switching STORAGE_PROVIDER doesn't touch callers.
//
// Files never pass through this Node process. Both providers issue a
// short-lived signed credential the *client* uploads directly to (a
// signed Cloudinary upload form, or a presigned S3 PUT URL) — see
// docs/architecture.md#security. The backend only ever sees the
// resulting fileUrl, passed back when the client creates the Document
// record.

const buildKey = (folder) => {
  const random = crypto.randomBytes(8).toString('hex');
  return `${folder}/${Date.now()}-${random}`;
};

const getCloudinaryUploadCredentials = (folder) => {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError('File storage is not configured', 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { timestamp, folder };
  // Pure, deterministic, no network call — this is what makes the
  // signing logic testable without a live Cloudinary account.
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    provider: 'cloudinary',
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    fields: { apiKey, timestamp, signature, folder },
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  };
};

const getS3UploadCredentials = async (folder, contentType) => {
  const { bucket, accessKeyId, secretAccessKey, region } = env.s3;
  if (!bucket || !accessKeyId || !secretAccessKey || !region) {
    throw new AppError('File storage is not configured', 500);
  }

  const key = buildKey(folder);
  const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return {
    provider: 's3',
    uploadUrl,
    fileUrl: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  };
};

// `folder` scopes uploads per-organization (and optionally per-subject) so
// files are organized and a future bulk-cleanup/export is straightforward
// — e.g. `documents/org_123/vehicle_456`.
const getUploadCredentials = async ({ folder, contentType }) => {
  if (env.storageProvider === 'cloudinary') return getCloudinaryUploadCredentials(folder);
  if (env.storageProvider === 's3') return getS3UploadCredentials(folder, contentType);
  throw new AppError(`Unknown storage provider: ${env.storageProvider}`, 500);
};

const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    if (fileUrl.includes('cloudinary.com')) {
      const publicId = extractCloudinaryPublicId(fileUrl);
      if (!publicId) return;
      cloudinary.config({
        cloud_name: env.cloudinary.cloudName,
        api_key: env.cloudinary.apiKey,
        api_secret: env.cloudinary.apiSecret,
      });
      await cloudinary.uploader.destroy(publicId);
    } else if (fileUrl.includes('.s3.') || fileUrl.includes('.amazonaws.com')) {
      const key = extractS3Key(fileUrl);
      if (!key) return;
      const client = new S3Client({
        region: env.s3.region,
        credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
      });
      await client.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    }
  } catch (err) {
    // A failed remote delete shouldn't block removing the Document
    // record — the DB is the source of truth for what's "attached" to a
    // vehicle/driver; an orphaned file in storage is a cleanup concern,
    // not a correctness one.
    logger.error('storageService.deleteFile failed', { message: err.message, fileUrl });
  }
};

module.exports = { getUploadCredentials, deleteFile };
