import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OSS from 'ali-oss';

@Injectable()
export class UploadService {
  private ossClient: OSS | null = null;
  private bucket: string;
  private endpoint: string;
  private customDomain: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('aliyun.oss.bucket') || '';
    // 去除 .aliyuncs.com 后缀，只保留区域ID如 oss-cn-shanghai
    const rawEndpoint = this.config.get<string>('aliyun.oss.endpoint') || '';
    this.endpoint = rawEndpoint.replace('.aliyuncs.com', '');
    this.customDomain = this.config.get<string>('aliyun.oss.customDomain') || '';

    // 初始化OSS客户端（配置齐全时才初始化）
    const accessKeyId = this.config.get<string>('aliyun.oss.accessKeyId');
    const accessKeySecret = this.config.get<string>('aliyun.oss.accessKeySecret');

    if (accessKeyId && accessKeySecret && this.bucket && this.endpoint) {
      this.ossClient = new OSS({
        region: this.endpoint,
        bucket: this.bucket,
        accessKeyId,
        accessKeySecret,
      });
    }
  }

  private getPublicUrl(key: string): string {
    // 如果配置了自定义域名，使用自定义域名
    if (this.customDomain) {
      return `https://${this.customDomain}/${key}`;
    }
    // 否则使用OSS默认公网地址 (需要加 .aliyuncs.com)
    return `https://${this.bucket}.${this.endpoint}.aliyuncs.com/${key}`;
  }

  presign(filename: string, contentType?: string) {
    const date = new Date().toISOString().slice(0, 10);
    const key = `${date}/${randomUUID()}-${filename}`;
    
    if (!this.ossClient) {
      // OSS未配置时返回模拟地址
      return {
        uploadUrl: `https://${this.bucket}.${this.endpoint}/${key}`,
        publicUrl: this.getPublicUrl(key),
        key,
        method: 'PUT',
        headers: { 'Content-Type': contentType || 'application/octet-stream' },
        note: 'OSS未配置，返回模拟地址',
      };
    }

    // 生成OSS签名URL
    const url = this.ossClient.signatureUrl(key, { expires: 3600, method: 'PUT' });
    return {
      uploadUrl: url,
      publicUrl: this.getPublicUrl(key),
      key,
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
    };
  }

  async uploadFile(file: Express.Multer.File) {
    const date = new Date().toISOString().slice(0, 10);
    const ext = file.originalname.split('.').pop() || 'jpg';
    const key = `${date}/${randomUUID()}.${ext}`;

    if (!this.ossClient) {
      console.log('[UploadService] OSS未配置，使用本地存储');
      // OSS未配置时fallback到本地存储
      return this.uploadFileLocal(file, key);
    }

    try {
      // 上传到OSS
      console.log('[UploadService] 开始上传OSS, key:', key);
      const result = await this.ossClient.put(key, file.buffer);
      console.log('[UploadService] OSS结果:', result.res?.status);
      
      if (result.res?.status === 200) {
        return {
          url: this.getPublicUrl(key),
          key,
        };
      }
      
      console.log('[UploadService] OSS状态不对:', result.res?.status);
      throw new Error('OSS上传失败: ' + result.res?.status);
    } catch (error) {
      console.error('[UploadService] OSS上传错误:', error);
      // OSS失败时fallback到本地存储
      console.log('[UploadService] fallback到本地存储');
      return this.uploadFileLocal(file, key);
    }
  }

  private async uploadFileLocal(file: Express.Multer.File, key: string) {
    // 本地存储方案：保存到 static/uploads 目录
    const { existsSync, mkdirSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    
    const uploadDir = join(process.cwd(), 'static', 'uploads', key);
    const dirPath = join(process.cwd(), 'static', 'uploads', key.split('/').slice(0, -1).join('/'));
    
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    
    writeFileSync(uploadDir, file.buffer);

    const baseUrl = this.config.get<string>('APP_BASE_URL') || 'http://127.0.0.1:3000';
    const publicUrl = `${baseUrl}/uploads/${key}`;

    return {
      url: publicUrl,
      key: `uploads/${key}`,
    };
  }
}