const { orgFleetRoom } = require('../src/sockets/rooms');

describe('orgFleetRoom', () => {
  test('produces a stable, namespaced room name', () => {
    expect(orgFleetRoom('org_123')).toBe('org:org_123:fleet');
  });

  test('different organizations get different rooms', () => {
    expect(orgFleetRoom('org_1')).not.toBe(orgFleetRoom('org_2'));
  });
});
