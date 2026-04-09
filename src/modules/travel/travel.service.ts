import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fixImageUrl, getBaseUrl } from '../../common/utils/image';

@Injectable()
export class TravelService {
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

  async list(skip = 0, take = 20) {
    const where = { status: ContentStatus.APPROVED };
    const [items, total] = await Promise.all([
      this.prisma.travel.findMany({
        where,
        include: { 
          user: { select: { id: true, nickname: true, avatar: true } }, 
          activity: { select: { id: true, title: true } },
          imageList: { orderBy: { sort: 'asc' } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.travel.count({ where }),
    ]);
    const fixedItems = items.map(item => {
      const baseUrl = this.getBaseUrl();
      return {
        ...item,
        coverImage: item.coverImage ? fixImageUrl(item.coverImage, baseUrl) : item.coverImage,
        images: item.imageList?.map(img => ({ ...img, url: img.url ? fixImageUrl(img.url, baseUrl) : img.url })),
        user: this.fixUserAvatar(item.user),
      };
    });
    return { items: fixedItems, total };
  }

  async get(id: string) {
    const travel = await this.prisma.travel.findUnique({
      where: { id },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        activity: {
          select: { 
            id: true, 
            title: true, 
            coverImage: true,
            location: true,
            startTime: true,
            endTime: true,
            price: true,
          }
        },
        imageList: { orderBy: { sort: 'asc' } },
        likes_: true,
      },
    });
    if (!travel) throw new NotFoundException('游记不存在');
    
    // 增加浏览量
    await this.prisma.travel.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    // 获取活动参与者
    let participants: { user: { id: string; nickname: string | null; avatar: string | null } }[] = [];
    let activityInfo: any = null;
    const baseUrl = this.getBaseUrl();
    if (travel.activityId) {
      const orders = await this.prisma.order.findMany({
        where: { activityId: travel.activityId, status: 'PAID' },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
      });
      participants = orders.map(o => ({ user: { id: o.user.id, nickname: o.user.nickname, avatar: o.user.avatar } }));
      
      const activity = await this.prisma.activity.findUnique({
        where: { id: travel.activityId },
        select: { id: true, title: true, location: true, startTime: true, endTime: true, price: true, currentCount: true, maxParticipants: true },
      });
      if (activity) {
        activityInfo = { ...activity };
      }
    }
    
    return {
      ...travel,
      coverImage: travel.coverImage ? fixImageUrl(travel.coverImage, baseUrl) : travel.coverImage,
      images: travel.imageList?.map(img => ({ ...img, url: img.url ? fixImageUrl(img.url, baseUrl) : img.url })),
      user: this.fixUserAvatar(travel.user),
      activity: travel.activity ? {
        ...travel.activity,
        coverImage: travel.activity.coverImage ? fixImageUrl(travel.activity.coverImage, baseUrl) : travel.activity.coverImage,
      } : null,
      activityInfo,
      participants,
    };
  }

  async getUserTravels(userId: string) {
    const travels = await this.prisma.travel.findMany({
      where: { userId },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        activity: { select: { id: true, title: true } },
        imageList: { orderBy: { sort: 'asc' } }
      },
      orderBy: { createdAt: 'desc' },
    });
    const baseUrl = this.getBaseUrl();
    return travels.map(travel => ({
      ...travel,
      coverImage: travel.coverImage ? fixImageUrl(travel.coverImage, baseUrl) : travel.coverImage,
      images: travel.imageList?.map(img => ({ ...img, url: img.url ? fixImageUrl(img.url, baseUrl) : img.url })),
      user: this.fixUserAvatar(travel.user),
    }));
  }

  async create(
    userId: string,
    dto: { title: string; content: string; coverImage?: string; activityId?: string; imageUrls?: string[] },
  ) {
    // 过滤掉空字符串和 null 的图片 URL
    const validImageUrls = (dto.imageUrls || []).filter((url) => url && url.trim() !== '');
    const travel = await this.prisma.travel.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        coverImage: dto.coverImage || null,
        activityId: dto.activityId || null,
        status: ContentStatus.PENDING,
        imageList: validImageUrls.length
          ? {
              create: validImageUrls.map((url, i) => ({ url, sort: i })),
            }
          : undefined,
      },
      include: { imageList: true },
    });
    return travel;
  }

  async like(userId: string, travelId: string) {
    const t = await this.prisma.travel.findUnique({ where: { id: travelId } });
    if (!t) throw new NotFoundException('游记不存在');
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

  async getComments(travelId: string, skip = 0, take = 50) {
    const [items, total] = await Promise.all([
      this.prisma.travelComment.findMany({
        where: { travelId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.travelComment.count({ where: { travelId } }),
    ]);
    
    // Fetch user info for each comment
    const userIds = [...new Set(items.map(c => c.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const itemsWithUser = items.map(c => ({
      ...c,
      user: this.fixUserAvatar(userMap.get(c.userId) || { id: c.userId, nickname: '匿名用户', avatar: '' }),
    }));
    
    return { items: itemsWithUser, total };
  }

  async addComment(userId: string, travelId: string, content: string, parentId?: string) {
    const travel = await this.prisma.travel.findUnique({ where: { id: travelId } });
    if (!travel) throw new NotFoundException('游记不存在');
    
    const comment = await this.prisma.travelComment.create({
      data: { travelId, userId, content, parentId },
    });
    
    // Fetch user info
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatar: true },
    });
    
    // 增加评论数
    await this.prisma.travel.update({
      where: { id: travelId },
      data: { commentCount: { increment: 1 } },
    });
    
    return { ...comment, user: this.fixUserAvatar(user || { id: userId, nickname: '匿名用户', avatar: '' }) };
  }

  async deleteComment(userId: string, travelId: string, commentId: string) {
    const comment = await this.prisma.travelComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('评论不存在');
    if (comment.userId !== userId) throw new ForbiddenException('无权限删除');
    
    await this.prisma.travelComment.delete({ where: { id: commentId } });
    
    // 减少评论数
    await this.prisma.travel.update({
      where: { id: travelId },
      data: { commentCount: { decrement: 1 } },
    });
    
    return { deleted: true };
  }

  async delete(userId: string, travelId: string) {
    const travel = await this.prisma.travel.findUnique({ where: { id: travelId } });
    if (!travel) throw new NotFoundException('游记不存在');
    if (travel.userId !== userId) throw new ForbiddenException('无权限删除');
    
    await this.prisma.travel.delete({ where: { id: travelId } });
    return { deleted: true };
  }
}
