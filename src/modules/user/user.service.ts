import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, leader: true, pointsAccount: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async updateProfile(
    userId: string,
    data: { nickname?: string; city?: string; bio?: string },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { nickname: data.nickname },
    });
    if (data.city !== undefined || data.bio !== undefined) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          city: data.city,
          bio: data.bio,
        },
        update: {
          city: data.city,
          bio: data.bio,
        },
      });
    }
    return this.getMe(userId);
  }
}
