import { BadRequestException, Injectable } from '@nestjs/common';
import { PointsType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(userId: string) {
    let acc = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    if (!acc) {
      acc = await this.prisma.pointsAccount.create({ data: { userId } });
    }
    return acc;
  }

  async listTransactions(userId: string, take = 50) {
    return this.prisma.pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async signIn(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const existed = await this.prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: PointsType.SIGN_IN,
        createdAt: { gte: start },
      },
    });
    if (existed) {
      throw new BadRequestException('今日已签到');
    }

    const amount = 10;
    return this.prisma.$transaction(async (tx) => {
      let acc = await tx.pointsAccount.findUnique({ where: { userId } });
      if (!acc) {
        acc = await tx.pointsAccount.create({ data: { userId } });
      }
      const balance = acc.balance + amount;
      await tx.pointsAccount.update({
        where: { id: acc.id },
        data: {
          balance,
          totalEarned: { increment: amount },
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
      });
      const tr = await tx.pointsTransaction.create({
        data: {
          accountId: acc.id,
          userId,
          type: PointsType.SIGN_IN,
          amount,
          balance,
          title: '每日签到',
        },
      });
      return tr;
    });
  }

  async addSteps(userId: string, steps: number) {
    const amount = Math.min(Math.floor(steps / 1000), 50);
    if (amount <= 0) {
      return { awarded: 0 };
    }
    return this.prisma.$transaction(async (tx) => {
      let acc = await tx.pointsAccount.findUnique({ where: { userId } });
      if (!acc) acc = await tx.pointsAccount.create({ data: { userId } });
      const balance = acc.balance + amount;
      await tx.pointsAccount.update({
        where: { id: acc.id },
        data: { balance, totalEarned: { increment: amount } },
      });
      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
      });
      await tx.pointsTransaction.create({
        data: {
          accountId: acc.id,
          userId,
          type: PointsType.STEPS,
          amount,
          balance,
          title: '步数兑换',
          description: `步数 ${steps}`,
        },
      });
      return { awarded: amount };
    });
  }
}
