import { Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CouponService } from './coupon.service';

@ApiTags('coupons')
@Controller({ path: 'coupons', version: '1' })
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Public()
  @Get()
  list() {
    return this.coupons.listAvailable();
  }

  @ApiBearerAuth()
  @Get('mine')
  mine(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.coupons.myCoupons(req.user.userId);
  }

  @ApiBearerAuth()
  @Post('claim')
  claim(@Req() req: { user: { userId: string; type: string } }, @Body() body: { couponId: string }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.coupons.claim(req.user.userId, body.couponId);
  }
}
