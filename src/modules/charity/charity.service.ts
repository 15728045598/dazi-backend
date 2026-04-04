import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CharityService {
  constructor(private prisma: PrismaService) {}

  // ===== 公益账户 =====
  
  // 获取公益账户信息
  async getPublicFund() {
    let fund = await this.prisma.publicFund.findFirst();
    if (!fund) {
      fund = await this.prisma.publicFund.create({
        data: { id: 'default', totalDonated: 0, totalSpent: 0, balance: 0 },
      });
    }
    return {
      totalDonated: this.toNum(fund.totalDonated),
      totalSpent: this.toNum(fund.totalSpent),
      balance: this.toNum(fund.balance),
    };
  }

  // ===== 公益活动/Campaign =====
  
  // 获取公益活动列表
  async listCampaigns(skip = 0, take = 20, status?: string) {
    const where: any = {};
    if (status) where.status = status;
    
    const [items, total] = await Promise.all([
      this.prisma.charityCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          _count: { select: { donations: true, volunteers: true } },
        },
      }),
      this.prisma.charityCampaign.count({ where }),
    ]);
    
    return {
      items: items.map(c => ({
        ...c,
        targetAmount: this.toNum(c.targetAmount),
        raisedAmount: this.toNum(c.raisedAmount),
        donationCount: c._count.donations,
        volunteerCount: c._count.volunteers,
      })),
      total,
    };
  }

  // 获取公益活动详情
  async getCampaign(id: string) {
    const campaign = await this.prisma.charityCampaign.findUnique({
      where: { id },
      include: {
        donations: { orderBy: { createdAt: 'desc' }, take: 100 },
        expenses: { orderBy: { createdAt: 'desc' } },
        _count: { select: { donations: true, volunteers: true } },
      },
    });
    if (!campaign) throw new NotFoundException('公益活动不存在');
    
    return {
      ...campaign,
      targetAmount: this.toNum(campaign.targetAmount),
      raisedAmount: this.toNum(campaign.raisedAmount),
      donationCount: campaign._count.donations,
      volunteerCount: campaign._count.volunteers,
    };
  }

  // 创建公益活动
  async createCampaign(data: {
    title: string;
    description: string;
    coverImage?: string;
    targetAmount: number;
    startDate: string;
    endDate?: string;
  }) {
    return this.prisma.charityCampaign.create({
      data: {
        title: data.title,
        description: data.description,
        coverImage: data.coverImage,
        targetAmount: data.targetAmount,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: 'PLANNED',
      },
    });
  }

  // 更新公益活动
  async updateCampaign(id: string, data: {
    title?: string;
    description?: string;
    coverImage?: string;
    targetAmount?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    proofImages?: string[];
    expenseDesc?: string;
  }) {
    const updateData: any = {};
    if (data.title) updateData.title = data.title;
    if (data.description) updateData.description = data.description;
    if (data.coverImage) updateData.coverImage = data.coverImage;
    if (data.targetAmount) updateData.targetAmount = data.targetAmount;
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (data.status) updateData.status = data.status;
    if (data.proofImages) updateData.proofImages = data.proofImages as any;
    if (data.expenseDesc) updateData.expenseDesc = data.expenseDesc;
    
    return this.prisma.charityCampaign.update({
      where: { id },
      data: updateData,
    });
  }

  // 上传支出凭证
  async uploadProofImages(id: string, proofImages: string[], expenseDesc?: string) {
    const campaign = await this.prisma.charityCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('公益活动不存在');
    
    return this.prisma.charityCampaign.update({
      where: { id },
      data: {
        proofImages: proofImages as any,
        expenseDesc,
        status: 'COMPLETED',
      },
    });
  }

  // ===== 捐赠 =====
  
  // 用户主动捐赠
  async createDonation(data: {
    userId?: string;
    amount: number;
    campaignId?: string;
    type: 'PLATFORM_REGISTRATION' | 'USER_DONATION' | 'PLATFORM_DONATION';
    orderId?: string;
    note?: string;
  }) {
    // 获取或创建公益账户
    let fund = await this.prisma.publicFund.findFirst();
    if (!fund) {
      fund = await this.prisma.publicFund.create({
        data: { id: 'default', totalDonated: 0, totalSpent: 0, balance: 0 },
      });
    }
    
    // 创建捐赠记录
    const donation = await this.prisma.charityDonation.create({
      data: {
        userId: data.userId || null,
        amount: data.amount,
        campaignId: data.campaignId || null,
        type: data.type,
        orderId: data.orderId || null,
        note: data.note || null,
      },
    });
    
    // 更新公益账户余额
    const newBalance = this.toNum(fund.balance) + data.amount;
    await this.prisma.publicFund.update({
      where: { id: fund.id },
      data: {
        totalDonated: this.toNum(fund.totalDonated) + data.amount,
        balance: newBalance,
      },
    });
    
    // 记录资金变动
    await this.prisma.publicFundTransaction.create({
      data: {
        fundId: fund.id,
        type: 'DONATION',
        amount: data.amount,
        balance: newBalance,
        description: data.type === 'PLATFORM_REGISTRATION' ? '报名活动捐赠' : '用户捐赠',
        relatedId: donation.id,
        relatedType: 'Donation',
      },
    });
    
    // 如果有目标活动，更新已筹金额
    if (data.campaignId) {
      const campaign = await this.prisma.charityCampaign.findUnique({ where: { id: data.campaignId } });
      if (campaign) {
        await this.prisma.charityCampaign.update({
          where: { id: data.campaignId },
          data: {
            raisedAmount: this.toNum(campaign.raisedAmount) + data.amount,
          },
        });
        
        // 检查是否达到目标
        const newRaised = this.toNum(campaign.raisedAmount) + data.amount;
        if (newRaised >= this.toNum(campaign.targetAmount) && campaign.status === 'PLANNED') {
          await this.prisma.charityCampaign.update({
            where: { id: data.campaignId },
            data: { status: 'FUNDED' },
          });
        }
      }
    }
    
    return donation;
  }

  // 获取捐赠记录（用户端）
  async getDonations(userId?: string, skip = 0, take = 20) {
    const where: any = {};
    if (userId) where.userId = userId;
    
    const [items, total] = await Promise.all([
      this.prisma.charityDonation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, nickname: true } },
          campaign: { select: { id: true, title: true } },
        },
      }),
      this.prisma.charityDonation.count({ where }),
    ]);
    
    // 隐私处理：非本人查看时脱敏
    return {
      items: items.map(d => ({
        id: d.id,
        amount: this.toNum(d.amount),
        type: d.type,
        note: d.note,
        createdAt: d.createdAt,
        // 如果不是本人，隐藏用户信息
        userId: d.userId,
        userName: d.userId ? this.maskName(d.user?.nickname) : '匿名',
        campaignTitle: d.campaign?.title,
      })),
      total,
    };
  }

  // 获取所有捐赠记录（公开账本）
  async getPublicDonations(skip = 0, take = 50) {
    const [items, total] = await Promise.all([
      this.prisma.charityDonation.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          campaign: { select: { id: true, title: true } },
        },
      }),
      this.prisma.charityDonation.count(),
    ]);
    
    return {
      items: items.map(d => ({
        id: d.id,
        amount: this.toNum(d.amount),
        type: d.type,
        createdAt: d.createdAt,
        campaignTitle: d.campaign?.title,
        // 公开显示：匿名，仅显示金额
        displayName: '匿名',
      })),
      total,
    };
  }

  // ===== 支出 =====
  
  // 记录公益支出
  async createExpense(data: {
    campaignId: string;
    amount: number;
    purpose: string;
    beneficiary: string;
    proofImages?: string[];
  }) {
    // 获取公益账户
    let fund = await this.prisma.publicFund.findFirst();
    if (!fund) {
      throw new BadRequestException('公益账户不存在');
    }
    
    const balance = this.toNum(fund.balance);
    if (balance < data.amount) {
      throw new BadRequestException('公益余额不足');
    }
    
    // 创建支出记录
    const expense = await this.prisma.charityExpense.create({
      data: {
        campaignId: data.campaignId,
        amount: data.amount,
        description: data.purpose || '',
        purpose: data.purpose,
        beneficiary: data.beneficiary,
        proofImages: (data.proofImages || []) as any,
      },
    });
    
    // 更新公益账户
    const newBalance = balance - data.amount;
    await this.prisma.publicFund.update({
      where: { id: fund.id },
      data: {
        totalSpent: this.toNum(fund.totalSpent) + data.amount,
        balance: newBalance,
      },
    });
    
    // 记录资金变动
    await this.prisma.publicFundTransaction.create({
      data: {
        fundId: fund.id,
        type: 'EXPENSE',
        amount: -data.amount,
        balance: newBalance,
        description: `公益支出：${data.purpose}`,
        relatedId: expense.id,
        relatedType: 'Expense',
      },
    });
    
    // 更新活动已筹金额（扣除支出）
    const campaign = await this.prisma.charityCampaign.findUnique({ where: { id: data.campaignId } });
    if (campaign) {
      await this.prisma.charityCampaign.update({
        where: { id: data.campaignId },
        data: {
          raisedAmount: Math.max(0, this.toNum(campaign.raisedAmount) - data.amount),
        },
      });
    }
    
    return expense;
  }

  // 获取资金变动记录
  async getFundTransactions(skip = 0, take = 50) {
    const fund = await this.prisma.publicFund.findFirst();
    if (!fund) {
      return { items: [], total: 0 };
    }
    
    const [items, total] = await Promise.all([
      this.prisma.publicFundTransaction.findMany({
        where: { fundId: fund.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.publicFundTransaction.count({ where: { fundId: fund.id } }),
    ]);
    
    return {
      items: items.map(t => ({
        ...t,
        amount: this.toNum(t.amount),
        balance: this.toNum(t.balance),
      })),
      total,
    };
  }

  // 旧版公益项目列表（兼容）
  async listCharityProjects(skip = 0, take = 20) {
    const [items, total] = await Promise.all([
      this.prisma.charityProject.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.charityProject.count({ where: { status: 'ACTIVE' } }),
    ]);
    
    return {
      items: items.map(p => ({
        ...p,
        targetAmount: this.toNum(p.targetAmount),
        raisedAmount: this.toNum(p.raisedAmount),
      })),
      total,
    };
  }

  // ===== 公益文章 (临时注释，等待数据库修复) =====
  /*
  async listArticles(skip = 0, take = 10) {
    return { items: [], total: 0 };
  }
  async getArticle(id: string) {
    throw new NotFoundException('文章功能暂不可用');
  }
  async createArticle(data: any) { return { id: '' }; }
  async updateArticle(id: string, data: any) { return { id }; }
  async deleteArticle(id: string) { return { id }; }
  */
  // ===== 工具函数 =====
  
  private toNum(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (val instanceof Decimal) return parseFloat(val.toString());
    return 0;
  }

  private maskName(name?: string | null): string {
    if (!name) return '匿名';
    if (name.length <= 1) return '*';
    return name[0] + '*'.repeat(name.length - 1);
  }
}