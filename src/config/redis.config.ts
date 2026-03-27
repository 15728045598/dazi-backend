export const RedisConfig = () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB ?? '0', 10) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'dazai:',
  },
});
