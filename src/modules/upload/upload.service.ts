import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {}

  presign(filename: string, contentType?: string) {
    const bucket = this.config.get<string>('minio.bucket') || 'dazai';
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${filename}`;
    const endpoint = this.config.get<string>('minio.endPoint') || 'localhost';
    const port = this.config.get<number>('minio.port') || 9000;
    const mockUrl = `http://${endpoint}:${port}/${bucket}/${key}`;
    return {
      uploadUrl: mockUrl,
      publicUrl: mockUrl,
      key,
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      note: '本地开发为模拟直传地址，生产环境请接入 MinIO 预签名',
    };
  }
}
