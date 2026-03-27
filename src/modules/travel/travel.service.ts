import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TravelService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take = 20) {
    return this.prisma.travel.findMany({
      where: { status: ContentStatus.APPROVED },
      include: { user: true, activity: true, images: { orderBy: { sort: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async create(
    userId: string,
    dto: { title: string; content: string; coverImage?: string; activityId?: string; imageUrls?: string[] },
  ) {
    const travel = await this.prisma.travel.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        coverImage: dto.coverImage,
        activityId: dto.activityId,
        status: ContentStatus.PENDING,
        images: dto.imageUrls?.length
          ? {
              create: dto.imageUrls.map((url, i) => ({ url, sort: i })),
            }
          : undefined,
      },
      include: { images: true },
    });
    return travel;
  }

  async like(userId: string, travelId: string) {
    const t = await this.prisma.travel.findUnique({ where: { id: travelId } });
    if (!t) throw new NotFoundException();
    const existing = await this.prisma.travelLike.findUnique({
      where: { travelId_userId: { travelId, userId } },
    });
    if (existing) {
      await this.prisma.travelLike.delete({ where: { id: existing.id } });
      await this.prisma.travel.update({
        where: { id: travelId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false };
    }
    await this.prisma.travelLike.create({ data: { travelId, userId } });
    await this.prisma.travel.update({
      where: { id: travelId },
      data: { likeCount: { increment: 1 } },
    });
    return { liked: true };
  }
}
