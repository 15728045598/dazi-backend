import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpectPeople, ExpectTime, WishStatus, WishType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fixImageUrl, fixImageUrls, getBaseUrl } from '../../common/utils/image';

@Injectable()
export class WishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getBaseUrl(): string {
    return getBaseUrl(this.config);
  }

  private fixUserAvatar(user: { avatar?: string | null }) {
    if (user.avatar) {
      return { ...user, avatar: fixImageUrl(user.avatar, this.getBaseUrl()) };
    }
    return user;
  }

  async list(skip = 0, take = 30, type?: string) {
    const where: any = { status: { in: [WishStatus.COLLECTING, WishStatus.FULL] } };
    if (type) {
      where.type = type;
    }
    
    const [items, total] = await Promise.all([
      this.prisma.wish.findMany({
        where,
        include: { 
          user: { select: { id: true, nickname: true, avatar: true } },
          supports: { take: 10, orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.wish.count({ where }),
    ]);

    // Fetch user info for each support
    const allUserIds = items.flatMap(item => item.supports.map(s => s.userId));
    const uniqueUserIds = [...new Set(allUserIds)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const baseUrl = this.getBaseUrl();
    const itemsWithUserSupports = items.map(item => {
      return {
        ...item,
        images: Array.isArray(item.images) ? fixImageUrls(item.images as string[], baseUrl) : item.images,
        user: this.fixUserAvatar(item.user),
        supports: item.supports.map(s => ({
          ...s,
          user: this.fixUserAvatar(userMap.get(s.userId) || { id: s.userId, nickname: '匿名用户', avatar: '' }),
        })),
      };
    });

    return { items: itemsWithUserSupports, total };
  }

  async get(id: string) {
    const wish = await this.prisma.wish.findUnique({
      where: { id },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        supports: { orderBy: { createdAt: 'desc' } }
      },
    });
    if (!wish) throw new NotFoundException('心愿不存在');
    
    // Fetch user info for supports
    const userIds = [...new Set(wish.supports.map(s => s.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const baseUrl = this.getBaseUrl();
    const wishWithUserSupports = {
      ...wish,
      images: Array.isArray(wish.images) ? fixImageUrls(wish.images as string[], baseUrl) : wish.images,
      user: this.fixUserAvatar(wish.user),
      supports: wish.supports.map(s => ({
        ...s,
        user: this.fixUserAvatar(userMap.get(s.userId) || { id: s.userId, nickname: '匿名用户', avatar: '' }),
      })),
    };
    
    // 增加浏览量
    await this.prisma.wish.update({ where: { id }, data: {} });
    
    return wishWithUserSupports;
  }

  async getUserWishes(userId: string) {
    const wishes = await this.prisma.wish.findMany({
      where: { userId },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        supports: true
      },
      orderBy: { createdAt: 'desc' },
    });
    const baseUrl = this.getBaseUrl();
    return wishes.map(wish => ({
      ...wish,
      images: Array.isArray(wish.images) ? fixImageUrls(wish.images as string[], baseUrl) : wish.images,
      user: this.fixUserAvatar(wish.user),
    }));
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
        content: dto.description || dto.title,  // content is required
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
    if (!w) throw new NotFoundException('心愿不存在');
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

  async delete(userId: string, wishId: string) {
    const wish = await this.prisma.wish.findUnique({ where: { id: wishId } });
    if (!wish) throw new NotFoundException('心愿不存在');
    if (wish.userId !== userId) throw new ForbiddenException('无权限删除');
    
    await this.prisma.wish.delete({ where: { id: wishId } });
    return { deleted: true };
  }

  async update(userId: string, wishId: string, dto: {
    title?: string;
    description?: string;
    images?: string[];
    expectTime?: ExpectTime;
    expectPeople?: ExpectPeople;
    tags?: string[];
  }) {
    const wish = await this.prisma.wish.findUnique({ where: { id: wishId } });
    if (!wish) throw new NotFoundException('心愿不存在');
    if (wish.userId !== userId) throw new ForbiddenException('无权限修改');
    
    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.expectTime !== undefined) updateData.expectTime = dto.expectTime;
    if (dto.expectPeople !== undefined) updateData.expectPeople = dto.expectPeople;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    
    return this.prisma.wish.update({
      where: { id: wishId },
      data: updateData,
    });
  }
}
