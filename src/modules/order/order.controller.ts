import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.listMine(req.user.userId);
  }

  @Get(':id')
  getOne(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.getById(req.user.userId, id);
  }

  @Get(':id/verification')
  getVerification(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.getVerificationCode(req.user.userId, id);
  }

  @Post()
  create(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: {
      activityId: string;
      quantity: number;
      priceTypeId?: string;
      participants: { name: string; phone: string; idCard?: string }[];
      usePoints?: boolean;
      couponId?: string;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.create(req.user.userId, body);
  }

  @Post(':id/mock-pay')
  mockPay(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.mockPay(req.user.userId, id);
  }

  @Post(':id/refund')
  refund(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string, @Body() body: { reason?: string; refundAmount?: number }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.orders.refund(req.user.userId, id, body.reason, body.refundAmount);
  }
}
