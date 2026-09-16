// §14/§18 of the product spec call for escalating urgency as an expiry
// deadline approaches (30/15/7/1 days before). Rather than create a new
// alert at each threshold — which would spam duplicate rows — the
// background job (alertGenerationService.js) finds-or-updates a single
// unresolved alert per subject and re-derives its severity from this
// pure function each run. Kept separate and DB-free so the escalation
// logic itself is directly unit-testable.
const severityForDaysUntil = (daysUntil) => {
  if (daysUntil <= 1) return 'CRITICAL';
  if (daysUntil <= 7) return 'HIGH';
  if (daysUntil <= 15) return 'MEDIUM';
  return 'LOW';
};

// Same escalation idea, distance-based — for the mileage-triggered
// maintenance reminder (§14's "Service due in 1,300 km" example).
const severityForDistanceUntil = (kmUntil) => {
  if (kmUntil <= 0) return 'CRITICAL';
  if (kmUntil <= 100) return 'HIGH';
  return 'MEDIUM';
};

module.exports = { severityForDaysUntil, severityForDistanceUntil };
