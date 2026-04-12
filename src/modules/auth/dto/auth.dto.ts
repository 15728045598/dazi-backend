import { IsOptional, IsString } from 'class-validator';

export class WechatLoginDto {
  @IsOptional()
  @IsString()
  code?: string;
}

export class WechatPhoneLoginDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  encryptedData?: string;

  @IsOptional()
  @IsString()
  iv?: string;
}
