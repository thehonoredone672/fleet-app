// Every authenticated connection for an organization joins this one room;
// managers/viewers subscribe passively, drivers emit into it. Pure and
// DB-free so it's directly unit-testable.
const orgFleetRoom = (organizationId) => `org:${organizationId}:fleet`;

module.exports = { orgFleetRoom };
