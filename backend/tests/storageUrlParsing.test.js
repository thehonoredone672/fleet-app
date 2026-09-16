const { extractCloudinaryPublicId, extractS3Key } = require('../src/utils/storageUrlParsing');

describe('extractCloudinaryPublicId', () => {
  test('extracts folder/name from a versioned URL', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1700000000/documents/org_1/vehicle_2/photo.jpg';
    expect(extractCloudinaryPublicId(url)).toBe('documents/org_1/vehicle_2/photo');
  });

  test('extracts folder/name from a URL without a version segment', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/documents/org_1/photo.png';
    expect(extractCloudinaryPublicId(url)).toBe('documents/org_1/photo');
  });

  test('returns null for a URL with no /upload/ segment', () => {
    expect(extractCloudinaryPublicId('https://example.com/not-cloudinary.jpg')).toBeNull();
  });
});

describe('extractS3Key', () => {
  test('extracts the object key from a virtual-hosted-style URL', () => {
    const url = 'https://my-bucket.s3.us-east-1.amazonaws.com/documents/org_1/vehicle_2/1700000000-abc.pdf';
    expect(extractS3Key(url)).toBe('documents/org_1/vehicle_2/1700000000-abc.pdf');
  });

  test('decodes URL-encoded characters in the key', () => {
    const url = 'https://my-bucket.s3.us-east-1.amazonaws.com/documents/file%20name.pdf';
    expect(extractS3Key(url)).toBe('documents/file name.pdf');
  });

  test('returns null for an unparseable URL', () => {
    expect(extractS3Key('not a url at all')).toBeNull();
  });
});
