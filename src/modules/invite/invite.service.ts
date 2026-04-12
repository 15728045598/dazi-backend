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
    
    // 统计已邀请人数
    const invitedCount = await this.prisma.inviteRelation.count({ where: { inviterId: userId } });
    
    // 统计已注册人数（通过InviteRelation获取）
    const registeredCount = invitedCount;
    
    // 统计已参加活动人数（被邀请人完成过订单）
    const inviteeIds = await this.prisma.inviteRelation.findMany({ where: { inviterId: userId }, select: { inviteeId: true } });
    const participatedCount = await this.prisma.order.count({
      where: {
        userId: { in: inviteeIds.map(r => r.inviteeId) },
        status: { in: ['COMPLETED', 'VERIFIED'] },
      },
    });
    
    // 获取邀请获得的优惠券（NEW_USER 和 INVITE 类型）
    const userCoupons = await this.prisma.userCoupon.findMany({
      where: { 
        userId,
        coupon: {
          type: { in: ['NEW_USER', 'INVITE'] },
        },
      },
      include: { coupon: true },
      orderBy: { createdAt: 'desc' },
    });
    
    const totalCoupons = userCoupons.length;
    const usedCoupons = userCoupons.filter(uc => uc.status === 'USED').length;
    
    const couponRecords = userCoupons.map(uc => ({
      id: uc.id,
      name: uc.coupon?.name,
      type: uc.coupon?.type,
      value: toNum(uc.coupon?.value || 0),
      status: uc.status,
      endTime: uc.endTime,
      createdAt: uc.createdAt,
    }));
    
    // 获取推广大使信息
    const promoter = await this.prisma.promoter.findUnique({
      where: { userId },
    });
    
    return {
      inviteCode,
      invitedCount,
      registeredCount,
      participatedCount,
      isPromoter: !!promoter,
      promoterStatus: promoter?.status ?? null,
      couponCount: totalCoupons,
      couponUsedCount: usedCoupons,
      coupons: couponRecords,
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
      where: { inviterId_inviteeId: { inviterId: inviter.id, inviteeId: inviteeUserId } },
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
    
    // 发放新人优惠券给被邀请人
    await this.grantNewUserCoupon(inviteeUserId);
    
    // 发放邀请优惠券给邀请人（只能得优惠券）
    await this.grantInviteCoupon(inviter.id, inviteeUserId);
    
    return { ok: true };
  }

  // 发放新人优惠券
  async grantNewUserCoupon(userId: string) {
    // 查找新人优惠券 - 使用现有的 Coupon 表
    const coupon = await this.prisma.coupon.findFirst({
      where: { type: 'NEW_USER', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!coupon) return null;
    
    // 检查用户是否已领取过
    const existing = await this.prisma.userCoupon.count({
      where: {
        userId,
        couponId: coupon.id,
      },
    });
    if (existing >= coupon.userLimit) return null;
    
    // 发放给用户
    const now = new Date();
    const end = coupon.endTime || new Date(now.getTime() + coupon.validDays * 86400000);
    
    return this.prisma.userCoupon.create({
      data: {
        userId,
        couponId: coupon.id,
        startTime: now,
        endTime: end,
      },
    });
  }

  // 发放邀请优惠券给邀请人
  async grantInviteCoupon(inviterId: string, inviteeId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { type: 'INVITE', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!coupon) return null;
    
    // 检查是否已达领取上限
    const existing = await this.prisma.userCoupon.count({
      where: {
        userId: inviterId,
        couponId: coupon.id,
      },
    });
    if (existing >= coupon.userLimit) return null;
    
    const now = new Date();
    const end = coupon.endTime || new Date(now.getTime() + coupon.validDays * 86400000);
    
    return this.prisma.userCoupon.create({
      data: {
        userId: inviterId,
        couponId: coupon.id,
        startTime: now,
        endTime: end,
      },
    });
  }

  // 发放邀请奖励（旧版兼容）
  async grantInviteReward(inviterId: string, inviteeId: string, type: string, amount: number, currency = 'CNY') {
    const reward = await this.prisma.inviteReward.create({
      data: {
        userId: inviterId,
        inviterId,
        inviteeId,
        type,
        amount,
        currency,
        status: 'PAID',
      },
    });
    return reward;
  }

  // 活动完成后的推广大使奖励结算
  async settlePromoterActivityReward(activityId: string, userId: string) {
    // 查找该用户的邀请人
    const relation = await this.prisma.inviteRelation.findFirst({
      where: { inviteeId: userId },
    });
    if (!relation) return null;
    
    // 检查邀请人是否是推广大使
    const promoter = await this.prisma.promoter.findUnique({
      where: { userId: relation.inviterId },
    });
    if (!promoter || promoter.status !== 'ACTIVE') return null;
    
    // 获取活动信息
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity) return null;
    
    // 检查该活动是否已有奖励记录（防止重复结算）
    const existingReward = await this.prisma.promoterReward.findFirst({
      where: {
        promoterId: promoter.id,
        activityId,
      },
    });
    if (existingReward) return null;
    
    // 统计该被邀请人已完成的活动数量
    const completedActivities = await this.prisma.promoterReward.count({
      where: {
        promoterId: promoter.id,
        userId,
        status: { in: ['SETTLED', 'WITHDRAWN'] },
      },
    });
    
    // 首次参加活动得5元，后续每次得1元
    const rewardAmount = completedActivities === 0 ? 5 : 1;
    
    // 创建奖励记录并更新推广大使收益
    await this.prisma.$transaction([
      this.prisma.promoterReward.create({
        data: {
          promoterId: promoter.id,
          type: 'ACTIVITY',
          amount: rewardAmount,
          status: 'SETTLED',
          activityId,
          activityTitle: activity.title,
          userId,
          settledAt: new Date(),
        },
      }),
      this.prisma.promoter.update({
        where: { id: promoter.id },
        data: {
          totalEarnings: { increment: rewardAmount },
          pendingEarnings: { increment: rewardAmount },
        },
      }),
    ]);
    
    return { amount: rewardAmount };
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
      if (r.inviterId) {
        inviterRewards[r.inviterId] = (inviterRewards[r.inviterId] || 0) + Number(r.amount);
      }
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

  // 获取推广大使收益信息
  async getPromoterEarnings(userId: string) {
    const promoter = await this.prisma.promoter.findUnique({
      where: { userId },
      include: {
        rewards: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!promoter) return null;
    
    return {
      totalEarnings: toNum(promoter.totalEarnings),
      pendingEarnings: toNum(promoter.pendingEarnings),
      withdrawnAmount: toNum(promoter.withdrawnAmount),
      availableBalance: toNum(Number(promoter.totalEarnings) - Number(promoter.withdrawnAmount)),
      status: promoter.status,
      rewards: promoter.rewards.map((r) => ({
        ...r,
        amount: toNum(r.amount),
      })),
    };
  }

  // 推广大使提现
  async withdrawPromoterEarnings(userId: string, amount: number) {
    const promoter = await this.prisma.promoter.findUnique({
      where: { userId },
    });
    if (!promoter) throw new Error('不是推广大使');
    if (promoter.status !== 'ACTIVE') throw new Error('推广大使已禁用');
    
    const available = Number(promoter.totalEarnings) - Number(promoter.withdrawnAmount);
    if (available < amount) throw new Error('余额不足');
    if (amount < 10) throw new Error('提现金额最低10元');
    
    // TODO: 调用微信支付提现
    // 这里先更新数据库记录
    await this.prisma.$transaction([
      this.prisma.promoter.update({
        where: { id: promoter.id },
        data: { withdrawnAmount: { increment: amount } },
      }),
      this.prisma.promoterReward.updateMany({
        where: {
          promoterId: promoter.id,
          status: 'SETTLED',
        },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
        },
      }),
    ]);
    
    return { ok: true, amount };
  }
}
