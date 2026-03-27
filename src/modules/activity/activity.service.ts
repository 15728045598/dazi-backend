import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  mapActivity(a: Activity & Record<string, unknown>) {
    return {
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
        activityRequirements: true,
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
}
