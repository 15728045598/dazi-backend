import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpectPeople, ExpectTime, WishStatus, WishType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WishService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take = 30) {
    return this.prisma.wish.findMany({
      where: { status: { in: [WishStatus.COLLECTING, WishStatus.FULL] } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async create(
    userId: string,
    dto: {
      type: WishType;
      title: string;
      description: string;
      images?: string[];
      expectTime: ExpectTime;
      expectPeople: ExpectPeople;
      tags?: string[];
    },
  ) {
    return this.prisma.wish.create({
      data: {
        userId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        images: dto.images ?? [],
        expectTime: dto.expectTime,
        expectPeople: dto.expectPeople,
        tags: dto.tags ?? [],
      },
    });
  }

  async support(userId: string, wishId: string) {
    const w = await this.prisma.wish.findUnique({ where: { id: wishId } });
    if (!w) throw new NotFoundException();
    try {
      await this.prisma.wishSupport.create({ data: { wishId, userId } });
      await this.prisma.wish.update({
        where: { id: wishId },
        data: { supportCount: { increment: 1 } },
      });
      return { supported: true };
    } catch {
      return { supported: false, reason: '已支持过' };
    }
  }
}
