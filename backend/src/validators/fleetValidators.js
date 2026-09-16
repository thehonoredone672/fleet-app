const { z } = require('zod');

const liveSnapshotQuerySchema = z.object({
  organizationId: z.string().trim().optional(),
});

module.exports = { liveSnapshotQuerySchema };
