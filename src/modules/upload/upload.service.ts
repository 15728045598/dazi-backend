import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

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

  async uploadFile(file: Express.Multer.File) {
    // 本地存储方案：保存到 static/uploads 目录
    const date = new Date().toISOString().slice(0, 10);
    const uploadDir = join(process.cwd(), 'static', 'uploads', date);
    
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(uploadDir, filename);
    
    writeFileSync(filepath, file.buffer);

    const baseUrl = this.config.get<string>('APP_BASE_URL') || 'http://127.0.0.1:3000';
    const publicUrl = `${baseUrl}/uploads/${date}/${filename}`;

    return {
      url: publicUrl,
      key: `uploads/${date}/${filename}`,
    };
  }
}
