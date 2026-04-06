import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackType, FeedbackStatus } from '@prisma/client';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(userId: string | null, dto: { type: FeedbackType; content: string; contact?: string }) {
    return this.prisma.feedback.create({
      data: {
        userId: userId ?? null,
        type: dto.type,
        content: dto.content,
        contact: dto.contact ?? null,
        status: FeedbackStatus.PENDING,
      },
    });
  }

  async getUserFeedbacks(userId: string, skip = 0, take = 20) {
    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.feedback.count({ where: { userId } }),
    ]);
    return { items, total };
  }
}