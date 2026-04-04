import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HelpStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fixImageUrl, fixImageUrls, getBaseUrl } from '../../common/utils/image';

@Injectable()
export class HelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getBaseUrl(): string {
    return getBaseUrl(this.config);
  }

  private fixUserAvatar(user: { avatar?: string | null } & Record<string, unknown>) {
    if (user.avatar) {
      return { ...user, avatar: fixImageUrl(user.avatar as string, this.getBaseUrl()) };
    }
    return user;
  }

  private fixHelpImages(help: Record<string, unknown>) {
    const images = help.images;
    if (Array.isArray(images)) {
      return { ...help, images: fixImageUrls(images as string[], this.getBaseUrl()) };
    }
    return help;
  }

  async list(skip = 0, take = 30, type?: string, status?: string) {
    const where: any = { status: { in: [HelpStatus.ACTIVE, HelpStatus.RESPONDED] } };
    if (type) where.type = type;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.help.findMany({
        where,
        include: { 
          user: { select: { id: true, nickname: true, avatar: true } },
          responses: { take: 3, orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.help.count({ where }),
    ]);
    
    const fixedItems = items.map(item => ({
      ...this.fixHelpImages(this.fixUserAvatar(item)),
      user: this.fixUserAvatar({ ...item.user }),
      responses: item.responses.map(r => ({
        ...r,
        user: this.fixUserAvatar({ id: r.userId, nickname: '匿名用户', avatar: '' }),
      })),
    }));
    return { items: fixedItems, total };
  }

  async get(id: string) {
    const help = await this.prisma.help.findUnique({
      where: { id },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        responses: { orderBy: { createdAt: 'desc' } }
      },
    });
    if (!help) throw new NotFoundException('互助不存在');
    return {
      ...this.fixHelpImages(this.fixUserAvatar(help)),
      user: this.fixUserAvatar({ ...help.user }),
      responses: help.responses.map(r => ({
        ...r,
        user: this.fixUserAvatar({ id: r.userId, nickname: '匿名用户', avatar: '' }),
      })),
    };
  }

  async getUserHelps(userId: string) {
    const helps = await this.prisma.help.findMany({
      where: { userId },
      include: { 
        user: { select: { id: true, nickname: true, avatar: true } },
        responses: true
      },
      orderBy: { createdAt: 'desc' },
    });
    return helps.map(help => ({
      ...this.fixHelpImages(this.fixUserAvatar(help)),
      user: this.fixUserAvatar({ ...help.user }),
    }));
  }

  async getResponses(helpId: string, skip = 0, take = 50) {
    const [items, total] = await Promise.all([
      this.prisma.helpResponse.findMany({
        where: { helpId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.helpResponse.count({ where: { helpId } }),
    ]);
    
    // Fetch user info for each response
    const userIds = [...new Set(items.map(r => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const itemsWithUser = items.map(r => ({
      ...r,
      user: this.fixUserAvatar(userMap.get(r.userId) || { id: r.userId, nickname: '匿名用户', avatar: '' }),
    }));
    
    return { items: itemsWithUser, total };
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
        content: dto.description || dto.title,  // content is required
        description: dto.description,
        images: dto.images ?? [],
        // urgency and rewardPoints not in schema
        location: dto.location,
      },
    });
  }

  async respond(userId: string, helpId: string, message: string) {
    const help = await this.prisma.help.findUnique({ where: { id: helpId } });
    if (!help) throw new NotFoundException('互助不存在');
    
    const response = await this.prisma.helpResponse.create({
      data: { helpId, userId, content: message, message },
    });
    
    // Fetch user info for the response
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatar: true },
    });
    
    // 更新状态为已响应
    await this.prisma.help.update({
      where: { id: helpId },
      data: { status: HelpStatus.RESPONDED },
    });
    
    return { ...response, user: this.fixUserAvatar(user || { id: userId, nickname: '匿名用户', avatar: '' }) };
  }

  async delete(userId: string, helpId: string) {
    const help = await this.prisma.help.findUnique({ where: { id: helpId } });
    if (!help) throw new NotFoundException('互助不存在');
    if (help.userId !== userId) throw new ForbiddenException('无权限删除');
    
    await this.prisma.help.delete({ where: { id: helpId } });
    return { deleted: true };
  }

  async update(userId: string, helpId: string, dto: {
    title?: string;
    description?: string;
    images?: string[];
    urgency?: string;
    location?: string;
    rewardPoints?: number;
  }) {
    const help = await this.prisma.help.findUnique({ where: { id: helpId } });
    if (!help) throw new NotFoundException('互助不存在');
    if (help.userId !== userId) throw new ForbiddenException('无权限修改');
    
    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.location !== undefined) updateData.location = dto.location;
    
    return this.prisma.help.update({
      where: { id: helpId },
      data: updateData,
    });
  }
}
