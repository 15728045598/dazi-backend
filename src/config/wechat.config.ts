export const WechatConfig = () => ({
  wechat: {
    appid: process.env.WECHAT_APPID,
    secret: process.env.WECHAT_SECRET,
    mchid: process.env.WECHAT_MCHID,
    apiKey: process.env.WECHAT_APIKEY,
    partnerKey: process.env.WECHAT_PARTNER_KEY,
    notifyUrl: process.env.WECHAT_NOTIFY_URL,
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET || 'dazai',
  },
});
