import { Body, Controller, ForbiddenException, Post, Req, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('upload')
@Controller({ path: 'upload', version: '1' })
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('presign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  presign(
    @Req() req: { user: { type: string } },
    @Body() body: { filename: string; contentType?: string },
  ) {
    if (req.user?.type === 'admin') throw new ForbiddenException();
    return this.upload.presign(body.filename || 'file.bin', body.contentType);
  }

  @Post('file')
  @Public()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('请选择要上传的文件');
    }
    const result = await this.upload.uploadFile(file);
    return result;
  }
}
