import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';

@ApiTags('upload')
@ApiBearerAuth()
@Controller({ path: 'upload', version: '1' })
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('presign')
  presign(
    @Req() req: { user: { type: string } },
    @Body() body: { filename: string; contentType?: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.upload.presign(body.filename || 'file.bin', body.contentType);
  }
}
