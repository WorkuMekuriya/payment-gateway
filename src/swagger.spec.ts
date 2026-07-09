import { isSwaggerEnabled } from './swagger';

describe('isSwaggerEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it.each(['development', 'Development', 'DEVELOPMENT'])(
    'returns true when NODE_ENV is %s',
    (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;
      expect(isSwaggerEnabled()).toBe(true);
    },
  );

  it.each(['production', 'Production', 'staging', 'test', undefined])(
    'returns false when NODE_ENV is %s',
    (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;
      expect(isSwaggerEnabled()).toBe(false);
    },
  );
});
