import { LoggingInterceptor } from './logging.interceptor.js';

describe('LoggingInterceptor', () => {
  it('should be defined', () => {
    expect(new LoggingInterceptor()).toBeDefined();
  });
});
