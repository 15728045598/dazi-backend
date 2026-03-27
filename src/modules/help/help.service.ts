import { Injectable } from '@nestjs/common';
import { HelpStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HelpService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take = 30) {
    return this.prisma.help.findMany({
      where: { status: { in: [HelpStatus.ACTIVE, HelpStatus.RESPONDED] } },
      include: { user: true, responses: { take: 3, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async create(
    userId: string,
    dto: {
      type: string;
      title: string;
      description: string;
      images?: string[];
      urgency: string;
      location?: string;
      rewardPoints?: number;
    },
  ) {
    return this.prisma.help.create({
      data: {
        userId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        images: dto.images ?? [],
        urgency: dto.urgency,
        location: dto.location,
        rewardPoints: dto.rewardPoints ?? 0,
      },
    });
  }

  async respond(userId: string, helpId: string, message: string) {
    return this.prisma.helpResponse.create({
      data: { helpId, userId, message },
    });
  }
}
