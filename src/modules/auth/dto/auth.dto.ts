// 简化的 DTO - 不使用验证装饰器，避免 ValidationPipe 问题
export class WechatLoginDto {
  code?: string;
}

export class WechatPhoneLoginDto {
  code!: string;
  encryptedData?: string;
  iv?: string;
}
