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
    
    // 同步 pointsAccount 数据到 User 返回数据
    // 使用 pointsAccount 的累计数据作为主要数据源
    if (user.pointsAccount) {
      return {
        ...user,
        points: user.pointsAccount.balance,
        totalPointsEarned: user.pointsAccount.totalEarned,
        totalPointsUsed: user.pointsAccount.totalUsed,
      };
    }
    
    return user;
  }

  async updateProfile(
    userId: string,
    data: { nickname?: string; avatar?: string; city?: string; bio?: string; gender?: string },
  ) {
    // Update user table fields
    const userData: Record<string, unknown> = {};
    if (data.nickname !== undefined) userData.nickname = data.nickname;
    if (data.avatar !== undefined) userData.avatar = data.avatar;
    
    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userData,
      });
    }
    
    // Update profile table fields
    const profileData: Record<string, unknown> = {};
    if (data.city !== undefined) profileData.city = data.city;
    if (data.bio !== undefined) profileData.bio = data.bio;
    if (data.gender !== undefined) profileData.gender = data.gender;
    
    if (Object.keys(profileData).length > 0) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          ...profileData,
        },
        update: profileData,
      });
    }
    return this.getMe(userId);
  }
}
