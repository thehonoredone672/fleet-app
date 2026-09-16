const { z } = require('zod');

// Shared by every report/dashboard endpoint — defaulting (last 30 days
// when omitted) happens in the service layer via utils/dateRange.js, not
// here, since "now" needs to be evaluated at request time.
const reportQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

const driverReportQuerySchema = reportQuerySchema.extend({
  driverId: z.string().trim().optional(),
});

module.exports = { reportQuerySchema, driverReportQuerySchema };
