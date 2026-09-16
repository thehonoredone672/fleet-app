const { can } = require('../src/constants/permissions');

describe('permissions.can', () => {
  test('SUPER_ADMIN can do everything defined for users', () => {
    expect(can('SUPER_ADMIN', 'users', 'create')).toBe(true);
    expect(can('SUPER_ADMIN', 'users', 'read')).toBe(true);
    expect(can('SUPER_ADMIN', 'users', 'update')).toBe(true);
    expect(can('SUPER_ADMIN', 'users', 'delete')).toBe(true);
  });

  test('FLEET_ADMIN has full users management', () => {
    expect(can('FLEET_ADMIN', 'users', 'create')).toBe(true);
    expect(can('FLEET_ADMIN', 'users', 'delete')).toBe(true);
  });

  test('FLEET_MANAGER and VIEWER can only read users', () => {
    expect(can('FLEET_MANAGER', 'users', 'read')).toBe(true);
    expect(can('FLEET_MANAGER', 'users', 'create')).toBe(false);
    expect(can('VIEWER', 'users', 'read')).toBe(true);
    expect(can('VIEWER', 'users', 'delete')).toBe(false);
  });

  test('DRIVER has no users permissions', () => {
    expect(can('DRIVER', 'users', 'read')).toBe(false);
    expect(can('DRIVER', 'users', 'create')).toBe(false);
  });

  test('unknown role/resource/action combinations are false, not throwing', () => {
    expect(can('NOT_A_ROLE', 'users', 'read')).toBe(false);
    expect(can('VIEWER', 'not_a_resource', 'read')).toBe(false);
    expect(can('VIEWER', 'users', 'not_an_action')).toBe(false);
  });
});

describe('permissions.can — vehicles', () => {
  test('SUPER_ADMIN and FLEET_ADMIN have full vehicle management', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN']) {
      expect(can(role, 'vehicles', 'create')).toBe(true);
      expect(can(role, 'vehicles', 'read')).toBe(true);
      expect(can(role, 'vehicles', 'update')).toBe(true);
      expect(can(role, 'vehicles', 'delete')).toBe(true);
    }
  });

  test('FLEET_MANAGER can read and update but not create or delete vehicles', () => {
    expect(can('FLEET_MANAGER', 'vehicles', 'read')).toBe(true);
    expect(can('FLEET_MANAGER', 'vehicles', 'update')).toBe(true);
    expect(can('FLEET_MANAGER', 'vehicles', 'create')).toBe(false);
    expect(can('FLEET_MANAGER', 'vehicles', 'delete')).toBe(false);
  });

  test('VIEWER can only read vehicles', () => {
    expect(can('VIEWER', 'vehicles', 'read')).toBe(true);
    expect(can('VIEWER', 'vehicles', 'update')).toBe(false);
  });

  test('DRIVER has no blanket vehicles permission', () => {
    expect(can('DRIVER', 'vehicles', 'read')).toBe(false);
  });
});

describe('permissions.can — drivers', () => {
  test('SUPER_ADMIN and FLEET_ADMIN have full driver management', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN']) {
      expect(can(role, 'drivers', 'create')).toBe(true);
      expect(can(role, 'drivers', 'delete')).toBe(true);
    }
  });

  test('FLEET_MANAGER can read and update but not create or delete drivers', () => {
    expect(can('FLEET_MANAGER', 'drivers', 'read')).toBe(true);
    expect(can('FLEET_MANAGER', 'drivers', 'update')).toBe(true);
    expect(can('FLEET_MANAGER', 'drivers', 'create')).toBe(false);
    expect(can('FLEET_MANAGER', 'drivers', 'delete')).toBe(false);
  });

  test('VIEWER can only read drivers', () => {
    expect(can('VIEWER', 'drivers', 'read')).toBe(true);
    expect(can('VIEWER', 'drivers', 'update')).toBe(false);
  });

  test('DRIVER has no blanket drivers permission (self-access is a separate /drivers/me route)', () => {
    expect(can('DRIVER', 'drivers', 'read')).toBe(false);
  });
});

describe('permissions.can — assignments', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, and FLEET_MANAGER can create/read/update assignments', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'assignments', 'create')).toBe(true);
      expect(can(role, 'assignments', 'read')).toBe(true);
      expect(can(role, 'assignments', 'update')).toBe(true);
    }
  });

  test('VIEWER can only read assignments', () => {
    expect(can('VIEWER', 'assignments', 'read')).toBe(true);
    expect(can('VIEWER', 'assignments', 'create')).toBe(false);
  });

  test('DRIVER has no assignments permission', () => {
    expect(can('DRIVER', 'assignments', 'read')).toBe(false);
  });

  test('nobody has a delete action on assignments — they are never removed, only unassigned', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER', 'VIEWER']) {
      expect(can(role, 'assignments', 'delete')).toBe(false);
    }
  });
});

describe('permissions.can — trips', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, and FLEET_MANAGER can create/read/update trips', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'trips', 'create')).toBe(true);
      expect(can(role, 'trips', 'read')).toBe(true);
      expect(can(role, 'trips', 'update')).toBe(true);
    }
  });

  test('VIEWER can only read trips', () => {
    expect(can('VIEWER', 'trips', 'read')).toBe(true);
    expect(can('VIEWER', 'trips', 'create')).toBe(false);
  });

  test('DRIVER has no blanket trips permission (start/pause/resume/end are ownership-checked, not matrix-checked)', () => {
    expect(can('DRIVER', 'trips', 'read')).toBe(false);
    expect(can('DRIVER', 'trips', 'create')).toBe(false);
  });
});

