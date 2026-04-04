import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Activity,
  ActivityCategory,
  ActivityStatus,
  Difficulty,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // 获取基础URL（用于拼接完整图片URL）
  private getBaseUrl(): string {
    const port = this.config.get<string>('PORT') || '3000';
    return `http://localhost:${port}`;
  }

  // 修复图片URL：转换为完整URL供小程序使用
  // 数据库存储 /uploads/xxx，静态文件服务 /uploads/xxx
  private fixImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    
    const baseUrl = this.getBaseUrl();
    if (url.startsWith('/uploads/')) {
      // 转换为完整URL: /uploads/xxx -> http://localhost:3000/uploads/xxx
      return `${baseUrl}${url}`;
    }
    return url;
  }

  // 修复图片URL数组
  private fixImageUrls(urls: (string | null | undefined)[] | null | undefined): string[] {
    if (!urls) return [];
    return urls.map(url => this.fixImageUrl(url) || '').filter(Boolean);
  }

  mapActivity(a: Activity & Record<string, unknown>) {
    const result: Record<string, unknown> = {
      ...a,
      price: toNum(a.price),
      originalPrice: a.originalPrice != null ? toNum(a.originalPrice) : null,
      earlyBirdPrice: a.earlyBirdPrice != null ? toNum(a.earlyBirdPrice) : null,
      charityAmount: toNum(a.charityAmount),
      costIncludes: a.costIncludes,
      costExcludes: a.costExcludes,
      requirementsText: a.requirements,
      refundPolicy: a.refundPolicy,
      disclaimer: a.disclaimer,
      summary: a.summary,
    };
    // 修复封面图片URL
    if ('coverImage' in a) {
      result.coverImage = this.fixImageUrl(a.coverImage as string);
    }
    // 修复群聊二维码URL
    if ('groupChatQrCode' in a && a.groupChatQrCode) {
      result.groupChatQrCode = this.fixImageUrl(a.groupChatQrCode as string);
    }
    // 修复详情图片URL数组
    if ('descriptionImages' in a) {
      result.descriptionImages = this.fixImageUrls(a.descriptionImages as (string | null)[]);
    }
    // 修复images关联表的URL
    if (a.images && Array.isArray(a.images)) {
      result.images = (a.images as { url?: string }[]).map(img => ({
        ...img,
        url: this.fixImageUrl(img.url),
      }));
    }
    // 修复priceTypes
    if (a.priceTypes && Array.isArray(a.priceTypes)) {
      result.priceTypes = (a.priceTypes as { price?: unknown }[]).map(pt => ({
        ...pt,
        price: pt.price != null ? toNum(pt.price as number) : 0,
      }));
    }
    return result;
  }

  async list(params: { category?: ActivityCategory; status?: ActivityStatus; skip?: number; take?: number }) {
    const where: Prisma.ActivityWhereInput = {};
    if (params.category) where.category = params.category;
    if (params.status) where.status = params.status;
    else where.status = { in: [ActivityStatus.PUBLISHED, ActivityStatus.IN_PROGRESS] };

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          leader: { include: { user: true } },
          images: { orderBy: { sort: 'asc' } },
          priceTypes: { orderBy: { sort: 'asc' } },
        },
        orderBy: { startTime: 'asc' },
        skip: params.skip ?? 0,
        take: params.take ?? 20,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items: items.map((a) => this.mapActivity(a as Activity & Record<string, unknown>)),
      total,
    };
  }

  async getById(id: string) {
    const a = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        leader: { include: { user: true } },
        images: { orderBy: { sort: 'asc' } },
        schedules: { orderBy: { day: 'asc' } },
        activityRequirementList: true,
        priceTypes: { orderBy: { sort: 'asc' } },
      },
    });
    if (!a) throw new NotFoundException('活动不存在');
    return this.mapActivity(a as Activity & Record<string, unknown>);
  }

  async create(
    leaderUserId: string,
    dto: {
      title: string;
      description: string;
      coverImage: string;
      category: ActivityCategory;
      difficulty: Difficulty;
      startTime: string;
      endTime: string;
      registerDeadline: string;
      location: string;
      price: number;
      minParticipants?: number;
      maxParticipants?: number;
    },
  ) {
    const leader = await this.prisma.leader.findFirst({
      where: { userId: leaderUserId, status: 'ACTIVE' },
    });
    if (!leader) {
      throw new BadRequestException('需为已认证领队才可发布活动');
    }

    const activity = await this.prisma.activity.create({
      data: {
        title: dto.title,
        description: dto.description,
        coverImage: dto.coverImage,
        category: dto.category,
        difficulty: dto.difficulty,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        registerDeadline: new Date(dto.registerDeadline),
        location: dto.location,
        price: dto.price,
        minParticipants: dto.minParticipants ?? 2,
        maxParticipants: dto.maxParticipants ?? 30,
        leaderId: leader.id,
        status: ActivityStatus.PENDING,
      },
      include: { leader: true, images: true },
    });

    return this.mapActivity(activity as Activity & Record<string, unknown>);
  }

  async getParticipants(activityId: string) {
    // 获取活动的报名人员列表
    const orders = await this.prisma.order.findMany({
      where: {
        activityId,
        status: 'PAID',
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(order => ({
      id: order.id,
      user: order.user,
      createdAt: order.createdAt.toISOString(),
    }));
  }
}
