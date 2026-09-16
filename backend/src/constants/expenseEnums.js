// Mirrors the Prisma Expense-related enums.
const EXPENSE_CATEGORIES = [
  'FUEL',
  'MAINTENANCE',
  'TOLL',
  'PARKING',
  'REPAIR',
  'INSURANCE',
  'PERMIT',
  'MISCELLANEOUS',
];
const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

module.exports = { EXPENSE_CATEGORIES, EXPENSE_STATUSES };
