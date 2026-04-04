import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PartnerService } from './partner.service';

@ApiTags('partner')
@Controller({ path: 'partner', version: '1' })
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  @ApiBearerAuth()
  @Post('apply')
  apply(
    @Req() req: { user: { userId: string } },
    @Body()
    body: {
      partnerType: string;
      name: string;
      contact: string;
      email?: string;
      company?: string;
      position?: string;
      resources: string;
      expectCooperation?: string;
    },
  ) {
    if (req.user.userId === 'admin') {
      throw new BadRequestException('管理员不能提交合作申请');
    }
    return this.partner.createApplication(req.user.userId, body);
  }

  @ApiBearerAuth()
  @Get('my-applications')
  getMyApplications(@Req() req: { user: { userId: string } }) {
    return this.partner.getMyApplications(req.user.userId);
  }
}
