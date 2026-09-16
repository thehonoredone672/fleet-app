const authorize = require('../src/middleware/authorize');
const AppError = require('../src/utils/AppError');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('authorize middleware', () => {
  test('calls next with a 401 AppError if req.user is missing', () => {
    const middleware = authorize('users', 'read');
    const next = jest.fn();
    middleware({ user: undefined }, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('calls next with a 403 AppError if the role lacks permission', () => {
    const middleware = authorize('users', 'create');
    const next = jest.fn();
    middleware({ user: { role: 'DRIVER' } }, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('calls next with no error if the role has permission', () => {
    const middleware = authorize('users', 'read');
    const next = jest.fn();
    middleware({ user: { role: 'VIEWER' } }, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });
});
