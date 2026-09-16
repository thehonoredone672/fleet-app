const { createVehicleSchema, updateVehicleSchema, listVehiclesQuerySchema } = require('../src/validators/vehicleValidators');

describe('createVehicleSchema', () => {
  const valid = {
    registrationNumber: 'tn38ab1234',
    vehicleType: 'TRUCK',
    make: 'Tata',
    model: '407',
    year: 2022,
    fuelType: 'DIESEL',
  };

  test('accepts a valid payload and uppercases the registration number', () => {
    const result = createVehicleSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.registrationNumber).toBe('TN38AB1234');
  });

  test('rejects an invalid vehicleType', () => {
    const result = createVehicleSchema.safeParse({ ...valid, vehicleType: 'SPACESHIP' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid fuelType', () => {
    const result = createVehicleSchema.safeParse({ ...valid, fuelType: 'UNOBTANIUM' });
    expect(result.success).toBe(false);
  });

  test('rejects a year far in the future', () => {
    const result = createVehicleSchema.safeParse({ ...valid, year: 3000 });
    expect(result.success).toBe(false);
  });

  test('rejects a year before 1980', () => {
    const result = createVehicleSchema.safeParse({ ...valid, year: 1950 });
    expect(result.success).toBe(false);
  });

  test('rejects a negative capacity', () => {
    const result = createVehicleSchema.safeParse({ ...valid, capacity: -5 });
    expect(result.success).toBe(false);
  });

  test('coerces numeric-looking strings for year and capacity', () => {
    const result = createVehicleSchema.safeParse({ ...valid, year: '2020', capacity: '4' });
    expect(result.success).toBe(true);
    expect(result.data.year).toBe(2020);
    expect(result.data.capacity).toBe(4);
  });

  test('rejects a missing required field', () => {
    const { make, ...rest } = valid;
    const result = createVehicleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('updateVehicleSchema', () => {
  test('rejects an empty payload', () => {
    const result = updateVehicleSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('accepts a single-field status update', () => {
    const result = updateVehicleSchema.safeParse({ status: 'MAINTENANCE' });
    expect(result.success).toBe(true);
  });

  test('rejects an invalid status', () => {
    const result = updateVehicleSchema.safeParse({ status: 'FLYING' });
    expect(result.success).toBe(false);
  });
});

describe('listVehiclesQuerySchema', () => {
  test('applies default page and limit', () => {
    const result = listVehiclesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
  });

  test('rejects a limit above the max', () => {
    const result = listVehiclesQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });
});
