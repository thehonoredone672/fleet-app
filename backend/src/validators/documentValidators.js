const { z } = require('zod');
const { DOCUMENT_TYPES } = require('../constants/documentEnums');

// A Document belongs to exactly one of vehicleId/driverId — never both,
// never neither (see docs/database.md#document-ownership). Both requests
// that establish "what this document is for" (requesting upload
// credentials, and creating the record) enforce this with the same
// refine.
const exactlyOneSubject = (data, ctx) => {
  const count = [data.vehicleId, data.driverId].filter(Boolean).length;
  if (count !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one of vehicleId or driverId' });
  }
};

const uploadCredentialsSchema = z
  .object({
    vehicleId: z.string().trim().min(1).optional(),
    driverId: z.string().trim().min(1).optional(),
    contentType: z.string().trim().min(1).optional(),
  })
  .superRefine(exactlyOneSubject);

const createDocumentSchema = z
  .object({
    vehicleId: z.string().trim().min(1).optional(),
    driverId: z.string().trim().min(1).optional(),
    type: z.enum(DOCUMENT_TYPES, { errorMap: () => ({ message: 'Invalid document type' }) }),
    documentNumber: z.string().trim().max(100).optional(),
    issueDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    fileUrl: z.string().trim().url('fileUrl must be a valid URL — upload to storage first'),
  })
  .superRefine(exactlyOneSubject);

const updateDocumentSchema = z
  .object({
    documentNumber: z.string().trim().max(100).optional(),
    issueDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    fileUrl: z.string().trim().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listDocumentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  expiringBefore: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { uploadCredentialsSchema, createDocumentSchema, updateDocumentSchema, listDocumentQuerySchema };
