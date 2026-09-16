// Shared "last N days unless the caller specifies otherwise" resolver for
// every reports/dashboard endpoint — pure and DB-free, so the defaulting
// behavior is directly unit-testable without touching Prisma.
const DEFAULT_WINDOW_DAYS = 30;

const resolveDateRange = ({ dateFrom, dateTo } = {}, defaultDays = DEFAULT_WINDOW_DAYS) => {
  const to = dateTo || new Date();
  const from = dateFrom || new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to };
};

module.exports = { resolveDateRange, DEFAULT_WINDOW_DAYS };
