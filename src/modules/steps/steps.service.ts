import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class StepsService {
  constructor(private readonly prisma: PrismaService) {}

  // 获取或创建今日步数记录
  private getTodayDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  async getTodaySteps(userId: string) {
    const today = this.getTodayDate();
    let record = await this.prisma.userDailySteps.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!record) {
      record = await this.prisma.userDailySteps.create({
        data: { userId, date: today, steps: 0, earnedPoints: 0 },
      });
    }
    return {
      ...record,
      steps: record.steps,
      earnedPoints: record.earnedPoints,
    };
  }

  // 更新步数（从小程序同步）
  async updateSteps(userId: string, steps: number) {
    const today = this.getTodayDate();
    let record = await this.prisma.userDailySteps.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!record) {
      record = await this.prisma.userDailySteps.create({
        data: { userId, date: today, steps, earnedPoints: 0 },
      });
    } else {
      record = await this.prisma.userDailySteps.update({
        where: { id: record.id },
        data: { steps },
      });
    }
    return { steps: record.steps };
  }

  // 步数兑换积分
  async exchangeSteps(userId: string) {
    const today = this.getTodayDate();
    const record = await this.prisma.userDailySteps.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!record || record.steps < 1000) {
      return { exchanged: 0, reason: '步数不足1000' };
    }
    if (record.earnedPoints >= 50) {
      return { exchanged: 0, reason: '今日已兑换上限50积分' };
    }
    // 计算可兑换积分：每1000步兑换1积分，上限50
    const pointsToExchange = Math.min(
      Math.floor(record.steps / 1000),
      50 - record.earnedPoints,
    );
    if (pointsToExchange <= 0) {
      return { exchanged: 0, reason: '今日已兑换上限50积分' };
    }
    // 更新步数记录
    await this.prisma.userDailySteps.update({
      where: { id: record.id },
      data: { earnedPoints: { increment: pointsToExchange } },
    });
    // 增加用户积分
    await this.prisma.user.update({
      where: { id: userId },
      data: { points: { increment: pointsToExchange } },
    });
    // 记录积分账户变动
    let acc = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    if (!acc) {
      acc = await this.prisma.pointsAccount.create({ data: { userId } });
    }
    await this.prisma.pointsTransaction.create({
      data: {
        accountId: acc.id,
        userId,
        type: 'STEPS',
        amount: pointsToExchange,
        balance: acc.balance + pointsToExchange,
        title: '步数兑换',
        description: `今日步数 ${record.steps}`,
      },
    });
    await this.prisma.pointsAccount.update({
      where: { id: acc.id },
      data: { balance: { increment: pointsToExchange }, totalEarned: { increment: pointsToExchange } },
    });
    return { exchanged: pointsToExchange };
  }

  // 获取步数排行榜
  async getLeaderboard(type: 'daily' | 'monthly' | 'total', limit = 10) {
    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (type === 'daily') {
      startDate = this.getTodayDate();
      endDate = startDate;
    } else if (type === 'monthly') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${year}-${month}-01`;
      // 最后一天
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      endDate = `${year}-${month}-${lastDay}`;
    } else {
      // 总榜 - 全部数据
      startDate = '2020-01-01';
      endDate = '2099-12-31';
    }

    const records = await this.prisma.userDailySteps.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
    });

    // 按用户汇总
    const userSteps: Record<string, number> = {};
    for (const r of records) {
      userSteps[r.userId] = (userSteps[r.userId] || 0) + r.steps;
    }

    // 排序取前10
    const sorted = Object.entries(userSteps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // 获取用户信息
    const userIds = sorted.map(([id]) => id);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return sorted.map(([userId, steps], index) => ({
      rank: index + 1,
      user: userMap.get(userId) || { id: userId, nickname: '未知用户', avatar: '' },
      steps,
    }));
  }

  // 获取我的排名
  async getMyRank(userId: string, type: 'daily' | 'monthly' | 'total') {
    const leaderboard = await this.getLeaderboard(type, 1000);
    const myRank = leaderboard.findIndex(item => item.user.id === userId);
    return myRank >= 0 ? myRank + 1 : null;
  }
}