import { Controller, Get, Post, Body, Query, Req, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @ApiBearerAuth()
  @Get()
  getWallet(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wallet.getWallet(req.user.userId);
  }

  @ApiBearerAuth()
  @Get('transactions')
  listTransactions(
    @Req() req: { user: { userId: string; type: string } },
    @Query('type') type?: string,
    @Query('take') take?: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wallet.listTransactions(req.user.userId, type, take ? parseInt(take) : 50);
  }

  @ApiBearerAuth()
  @Post('recharge')
  recharge(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { amount: number; description?: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wallet.recharge(req.user.userId, body.amount, body.description);
  }

  @ApiBearerAuth()
  @Post('spend')
  spend(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { amount: number; type: string; description: string; orderId?: string; relatedId?: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wallet.spend(
      req.user.userId,
      body.amount,
      body.type,
      body.description,
      body.orderId,
      body.relatedId,
    );
  }
}