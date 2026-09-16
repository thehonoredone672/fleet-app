const { assertTransition } = require('../src/utils/tripStateMachine');
const AppError = require('../src/utils/AppError');

const tripWith = (status) => ({ status });

describe('trip state machine', () => {
  test('start: SCHEDULED -> IN_PROGRESS', () => {
    expect(assertTransition(tripWith('SCHEDULED'), 'start')).toBe('IN_PROGRESS');
  });

  test('start fails from any state other than SCHEDULED', () => {
    for (const status of ['IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']) {
      expect(() => assertTransition(tripWith(status), 'start')).toThrow(AppError);
    }
  });

  test('pause: IN_PROGRESS -> PAUSED, and resume: PAUSED -> IN_PROGRESS', () => {
    expect(assertTransition(tripWith('IN_PROGRESS'), 'pause')).toBe('PAUSED');
    expect(assertTransition(tripWith('PAUSED'), 'resume')).toBe('IN_PROGRESS');
  });

  test('end succeeds from IN_PROGRESS or PAUSED, not from SCHEDULED', () => {
    expect(assertTransition(tripWith('IN_PROGRESS'), 'end')).toBe('COMPLETED');
    expect(assertTransition(tripWith('PAUSED'), 'end')).toBe('COMPLETED');
    expect(() => assertTransition(tripWith('SCHEDULED'), 'end')).toThrow(AppError);
  });

  test('a completed trip cannot be started again (§48)', () => {
    expect(() => assertTransition(tripWith('COMPLETED'), 'start')).toThrow(/Cannot start a trip that is COMPLETED/);
  });

  test('a cancelled trip cannot be completed (§48)', () => {
    expect(() => assertTransition(tripWith('CANCELLED'), 'end')).toThrow(/Cannot end a trip that is CANCELLED/);
  });

  test('cancel succeeds from SCHEDULED, IN_PROGRESS, or PAUSED, not from a terminal state', () => {
    for (const status of ['SCHEDULED', 'IN_PROGRESS', 'PAUSED']) {
      expect(assertTransition(tripWith(status), 'cancel')).toBe('CANCELLED');
    }
    expect(() => assertTransition(tripWith('COMPLETED'), 'cancel')).toThrow(AppError);
    expect(() => assertTransition(tripWith('CANCELLED'), 'cancel')).toThrow(AppError);
  });

  test('thrown errors carry a 400 status code', () => {
    try {
      assertTransition(tripWith('COMPLETED'), 'start');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });
});
