// Pure URL parsing, no network/SDK calls — extracts the provider-specific
// identifier needed to delete a file from its public fileUrl. Kept
// separate from storageService.js so this logic is directly unit-testable
// without touching Cloudinary/AWS.
const extractCloudinaryPublicId = (fileUrl) => {
  // .../upload/v1234567890/folder/name.ext -> folder/name
  const match = fileUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
};

const extractS3Key = (fileUrl) => {
  try {
    return decodeURIComponent(new URL(fileUrl).pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
};

module.exports = { extractCloudinaryPublicId, extractS3Key };
