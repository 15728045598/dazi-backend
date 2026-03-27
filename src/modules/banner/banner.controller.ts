import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('banners')
@Controller({ path: 'banners', version: '1' })
export class BannerController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async list() {
    return this.prisma.banner.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { sort: 'asc' }],
    });
  }
}
