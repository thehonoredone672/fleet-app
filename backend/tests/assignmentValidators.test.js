const { createAssignmentSchema, listAssignmentsQuerySchema } = require('../src/validators/assignmentValidators');

describe('createAssignmentSchema', () => {
  test('accepts a valid payload', () => {
    const result = createAssignmentSchema.safeParse({ vehicleId: 'veh_1', driverId: 'drv_1' });
    expect(result.success).toBe(true);
  });

  test('rejects a missing vehicleId', () => {
    const result = createAssignmentSchema.safeParse({ driverId: 'drv_1' });
    expect(result.success).toBe(false);
  });

  test('rejects a missing driverId', () => {
    const result = createAssignmentSchema.safeParse({ vehicleId: 'veh_1' });
    expect(result.success).toBe(false);
  });
});

describe('listAssignmentsQuerySchema', () => {
  test('applies default page and limit and coerces isActive', () => {
    const result = listAssignmentsQuerySchema.safeParse({ isActive: 'true' });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.isActive).toBe(true);
  });
});
