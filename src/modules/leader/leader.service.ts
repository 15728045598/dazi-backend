import { BadRequestException, Injectable } from '@nestjs/common';
import { Experience, LeaderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeaderService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const leader = await this.prisma.leader.findUnique({ where: { userId } });
    const application = await this.prisma.leaderApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { leader, application };
  }

  async apply(
    userId: string,
    dto: {
      realName: string;
      idCard: string;
      bio: string;
      experience: Experience;
      specialties: string[];
      certificates: string[];
      experienceDesc: string;
      emergencyContact: string;
      emergencyPhone: string;
    },
  ) {
    const existing = await this.prisma.leader.findUnique({ where: { userId } });
    if (existing && existing.status === LeaderStatus.ACTIVE) {
      throw new BadRequestException('已是认证领队');
    }
    return this.prisma.leaderApplication.create({
      data: {
        userId,
        realName: dto.realName,
        idCard: dto.idCard,
        bio: dto.bio,
        experience: dto.experience,
        specialties: dto.specialties,
        certificates: dto.certificates,
        experienceDesc: dto.experienceDesc,
        emergencyContact: dto.emergencyContact,
        emergencyPhone: dto.emergencyPhone,
      },
    });
  }
}
