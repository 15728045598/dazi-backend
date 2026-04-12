import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }
    return {
      ...wallet,
      balance: toNum(wallet.balance),
      totalRecharge: toNum(wallet.totalRecharge),
      totalSpend: toNum(wallet.totalSpend),
    };
  }

  async listTransactions(userId: string, type?: string, take = 50) {
    const where: any = { userId };
    if (type) {
      where.type = type;
    }
    return this.prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    }).then(txs => txs.map(tx => ({
        ...tx,
        amount: toNum(tx.amount),
        balance: toNum(tx.balance),
      })));
  }

  // 充值
  async recharge(userId: string, amount: number, description?: string) {
    if (amount <= 0) {
      throw new BadRequestException('充值金额必须大于0');
    }
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }
      const newBalance = wallet.balance.plus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          totalRecharge: { increment: amount },
        },
      });
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'RECHARGE',
          amount,
          balance: newBalance,
          description: description || '充值',
          status: 'SUCCESS',
        },
      });
      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 消费（活动报名、捐赠等）
  async spend(userId: string, amount: number, type: string, description: string, orderId?: string, relatedId?: string) {
    if (amount <= 0) {
      throw new BadRequestException('消费金额必须大于0');
    }
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }
      if (wallet.balance.lessThan(amount)) {
        throw new BadRequestException('余额不足');
      }
      const newBalance = wallet.balance.minus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          totalSpend: { increment: amount },
        },
      });
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type,
          amount,
          balance: newBalance,
          description,
          orderId,
          relatedId,
          status: 'SUCCESS',
        },
      });
      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 退款
  async refund(userId: string, amount: number, description: string, orderId?: string) {
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }
      const newBalance = wallet.balance.plus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'REFUND',
          amount,
          balance: newBalance,
          description,
          orderId,
          status: 'SUCCESS',
        },
      });
      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 邀请奖励入账
  async addInviteReward(userId: string, amount: number, inviteeId: string) {
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }
      const newBalance = wallet.balance.plus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'INVITE_REWARD',
          amount,
          balance: newBalance,
          description: '邀请奖励',
          relatedId: inviteeId,
          status: 'SUCCESS',
        },
      });
      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 扣除余额（用于退款等情况）
  async deductBalance(userId: string, amount: number, description: string) {
    if (amount <= 0) {
      throw new BadRequestException('扣款金额必须大于0');
    }
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new BadRequestException('钱包不存在');
      }
      if (wallet.balance.lessThan(amount)) {
        throw new BadRequestException('余额不足');
      }
      const newBalance = wallet.balance.minus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'DEDUCT',
          amount,
          balance: newBalance,
          description,
          status: 'SUCCESS',
        },
      });
      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 提现申请
  async withdraw(
    userId: string,
    amount: number,
    type: 'WECHAT' | 'BANK',
    accountInfo: { openid?: string; bankCardNo?: string; bankName?: string; realName?: string },
  ) {
    if (amount <= 0) {
      throw new BadRequestException('提现金额必须大于0');
    }
    // 最小提现额度 1 元
    if (amount < 1) {
      throw new BadRequestException('提现金额不能少于1元');
    }

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }
      if (wallet.balance.lessThan(amount)) {
        throw new BadRequestException('余额不足');
      }

      const newBalance = wallet.balance.minus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      // 创建提现记录（待审核）
      const tr = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'WITHDRAW',
          amount: -amount, // 支出为负数
          balance: newBalance,
          description: type === 'WECHAT' ? '微信提现' : '银行卡提现',
          status: 'PENDING', // 待审核状态
          relatedId: accountInfo.openid || accountInfo.bankCardNo || null,
        },
      });

      return {
        ...tr,
        amount: toNum(tr.amount),
        balance: toNum(tr.balance),
      };
    });
  }

  // 获取用户提现记录
  async getWithdrawals(userId: string, take = 20) {
    return this.prisma.walletTransaction.findMany({
      where: { userId, type: 'WITHDRAW' },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}