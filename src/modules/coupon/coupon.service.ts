import { BadRequestException, Injectable } from '@nestjs/common';
import { CouponStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable() {
    const list = await this.prisma.coupon.findMany({
      where: { status: CouponStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((c) => ({
      ...c,
      value: toNum(c.value),
      minAmount: c.minAmount != null ? toNum(c.minAmount) : null,
      maxDiscount: c.maxDiscount != null ? toNum(c.maxDiscount) : null,
    }));
  }

  async claim(userId: string, couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon || coupon.status !== CouponStatus.ACTIVE) {
      throw new BadRequestException('优惠券不可用');
    }
    const now = new Date();
    const end = new Date(now.getTime() + coupon.validDays * 86400000);
    const existing = await this.prisma.userCoupon.count({
      where: { userId, couponId },
    });
    if (existing >= coupon.userLimit) {
      throw new BadRequestException('已达领取上限');
    }

    await this.prisma.userCoupon.create({
      data: {
        userId,
        couponId,
        startTime: now,
        endTime: end,
      },
    });
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { issuedCount: { increment: 1 } },
    });
    return { ok: true };
  }

  async myCoupons(userId: string) {
    const list = await this.prisma.userCoupon.findMany({
      where: { userId },
      include: { coupon: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((uc) => ({
      ...uc,
      coupon: uc.coupon
        ? {
            ...uc.coupon,
            value: toNum(uc.coupon.value),
            minAmount: uc.coupon.minAmount != null ? toNum(uc.coupon.minAmount) : null,
            maxDiscount: uc.coupon.maxDiscount != null ? toNum(uc.coupon.maxDiscount) : null,
          }
        : null,
    }));
  }
}
