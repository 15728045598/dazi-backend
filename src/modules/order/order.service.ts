import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PointsType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  private mapOrder(o: Record<string, unknown>) {
    return {
      ...o,
      originalAmount: toNum(o.originalAmount),
      couponDiscount: toNum(o.couponDiscount),
      pointsDiscount: toNum(o.pointsDiscount),
      charityAmount: toNum(o.charityAmount),
      finalAmount: toNum(o.finalAmount),
      refundAmount: o.refundAmount != null ? toNum(o.refundAmount) : null,
    };
  }

  async create(
    userId: string,
    dto: {
      activityId: string;
      quantity: number;
      participants: { name: string; phone: string; idCard?: string }[];
      usePoints?: boolean;
    },
  ) {
    const activity = await this.prisma.activity.findUnique({ where: { id: dto.activityId } });
    if (!activity || activity.status !== 'PUBLISHED') {
      throw new BadRequestException('活动不可报名');
    }
    if (activity.currentCount + dto.quantity > activity.maxParticipants) {
      throw new BadRequestException('名额不足');
    }

    const price = toNum(activity.price);
    const originalAmount = price * dto.quantity;
    const charityPer = toNum(activity.charityAmount);
    const charityTotal = charityPer * dto.quantity;
    const pointsDiscountCap = Math.floor(originalAmount * 0.1);

    const orderNo = `DZ${Date.now()}${randomBytes(2).toString('hex')}`;

    const order = await this.prisma.$transaction(async (tx) => {
      let pointsUsed = 0;
      let pointsDiscount = 0;
      if (dto.usePoints) {
        const account = await tx.pointsAccount.findUnique({ where: { userId } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { points: true } });
        const pointsBalance = Math.max(0, account?.balance ?? user?.points ?? 0);
        pointsUsed = Math.min(pointsBalance, pointsDiscountCap);
        pointsDiscount = pointsUsed;
        if (pointsUsed > 0) {
          const ensuredAccount =
            account ??
            (await tx.pointsAccount.create({
              data: { userId, balance: pointsBalance, totalEarned: pointsBalance },
            }));
          const nextBalance = Math.max(0, ensuredAccount.balance - pointsUsed);
          await tx.pointsAccount.update({
            where: { id: ensuredAccount.id },
            data: { balance: nextBalance, totalUsed: { increment: pointsUsed } },
          });
          await tx.pointsTransaction.create({
            data: {
              accountId: ensuredAccount.id,
              userId,
              type: PointsType.DEDUCTION,
              amount: -pointsUsed,
              balance: nextBalance,
              title: '活动报名抵扣',
              description: `报名订单 ${orderNo}`,
            },
          });
        }
      }
      const finalAmount = Math.max(0, originalAmount - pointsDiscount);
      const o = await tx.order.create({
        data: {
          orderNo,
          userId,
          activityId: activity.id,
          quantity: dto.quantity,
          originalAmount: originalAmount,
          pointsUsed,
          pointsDiscount,
          finalAmount: finalAmount,
          charityAmount: charityTotal,
          status: OrderStatus.PENDING,
          participants: {
            create: dto.participants.map((p) => ({
              name: p.name,
              phone: p.phone,
              idCard: p.idCard,
            })),
          },
        },
        include: { activity: true, participants: true },
      });

      await tx.activity.update({
        where: { id: activity.id },
        data: { currentCount: { increment: dto.quantity } },
      });
      if (pointsUsed > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { points: { decrement: pointsUsed } },
        });
      }

      return o;
    });

    return this.mapOrder(order as never);
  }

  async listMine(userId: string) {
    const list = await this.prisma.order.findMany({
      where: { userId },
      include: { activity: true, participants: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((o) => this.mapOrder(o as never));
  }

  async getById(userId: string, id: string) {
    const o = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { activity: true, participants: true, verification: true },
    });
    if (!o) throw new NotFoundException('订单不存在');
    return this.mapOrder(o as never);
  }

  async mockPay(userId: string, orderId: string) {
    const o = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!o) throw new NotFoundException('订单不存在');
    if (o.status !== OrderStatus.PENDING) {
      throw new BadRequestException('订单状态不可支付');
    }

    const paymentNo = `PAY${Date.now()}`;
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          payments: {
            create: {
              paymentNo,
              amount: o.finalAmount,
              channel: 'MOCK',
              status: 'SUCCESS',
              paidAt: new Date(),
            },
          },
        },
      }),
    ]);

    return { ok: true, paymentNo };
  }
}
