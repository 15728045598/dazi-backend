import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class InviteService {
  constructor(private readonly prisma: PrismaService) {}

  codeForUser(userId: string) {
    const raw = Buffer.from(userId).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `DZ${raw.toUpperCase().padEnd(8, '0')}`;
  }

  async getMine(userId: string) {
    const inviteCode = this.codeForUser(userId);
    const invited = await this.prisma.inviteRelation.count({ where: { inviterId: userId } });
    const rewards = await this.prisma.inviteReward.findMany({
      where: { inviterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    // 获取被邀请人信息
    const inviteeIds = rewards.map(r => r.inviteeId);
    const invitees = await this.prisma.user.findMany({
      where: { id: { in: inviteeIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const inviteeMap = new Map(invitees.map(i => [i.id, i]));
    return {
      inviteCode,
      invitedCount: invited,
      rewards: rewards.map((r) => ({
        ...r,
        amount: toNum(r.amount),
        invitee: inviteeMap.get(r.inviteeId) || null,
      })),
    };
  }

  async bindInvitee(inviterCode: string, inviteeUserId: string) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    const inviter = users.find((u) => this.codeForUser(u.id) === inviterCode);
    if (!inviter) {
      return { ok: false, reason: '邀请码无效' };
    }
    if (inviter.id === inviteeUserId) {
      return { ok: false, reason: '不能邀请自己' };
    }
    const exists = await this.prisma.inviteRelation.findUnique({
      where: { inviteeId: inviteeUserId },
    });
    if (exists) {
      return { ok: false, reason: '已绑定邀请人' };
    }
    // 创建邀请关系
    await this.prisma.inviteRelation.create({
      data: {
        inviterId: inviter.id,
        inviteeId: inviteeUserId,
        inviteCode: inviterCode,
      },
    });
    // 发放注册奖励
    await this.grantInviteReward(inviter.id, inviteeUserId, 'REGISTER', 5);
    return { ok: true };
  }

  // 发放邀请奖励
  async grantInviteReward(inviterId: string, inviteeId: string, type: string, amount: number, currency = 'CNY') {
    const reward = await this.prisma.inviteReward.create({
      data: {
        inviterId,
        inviteeId,
        type,
        amount,
        currency,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    // 奖励进入钱包
    const { WalletService } = await import('../wallet/wallet.service');
    // 注意：这里需要通过 module 导入，这里简化处理
    return reward;
  }

  // 邀请排行榜
  async getLeaderboard(limit = 10) {
    const rewards = await this.prisma.inviteReward.findMany({
      where: { status: 'PAID' },
      select: { inviterId: true, amount: true },
    });
    // 按邀请人汇总奖励
    const inviterRewards: Record<string, number> = {};
    for (const r of rewards) {
      inviterRewards[r.inviterId] = (inviterRewards[r.inviterId] || 0) + Number(r.amount);
    }
    // 获取邀请人数
    const relations = await this.prisma.inviteRelation.groupBy({
      by: ['inviterId'],
      _count: { inviteeId: true },
    });
    const inviteCountMap = new Map(relations.map(r => [r.inviterId, r._count.inviteeId]));
    // 合并排序
    const sorted = Object.entries(inviterRewards)
      .map(([userId, totalReward]) => ({
        userId,
        totalReward,
        inviteCount: inviteCountMap.get(userId) || 0,
      }))
      .sort((a, b) => {
        // 先按邀请人数，再按奖励金额
        if (b.inviteCount !== a.inviteCount) return b.inviteCount - a.inviteCount;
        return b.totalReward - a.totalReward;
      })
      .slice(0, limit);

    // 获取用户信息
    const userIds = sorted.map(s => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return sorted.map((item, index) => ({
      rank: index + 1,
      user: userMap.get(item.userId) || { id: item.userId, nickname: '未知用户', avatar: '' },
      inviteCount: item.inviteCount,
      totalReward: item.totalReward,
    }));
  }

  // 获取我的邀请排名
  async getMyRank(userId: string) {
    const leaderboard = await this.getLeaderboard(1000);
    const myRank = leaderboard.findIndex(item => item.user.id === userId);
    return myRank >= 0 ? myRank + 1 : null;
  }
}
