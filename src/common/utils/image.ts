import { ConfigService } from '@nestjs/config';

/**
 * 修复图片URL：转换为完整URL供小程序/前端使用
 * 数据库存储 /uploads/xxx，静态文件服务 /uploads/xxx
 */
export function fixImageUrl(url: string | null | undefined, baseUrl?: string): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  
  if (url.startsWith('/uploads/')) {
    // 转换为完整URL: /uploads/xxx -> http://localhost:3000/uploads/xxx
    return `${baseUrl}${url}`;
  }
  return url;
}

/**
 * 修复图片URL数组
 */
export function fixImageUrls(urls: (string | null | undefined)[] | null | undefined, baseUrl?: string): string[] {
  if (!urls) return [];
  return urls.map(url => fixImageUrl(url, baseUrl) || '').filter(Boolean);
}

/**
 * 从ConfigService获取基础URL
 */
export function getBaseUrl(config: ConfigService): string {
  const port = config.get<string>('PORT') || '3000';
  return `http://localhost:${port}`;
}
