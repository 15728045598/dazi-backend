import { BadRequestException, Injectable } from '@nestjs/common';
import { PointsType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// 签到积分配置
const SIGN_IN_BASE_POINTS = 10;      // 基础签到积分
const SIGN_IN_BONUS_POINTS = 30;     // 连续签到3天后每天积分
const SIGN_IN_BONUS_DAYS = 3;        // 开始获得bonus的天数
const POINTS_PER_LEVEL = 200;        // 每200积分升一级
const POINTS_TO_MONEY_RATE = 100;   // 100积分 = 1元
const MAX_POINTS_DISCOUNT_RATE = 0.1; // 最高抵扣10%
const MAX_POINTS_DISCOUNT_AMOUNT = 10; // 最高抵扣10元

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  // 计算用户等级
  calculateLevel(totalPoints: number): number {
    return Math.floor(totalPoints / POINTS_PER_LEVEL) + 1;
  }

  // 获取当前等级需要的积分
  getPointsForLevel(level: number): number {
    return (level - 1) * POINTS_PER_LEVEL;
  }

  // 获取下一等级需要的积分
  getPointsToNextLevel(currentPoints: number): number {
    const currentLevel = this.calculateLevel(currentPoints);
    const nextLevelPoints = currentLevel * POINTS_PER_LEVEL;
    return Math.max(0, nextLevelPoints - currentPoints);
  }

  // 获取签到积分（根据连续签到天数）
  getSignInPoints(consecutiveDays: number): number {
    if (consecutiveDays >= SIGN_IN_BONUS_DAYS) {
      return SIGN_IN_BONUS_POINTS;
    }
    return SIGN_IN_BASE_POINTS;
  }

  // 计算积分可抵扣金额
  calculatePointsDiscount(points: number, orderAmount: number): { pointsUsed: number; discount: number } {
    // 每100积分抵扣1元
    const maxDiscountByRate = Math.floor(orderAmount * MAX_POINTS_DISCOUNT_RATE);
    const maxDiscountByAmount = MAX_POINTS_DISCOUNT_AMOUNT;
    const maxDiscount = Math.min(maxDiscountByRate, maxDiscountByAmount);
    
    // 实际可抵扣的积分（每1元=100积分）
    const maxPoints = maxDiscount * POINTS_TO_MONEY_RATE;
    const pointsUsed = Math.min(points, maxPoints);
    const discount = Math.floor(pointsUsed / POINTS_TO_MONEY_RATE);
    
    return { pointsUsed, discount };
  }

  async getAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      select: { 
        points: true, 
        totalPointsEarned: true, 
        totalPointsUsed: true, 
        level: true,
        consecutiveSignInDays: true,
        lastSignInDate: true,
      } 
    });
    
    if (!user) {
      throw new BadRequestException('用户不存在');
    }
    
    // 优先从 pointsAccount 获取积分数据（更准确）
    const account = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    const balance = account?.balance ?? user.points ?? 0;
    const totalEarned = account?.totalEarned ?? user.totalPointsEarned ?? 0;
    const totalUsed = account?.totalUsed ?? user.totalPointsUsed ?? 0;
    
    // 计算等级
    const level = Math.floor(totalEarned / 200) + 1;
    
    return {
      balance,
      totalEarned,
      totalUsed,
      level,
      consecutiveSignInDays: user.consecutiveSignInDays,
      lastSignInDate: user.lastSignInDate,
      pointsToNextLevel: this.getPointsToNextLevel(totalEarned),
    };
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
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    // 检查今天是否已签到
    const existed = await this.prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: PointsType.SIGN_IN,
        createdAt: { gte: start, lte: end },
      },
    });
    if (existed) {
      throw new BadRequestException('今日已签到');
    }

    // 获取用户当前签到信息
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 计算连续签到天数
    let consecutiveDays = user.consecutiveSignInDays || 0;
    const lastSignInDate = user.lastSignInDate;
    
    if (lastSignInDate) {
      const lastDate = new Date(lastSignInDate);
      lastDate.setHours(0, 0, 0, 0);
      const yesterday = new Date(start);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastDate.getTime() === yesterday.getTime()) {
        // 昨天签到了，连续天数+1
        consecutiveDays += 1;
      } else if (lastDate.getTime() < yesterday.getTime()) {
        // 中断了，重置为1
        consecutiveDays = 1;
      }
      // 如果是今天，不做处理（因为今天已签到）
    } else {
      // 第一次签到
      consecutiveDays = 1;
    }

    // 计算签到积分
    const points = this.getSignInPoints(consecutiveDays);

    return this.prisma.$transaction(async (tx) => {
      let account = await tx.pointsAccount.findUnique({ where: { userId } });
      if (!account) {
        account = await tx.pointsAccount.create({ data: { userId } });
      }
      
      const newBalance = account.balance + points;
      const newTotalEarned = account.totalEarned + points;
      
      // 更新积分账户
      await tx.pointsAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          totalEarned: newTotalEarned,
        },
      });

      // 计算新等级
      const newLevel = this.calculateLevel(user.totalPointsEarned + points);
      
      // 更新用户积分和等级
      await tx.user.update({
        where: { id: userId },
        data: {
          points: { increment: points },
          totalPointsEarned: { increment: points },
          level: newLevel,
          consecutiveSignInDays: consecutiveDays,
          lastSignInDate: new Date(),
        },
      });

      // 记录积分流水
      const tr = await tx.pointsTransaction.create({
        data: {
          accountId: account.id,
          userId,
          type: PointsType.SIGN_IN,
          amount: points,
          balance: newBalance,
          title: '每日签到',
          description: `连续签到 ${consecutiveDays} 天，获得 ${points} 积分`,
        },
      });

      return {
        ...tr,
        consecutiveDays,
        points,
        level: newLevel,
      };
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
      const user = await tx.user.findUnique({ where: { id: userId } });
      const newLevel = this.calculateLevel((user?.totalPointsEarned || 0) + amount);
      await tx.user.update({
        where: { id: userId },
        data: { 
          points: { increment: amount },
          totalPointsEarned: { increment: amount },
          level: newLevel,
        },
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

  // 订单创建时使用积分抵扣
  async usePointsForOrder(userId: string, orderAmount: number, pointsToUse?: number) {
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      select: { points: true }
    });
    
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const availablePoints = user.points;
    
    // 如果没有指定使用积分数，自动计算最大可抵扣
    const pointsToDeduct = pointsToUse ?? availablePoints;
    const { pointsUsed, discount } = this.calculatePointsDiscount(pointsToDeduct, orderAmount);
    
    if (pointsUsed <= 0 || discount <= 0) {
      return { pointsUsed: 0, discount: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      let account = await tx.pointsAccount.findUnique({ where: { userId } });
      if (!account) {
        account = await tx.pointsAccount.create({ data: { userId } });
      }

      const newBalance = Math.max(0, account.balance - pointsUsed);
      const newTotalUsed = account.totalUsed + pointsUsed;
      
      await tx.pointsAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          totalUsed: newTotalUsed,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          points: { decrement: pointsUsed },
          totalPointsUsed: { increment: pointsUsed },
        },
      });

      await tx.pointsTransaction.create({
        data: {
          accountId: account.id,
          userId,
          type: PointsType.DEDUCTION,
          amount: -pointsUsed,
          balance: newBalance,
          title: '活动报名抵扣',
          description: `抵扣 ${discount} 元`,
        },
      });

      return { pointsUsed, discount };
    });
  }
}
