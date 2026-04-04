import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PointsType } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // 获取基础URL
  private getBaseUrl(): string {
    const port = this.config.get<string>('PORT') || '3000';
    return `http://localhost:${port}`;
  }

  // 修复图片URL：转换为完整URL
  private fixImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    
    const baseUrl = this.getBaseUrl();
    if (url.startsWith('/uploads/')) {
      return `${baseUrl}/static${url}`;
    }
    if (url.startsWith('/static/uploads/')) {
      return `${baseUrl}${url}`;
    }
    return url;
  }

  private mapOrder(o: Record<string, unknown>) {
    const act = o.activity as Record<string, unknown> | undefined;
    const verification = o.verification as Record<string, unknown> | undefined;
    return {
      ...o,
      // 修复活动封面图片
      activity: act ? {
        ...act,
        coverImage: this.fixImageUrl(act.coverImage as string | undefined),
        groupChatQrCode: this.fixImageUrl(act.groupChatQrCode as string | undefined),
      } : undefined,
      // 活动结束时间（用于前端判断是否过期）
      activityEndTime: act?.endTime as Date | undefined,
      // 核销码信息
      verificationCode: verification?.code as string | undefined,
      verifiedAt: verification?.verifiedAt as Date | undefined,
      verifiedBy: verification?.verifiedBy as string | undefined,
      // 价格类型
      priceTypeId: o.priceTypeId as string | null,
      priceTypeName: o.priceTypeName as string | null,
      originalAmount: toNum(o.originalAmount),
      couponDiscount: toNum(o.couponDiscount),
      pointsDiscount: toNum(o.pointsDiscount),
      charityAmount: toNum(o.charityAmount),
      finalAmount: toNum(o.finalAmount),
      refundAmount: o.refundAmount != null ? toNum(o.refundAmount) : null,
    };
  }

  // 生成核销码
  private generateVerifyCode(): string {
    // 生成8位数字核销码
    return Math.random().toString().slice(2, 10).padStart(8, '0');
  }

  // 获取或创建核销码
  async getVerificationCode(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { verification: true },
    });
    if (!order) throw new NotFoundException('订单不存在');
    
    // 如果已有核销码，直接返回
    if (order.verification) {
      // 生成二维码图片
      const qrCodeImage = await this.generateQrCodeImage(order.verification.code);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        code: order.verification.code,
        qrCodeImage,  // Base64 QR code image
        status: order.status,
        verifiedAt: order.verification.verifiedAt,
      };
    }
    
    // 如果订单已支付，生成核销码
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('订单未支付，无法生成核销码');
    }
    
    const code = this.generateVerifyCode();
    await this.prisma.verification.create({
      data: {
        orderId: order.id,
        code,
      },
    });
    
    // 生成二维码图片
    const qrCodeImage = await this.generateQrCodeImage(code);
    
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      code,
      qrCodeImage,  // Base64 QR code image
      status: order.status,
      verifiedAt: null,
    };
  }
  
  // 生成二维码图片
  private async generateQrCodeImage(code: string): Promise<string> {
    try {
      const dataUrl = await QRCode.toDataURL(code, {
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      return dataUrl;
    } catch (error) {
      console.error('QR code generation failed:', error);
      return '';
    }
  }

  async create(
    userId: string,
    dto: {
      activityId: string;
      quantity: number;
      priceTypeId?: string;
      participants: { name: string; phone: string; idCard?: string }[];
      usePoints?: boolean;
      couponId?: string;
    },
  ) {
    const activity = await this.prisma.activity.findUnique({ where: { id: dto.activityId } });
    if (!activity || activity.status !== 'PUBLISHED') {
      throw new BadRequestException('活动不可报名');
    }
    if (activity.currentCount + dto.quantity > activity.maxParticipants) {
      throw new BadRequestException('名额不足');
    }

    // 处理价格类型
    let unitPrice = toNum(activity.price);
    let selectedPriceTypeName = '';
    let selectedPriceTypeId: string | null = dto.priceTypeId || null;
    
    // 系统票型处理：original=原价票，earlybird=早鸟票
    if (dto.priceTypeId === 'original') {
      unitPrice = toNum(activity.price);
      selectedPriceTypeName = '原价票';
      selectedPriceTypeId = null; // 系统票型不存储ID
    } else if (dto.priceTypeId === 'earlybird') {
      if (activity.earlyBirdPrice && activity.earlyBirdEndTime) {
        const earlyBirdEnd = new Date(activity.earlyBirdEndTime);
        if (earlyBirdEnd > new Date()) {
          unitPrice = toNum(activity.earlyBirdPrice);
          selectedPriceTypeName = '早鸟票';
          selectedPriceTypeId = null; // 系统票型不存储ID
        } else {
          // 早鸟票已过期，使用原价
          unitPrice = toNum(activity.price);
          selectedPriceTypeName = '原价票';
          selectedPriceTypeId = null;
        }
      } else {
        // 没有早鸟票，使用原价
        unitPrice = toNum(activity.price);
        selectedPriceTypeName = '原价票';
        selectedPriceTypeId = null;
      }
    } else if (dto.priceTypeId) {
      // 自定义价格类型
      const priceTypes = await this.prisma.activityPriceType.findMany({
        where: { activityId: dto.activityId, id: dto.priceTypeId },
      });
      if (priceTypes.length > 0) {
        unitPrice = toNum(priceTypes[0].price);
        selectedPriceTypeName = priceTypes[0].name;
        
        // 检查库存
        if (priceTypes[0].stock != null && priceTypes[0].stock < dto.quantity) {
          throw new BadRequestException('该票型库存不足');
        }
        
        // 扣减库存
        await this.prisma.activityPriceType.update({
          where: { id: dto.priceTypeId },
          data: { stock: { decrement: dto.quantity } },
        });
      }
    } else {
      // 没有选择价格类型，使用原价
      selectedPriceTypeName = '原价票';
    }
    
    const originalAmount = unitPrice * dto.quantity;
    const charityPer = toNum(activity.charityAmount);
    const charityTotal = charityPer * dto.quantity;
    
    // 积分抵扣：最多抵扣订单金额的10%或10元，取其低者
    const maxDeductionByPercent = Math.floor(originalAmount * 0.1);
    const maxDeductionByAmount = 10;
    const pointsDiscountCap = Math.min(maxDeductionByPercent, maxDeductionByAmount);

    const orderNo = `DZ${Date.now()}${randomBytes(2).toString('hex')}`;

    // 处理优惠券
    let couponDiscount = 0;
    let usedCouponId: string | null = null;
    
    if (dto.couponId) {
      // 查找用户的优惠券
      const userCouponRecord = await this.prisma.userCoupon.findFirst({
        where: {
          id: dto.couponId,
          userId,
          status: 'UNUSED',
        },
        include: {
          coupon: true,
        },
      });
      
      if (!userCouponRecord) {
        throw new BadRequestException('优惠券不可用');
      }
      
      // 检查是否过期
      const now = new Date();
      if (userCouponRecord.endTime < now) {
        throw new BadRequestException('优惠券已过期');
      }
      
      // 计算折扣
      const couponValue = toNum(userCouponRecord.coupon.value);
      const minAmount = userCouponRecord.coupon.minAmount ? toNum(userCouponRecord.coupon.minAmount) : 0;
      
      // 检查最低消费
      if (minAmount > 0 && originalAmount < minAmount) {
        throw new BadRequestException(`订单金额需满 ¥${minAmount} 才能使用此优惠券`);
      }
      
      // 根据类型计算折扣
      switch (userCouponRecord.coupon.type) {
        case 'CASH':
        case 'FULL_REDUCTION':
          couponDiscount = couponValue;
          break;
        case 'DISCOUNT':
          couponDiscount = Math.floor(originalAmount * (couponValue / 100));
          break;
        default:
          couponDiscount = couponValue;
      }
      
      // 确保折扣不超过订单金额
      couponDiscount = Math.min(couponDiscount, originalAmount);
      
      // 记录使用的优惠券ID
      usedCouponId = userCouponRecord.id;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      let pointsUsed = 0;
      let pointsDiscount = 0;
      
      console.log(`[createOrder] usePoints=${dto.usePoints}, originalAmount=${originalAmount}, pointsDiscountCap=${pointsDiscountCap}`);
      
      if (dto.usePoints) {
        const account = await tx.pointsAccount.findUnique({ where: { userId } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { points: true } });
        const pointsBalance = Math.max(0, account?.balance ?? user?.points ?? 0);
        
        console.log(`[createOrder] pointsBalance=${pointsBalance}, maxPointsAllowed=${pointsDiscountCap * 100}`);
        
        // pointsDiscountCap 是最多可以抵扣的金额（单位：元）
        // 需要转换为最多可以使用的积分（1元 = 100积分）
        const maxPointsAllowed = pointsDiscountCap * 100;
        
        // 实际使用的积分不能超过用户可用的积分
        pointsUsed = Math.min(pointsBalance, maxPointsAllowed);
        
        // 积分抵扣金额（单位：元）= 使用的积分 / 100
        pointsDiscount = Math.floor(pointsUsed / 100);
        
        console.log(`[createOrder] pointsUsed=${pointsUsed}, pointsDiscount=${pointsDiscount}`);
        
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
      // 计算最终金额：原价 - 积分折扣 - 优惠券折扣
      const afterPointsDiscount = originalAmount - pointsDiscount;
      const finalAmount = Math.max(0, afterPointsDiscount - couponDiscount);
      
      console.log(`[createOrder] couponId=${dto.couponId}, usedCouponId=${usedCouponId}, couponDiscount=${couponDiscount}`);
      
      const o = await tx.order.create({
        data: {
          orderNo,
          userId,
          activityId: activity.id,
          quantity: dto.quantity,
          priceTypeId: selectedPriceTypeId,  // 使用修正后的价格类型ID
          priceTypeName: selectedPriceTypeName || null,
          originalAmount: originalAmount,
          couponDiscount,
          couponId: usedCouponId,
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
          data: { 
            points: { decrement: pointsUsed },
            totalPointsUsed: { increment: pointsUsed },
          },
        });
      }

      return o;
    });

    return this.mapOrder(order as never);
  }

  async listMine(userId: string) {
    const list = await this.prisma.order.findMany({
      where: { userId },
      include: { activity: true, participants: true, verification: true },
      orderBy: { createdAt: 'desc' },
    });
    
    // 自动更新已过期但未核销的订单为已完成
    const now = new Date();
    const expiredOrders = list.filter(
      (o) => o.status === OrderStatus.PAID && o.activity && new Date(o.activity.endTime) < now
    );
    
    if (expiredOrders.length > 0) {
      await this.prisma.$transaction(
        expiredOrders.map((o) =>
          this.prisma.order.update({
            where: { id: o.id },
            data: {
              status: OrderStatus.COMPLETED,
              completedAt: now,
            },
          })
        )
      );
    }
    
    return list.map((o) => {
      // 如果订单被更新了，使用新状态
      const isExpired = expiredOrders.some((e) => e.id === o.id);
      const updatedOrder = isExpired
        ? { ...o, status: OrderStatus.COMPLETED, completedAt: now }
        : o;
      return this.mapOrder(updatedOrder as never);
    });
  }

  async getById(userId: string, id: string) {
    const o = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { activity: true, participants: true, verification: true },
    });
    if (!o) throw new NotFoundException('订单不存在');
    
    // 检查订单是否过期但未核销
    const now = new Date();
    if (o.status === OrderStatus.PAID && o.activity && new Date(o.activity.endTime) < now) {
      // 更新为已完成
      const updated = await this.prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: now,
        },
      });
      return this.mapOrder({ ...o, ...updated } as never);
    }
    
    return this.mapOrder(o as never);
  }

  async mockPay(userId: string, orderId: string) {
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!o) throw new NotFoundException('订单不存在');
    if (o.status !== OrderStatus.PENDING) {
      throw new BadRequestException('订单状态不可支付');
    }

    const paymentNo = `PAY${Date.now()}`;
    const code = this.generateVerifyCode();
    const usedCouponId = o.couponId;
    
    console.log(`[mockPay] orderId=${orderId}, couponId=${usedCouponId}`);
    
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
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
      });
      // 支付成功后创建核销码
      await tx.verification.create({
        data: {
          orderId,
          code,
        },
      });
        // 如果使用了优惠券，标记为已使用
        if (usedCouponId) {
          console.log(`[mockPay] Marking coupon ${usedCouponId} as USED`);
          await tx.userCoupon.update({
            where: { id: usedCouponId },
            data: {
              status: 'USED',
              usedAt: new Date(),
              orderId: orderId,
            },
          });
        } else {
          console.log(`[mockPay] No coupon used for this order`);
        }
        
        // 报名活动自动捐赠1元
        const activity = await tx.activity.findUnique({ where: { id: o.activityId } });
        const charityAmount = activity?.charityAmount ? parseFloat(String(activity.charityAmount)) : 1;
        
        if (charityAmount > 0) {
          // 获取或创建公益账户
          let fund = await tx.publicFund.findFirst();
          if (!fund) {
            fund = await tx.publicFund.create({
              data: { id: 'default', totalDonated: 0, totalSpent: 0, balance: 0 },
            });
          }
          
          // 创建捐赠记录
          await tx.charityDonation.create({
            data: {
              userId: o.userId,
              amount: charityAmount,
              campaignId: null,
              type: 'PLATFORM_REGISTRATION',
              orderId: orderId,
              note: `活动报名捐赠：${activity?.title || ''}`,
            },
          });
          
          // 更新公益账户余额
          const newBalance = toNum(fund.balance) + charityAmount;
          await tx.publicFund.update({
            where: { id: fund.id },
            data: {
              totalDonated: toNum(fund.totalDonated) + charityAmount,
              balance: newBalance,
            },
          });
          
          // 记录资金变动
          await tx.publicFundTransaction.create({
            data: {
              fundId: fund.id,
              type: 'DONATION',
              amount: charityAmount,
              balance: newBalance,
              description: `报名活动捐赠：${activity?.title || ''}`,
              relatedId: orderId,
              relatedType: 'Order',
            },
          });
          
          console.log(`[mockPay] Charity donation of ${charityAmount} created for order ${orderId}`);
        }
      });

    return { ok: true, paymentNo, verificationCode: code };
  }

  async refund(userId: string, orderId: string, reason?: string, refundAmount?: number) {
    const o = await this.prisma.order.findFirst({ 
      where: { id: orderId, userId },
      include: { activity: true },
    });
    if (!o) throw new NotFoundException('订单不存在');
    
    // Only allow refund for PAID orders
    if (o.status !== OrderStatus.PAID) {
      throw new BadRequestException('订单状态不可退款');
    }
    
    // 计算退款金额（如果没有传入，则根据活动时间计算）
    let actualRefundAmount = refundAmount
    if (actualRefundAmount === undefined) {
      const activityStartTime = o.activity?.startTime
      if (activityStartTime) {
        const hoursUntilActivity = (new Date(activityStartTime).getTime() - Date.now()) / (1000 * 60 * 60)
        if (hoursUntilActivity < 24) {
          // 24小时内：不可退款
          actualRefundAmount = 0
        } else if (hoursUntilActivity < 48) {
          // 48小时内：退还50%
          actualRefundAmount = Math.floor(Number(o.finalAmount) * 0.5)
        } else {
          // 48小时外：全额退款
          actualRefundAmount = Number(o.finalAmount)
        }
      } else {
        actualRefundAmount = Number(o.finalAmount)
      }
    }
    
    // 检查退款金额
    const maxRefundAmount = Number(o.finalAmount)
    if (actualRefundAmount > maxRefundAmount) {
      actualRefundAmount = maxRefundAmount
    }

    const refundNo = `REFUND${Date.now()}`;
    
    // 处理积分退款：如果订单使用了积分，退还积分到用户余额（但不计入累计积分）
    let pointsToRefund = 0;
    if (o.pointsUsed && o.pointsUsed > 0) {
      pointsToRefund = Number(o.pointsUsed);
    }
    
    await this.prisma.$transaction(async (tx) => {
      // 更新订单状态
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REFUNDING,
          refundReason: reason,
          refundAmount: actualRefundAmount,
        },
      });
      
      // 创建退款记录
      await tx.refund.create({
        data: {
          orderId,
          refundNo,
          amount: actualRefundAmount,
          reason: reason || '用户申请退款',
          status: 'PENDING',
        },
      });
      
      // 退还积分到用户余额（不计入累计积分）
      if (pointsToRefund > 0) {
        // 查找或创建用户的积分账户
        let account = await tx.pointsAccount.findUnique({ where: { userId } });
        if (!account) {
          account = await tx.pointsAccount.create({
            data: { userId, balance: 0, totalEarned: 0, totalUsed: 0 },
          });
        }
        
        // 退还积分：只增加 balance，不增加 totalEarned
        await tx.pointsAccount.update({
          where: { id: account.id },
          data: { balance: { increment: pointsToRefund } },
        });
        
        // 退还积分到用户账户
        await tx.user.update({
          where: { id: userId },
          data: { points: { increment: pointsToRefund } },
        });
        
        // 记录积分退还流水
        await tx.pointsTransaction.create({
          data: {
            accountId: account.id,
            userId,
            type: 'REFUND' as PointsType,
            amount: pointsToRefund,
            balance: account.balance + pointsToRefund,
            title: '退款返还积分',
            description: `订单退款返还 ${pointsToRefund} 积分`,
          },
        });
      }
    });

    // In production, integrate with WeChat Pay refund API here
    
    return { ok: true, refundNo, refundAmount: actualRefundAmount, message: '退款申请已提交' };
  }
}