describe('permissions.can — maintenance', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, and FLEET_MANAGER can create/read/update maintenance records', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'maintenance', 'create')).toBe(true);
      expect(can(role, 'maintenance', 'read')).toBe(true);
      expect(can(role, 'maintenance', 'update')).toBe(true);
    }
  });

  test('VIEWER can only read maintenance records', () => {
    expect(can('VIEWER', 'maintenance', 'read')).toBe(true);
    expect(can('VIEWER', 'maintenance', 'create')).toBe(false);
  });

  test('DRIVER has no maintenance permission', () => {
    expect(can('DRIVER', 'maintenance', 'read')).toBe(false);
  });
});

describe('permissions.can — fuel', () => {
  test('admin-tier and manager roles can read/update but not create fuel records via the matrix', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'fuel', 'read')).toBe(true);
      expect(can(role, 'fuel', 'update')).toBe(true);
      expect(can(role, 'fuel', 'create')).toBe(false);
    }
  });

  test('VIEWER can only read fuel records', () => {
    expect(can('VIEWER', 'fuel', 'read')).toBe(true);
    expect(can('VIEWER', 'fuel', 'update')).toBe(false);
  });

  test('DRIVER has no matrix-level fuel permission (submission is ownership-gated, not matrix-gated)', () => {
    expect(can('DRIVER', 'fuel', 'read')).toBe(false);
    expect(can('DRIVER', 'fuel', 'create')).toBe(false);
  });
});

describe('permissions.can — expenses', () => {
  test('SUPER_ADMIN and FLEET_ADMIN can create/read/update/approve expenses', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN']) {
      expect(can(role, 'expenses', 'create')).toBe(true);
      expect(can(role, 'expenses', 'read')).toBe(true);
      expect(can(role, 'expenses', 'update')).toBe(true);
      expect(can(role, 'expenses', 'approve')).toBe(true);
    }
  });

  test('FLEET_MANAGER can create/read/update but not approve', () => {
    expect(can('FLEET_MANAGER', 'expenses', 'create')).toBe(true);
    expect(can('FLEET_MANAGER', 'expenses', 'update')).toBe(true);
    expect(can('FLEET_MANAGER', 'expenses', 'approve')).toBe(false);
  });

  test('VIEWER can only read expenses', () => {
    expect(can('VIEWER', 'expenses', 'read')).toBe(true);
    expect(can('VIEWER', 'expenses', 'approve')).toBe(false);
  });

  test('DRIVER has no matrix-level expenses permission (their submission is ownership-gated)', () => {
    expect(can('DRIVER', 'expenses', 'create')).toBe(false);
    expect(can('DRIVER', 'expenses', 'approve')).toBe(false);
  });
});

describe('permissions.can — documents', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, and FLEET_MANAGER have full document CRUD', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'documents', 'create')).toBe(true);
      expect(can(role, 'documents', 'read')).toBe(true);
      expect(can(role, 'documents', 'update')).toBe(true);
      expect(can(role, 'documents', 'delete')).toBe(true);
    }
  });

  test('VIEWER can only read documents', () => {
    expect(can('VIEWER', 'documents', 'read')).toBe(true);
    expect(can('VIEWER', 'documents', 'create')).toBe(false);
  });

  test('DRIVER has no matrix-level documents permission (their own-record access is ownership-gated)', () => {
    expect(can('DRIVER', 'documents', 'create')).toBe(false);
    expect(can('DRIVER', 'documents', 'read')).toBe(false);
  });
});

describe('permissions.can — alerts', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, and FLEET_MANAGER can read and resolve alerts', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER']) {
      expect(can(role, 'alerts', 'read')).toBe(true);
      expect(can(role, 'alerts', 'resolve')).toBe(true);
    }
  });

  test('VIEWER can only read alerts', () => {
    expect(can('VIEWER', 'alerts', 'read')).toBe(true);
    expect(can('VIEWER', 'alerts', 'resolve')).toBe(false);
  });

  test('DRIVER has no alerts permission', () => {
    expect(can('DRIVER', 'alerts', 'read')).toBe(false);
  });
});

describe('permissions.can — geofences', () => {
  test('SUPER_ADMIN and FLEET_ADMIN have full geofence CRUD', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN']) {
      expect(can(role, 'geofences', 'create')).toBe(true);
      expect(can(role, 'geofences', 'delete')).toBe(true);
    }
  });

  test('FLEET_MANAGER can read and update but not create or delete', () => {
    expect(can('FLEET_MANAGER', 'geofences', 'read')).toBe(true);
    expect(can('FLEET_MANAGER', 'geofences', 'update')).toBe(true);
    expect(can('FLEET_MANAGER', 'geofences', 'create')).toBe(false);
    expect(can('FLEET_MANAGER', 'geofences', 'delete')).toBe(false);
  });

  test('VIEWER can only read geofences', () => {
    expect(can('VIEWER', 'geofences', 'read')).toBe(true);
    expect(can('VIEWER', 'geofences', 'update')).toBe(false);
  });

  test('DRIVER has no geofences permission', () => {
    expect(can('DRIVER', 'geofences', 'read')).toBe(false);
  });
});

describe('permissions.can — reports', () => {
  test('SUPER_ADMIN, FLEET_ADMIN, FLEET_MANAGER, and VIEWER can all read reports', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER', 'VIEWER']) {
      expect(can(role, 'reports', 'read')).toBe(true);
    }
  });

  test('DRIVER has no reports permission', () => {
    expect(can('DRIVER', 'reports', 'read')).toBe(false);
  });
});
