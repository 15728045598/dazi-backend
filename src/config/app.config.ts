export const AppConfig = () => ({
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  app: {
    name: process.env.APP_NAME || '搭子小程序',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE ?? '10485760', 10) || 10 * 1024 * 1024, // 10MB
    allowedTypes: process.env.UPLOAD_ALLOWED_TYPES?.split(',') || [
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  },
});
