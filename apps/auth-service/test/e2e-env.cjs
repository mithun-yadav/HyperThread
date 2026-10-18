process.env.PORT = '4000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5000';
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-at-least-32-characters';
process.env.INTERNAL_API_KEY =
  'test-internal-api-key-at-least-32-chars';
