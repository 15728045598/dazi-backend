import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  ActivityCategory,
  ActivityStatus,
  ContentStatus,
  CouponStatus,
  CouponType,
  Difficulty,
  HelpStatus,
  LeaderStatus,
  MessageType,
  OrderStatus,
  PointsType,
  Prisma,
  ProjectStatus,
  UserRole,
  UserStatus,
  WishStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly settingsPath = join(process.cwd(), 'data', 'system-settings.json');

  // 默认退款政策
  private getDefaultRefundPolicy() {
    return `活动前48小时内退出，退还50%费用
活动前24小时内退出，不退还费用
如遇恶劣天气或人数不足，活动延期或取消，全额退款`;
  }

  // 默认免责声明
  private getDefaultDisclaimer() {
    return `适合人群：本次活动为中等强度徒步，适合有一定运动基础的朋友参加。

安全第一：户外活动存在一定风险，请参与者注意自身安全，遵守团队纪律，听从领队安排。

风险自负原则：户外活动存在不可预见的风险。参与者须充分认知并自愿承担。组织方仅提供路线倡议与同行平台，不承担任何法律及经济责任。

赏花礼仪：请勿攀折樱花树枝，文明赏花，爱护自然环境。

环保公约：自备垃圾袋，践行无痕山野。建议携带水壶，减少塑料瓶使用。`;
  }

  private defaultSettings() {
    return {
      general: {
        appName: '搭子小程序',
        contactPhone: '',
        contactEmail: '',
        enableRegister: true,
        enableLeaderApply: true,
        logo: '',
      },
      points: {
        signInBase: 5,
        signInMax: 20,
        stepsRate: 1000,
        stepsMax: 200,
        inviteReward: 50,
        deductionRate: 30,
        deductionMin: 50,
      },
      wechat: {
        appid: '',
        secret: '',
        mchid: '',
        apiKey: '',
        notifyUrl: '',
        templateIdOrder: '',
        templateIdActivity: '',
      },
      about: {
        version: 'v1.0.0',
        changelog: '',
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getSystemSettings() {
    try {
      const raw = await readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return { ...this.defaultSettings(), ...parsed };
    } catch {
      return this.defaultSettings();
    }
  }

  async updateSystemSettings(dto: Record<string, unknown>) {
    const prev = await this.getSystemSettings();
    const asObj = (v: unknown): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    const next = {
      ...prev,
      ...dto,
      general: { ...asObj((prev as Record<string, unknown>).general), ...asObj(dto.general) },
      points: { ...asObj((prev as Record<string, unknown>).points), ...asObj(dto.points) },
      wechat: { ...asObj((prev as Record<string, unknown>).wechat), ...asObj(dto.wechat) },
      about: { ...asObj((prev as Record<string, unknown>).about), ...asObj(dto.about) },
      updatedAt: new Date().toISOString(),
    };
    const dir = join(process.cwd(), 'data');
    await mkdir(dir, { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  async dashboard(startDate?: string, endDate?: string) {
    // 日期范围筛选
    let dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate + ' 23:59:59'),
      };
    }

    // 本周和上周统计 (如果无日期筛选)
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setHours(0, 0, 0, 0);
    
    const [
      userCount,
      activityCount,
      orderCount,
      pointsSum,
      todayOrders,
      todayUsers,
      pendingActivities,
      pendingLeaders,
      pendingTravels,
      pendingRefunds,
      // 上周数据用于计算变化率
      lastWeekUsers,
      lastWeekOrders,
      lastWeekActivities,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.activity.count(),
      this.prisma.order.count(),
      this.prisma.pointsAccount.aggregate({ _sum: { balance: true } }),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().toDateString()) } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(new Date().toDateString()) } },
      }),
      this.prisma.activity.count({ where: { status: ActivityStatus.PENDING } }),
      this.prisma.leaderApplication.count({ where: { status: 'PENDING' } }),
      this.prisma.travel.count({ where: { status: ContentStatus.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatus.REFUNDING } }),
      // 上周统计
      this.prisma.user.count({
        where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
      this.prisma.activity.count({
        where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
    ]);

    const trend: { date: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      const value = await this.prisma.order.count({
        where: { createdAt: { gte: start, lte: end } },
      });
      trend.push({ date: start.toISOString().slice(5, 10), value });
    }

    // 用户来源分布 (基于邀请关系)
    const inviteStats = await this.prisma.inviteRelation.groupBy({
      by: ['inviterId'],
      _count: { inviterId: true },
    });
    const invitedCount = inviteStats.reduce((sum, g) => sum + g._count.inviterId, 0);
    const directCount = userCount - invitedCount;
    const userSourceData = [
      { type: '直接注册', value: directCount },
      { type: '邀请注册', value: invitedCount },
      { type: '其他', value: Math.max(0, userCount * 0.1) },
    ].map(item => ({ ...item, value: Math.round(item.value) }));

    // 活动分类统计
    const activityStats = await this.prisma.activity.groupBy({
      by: ['category'],
      _count: { id: true },
    });
    const activityCategoryData = activityStats
      .map(s => ({ category: s.category || '其他', count: s._count.id }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 计算变化率
    const calcChange = (current: number, last: number) => {
      if (last === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - last) / last) * 100);
    };

    return {
      userCount,
      todayUsers,
      activityCount,
      orderCount,
      todayOrders,
      pointsIssued: pointsSum._sum.balance ?? 0,
      pendingActivities,
      pendingLeaders,
      pendingTravels,
      pendingRefunds,
      orderTrend: trend,
      // 新增图表数据
      userSourceData,
      activityCategoryData,
      // 新增变化率
      changes: {
        userCount: calcChange(userCount, userCount - todayUsers),
        todayUsers: calcChange(todayUsers, lastWeekUsers || 1),
        activityCount: calcChange(activityCount, activityCount - (await this.prisma.activity.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }))),
        orderCount: calcChange(orderCount, orderCount - (await this.prisma.order.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }))),
        pointsIssued: calcChange(pointsSum._sum.balance ?? 0, (pointsSum._sum.balance ?? 0) * 0.9),
        todayOrders: calcChange(todayOrders, lastWeekOrders || 1),
      },
    };
  }

  async listUsers(params: {
    skip?: number;
    take?: number;
    status?: UserStatus;
    role?: string;
    keyword?: string;
  }) {
    const where: Prisma.UserWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.role) where.role = params.role as UserRole;
    if (params.keyword?.trim()) {
      const k = params.keyword.trim();
      where.OR = [
        { nickname: { contains: k } },
        { phone: { contains: k } },
        { openid: { contains: k } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
        skip: params.skip ?? 0,
        take: params.take ?? 20,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getUser(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, leader: true, pointsAccount: true },
    });
    if (!u) throw new NotFoundException();
    return u;
  }

  async updateUserStatus(id: string, status: UserStatus) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async updateUserRole(id: string, role: UserRole) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    return this.prisma.user.update({ where: { id }, data });
  }

  async deleteUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    // Soft delete: mark as DELETED status
    return this.prisma.user.update({ where: { id }, data: { status: UserStatus.DELETED } });
  }

  async listActivities(
    skip = 0,
    take = 20,
    opts?: { keyword?: string; category?: ActivityCategory; status?: ActivityStatus },
  ) {
    const where: Prisma.ActivityWhereInput = {};
    if (opts?.keyword?.trim()) {
      where.OR = [
        { title: { contains: opts.keyword.trim() } },
        { location: { contains: opts.keyword.trim() } },
      ];
    }
    if (opts?.category) where.category = opts.category;
    if (opts?.status) where.status = opts.status;
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { 
          leader: { include: { user: true } },  // 单领队字段（兼容）
          leaders: { include: { leader: { include: { user: true } } } },  // 多领队表
          images: true 
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.activity.count({ where }),
    ]);
    const items = rows.map((a) => {
      // 优先使用多领队表，否则使用单领队字段
      let leaderName = '-';
      if (a.leaders && a.leaders.length > 0) {
        // 从多领队表获取领队名称
        const leaderNames = a.leaders
          .map(l => l.leader?.user?.nickname)
          .filter(Boolean);
        leaderName = leaderNames.join(', ') || '-';
      } else if (a.leader?.user?.nickname) {
        // 兼容单领队字段
        leaderName = a.leader.user.nickname;
      }
      return {
        ...a,
        price: toNum(a.price),
        originalPrice: a.originalPrice != null ? toNum(a.originalPrice) : null,
        charityAmount: toNum(a.charityAmount),
        leaderName,
        startTime: a.startTime.toISOString().replace('T', ' ').slice(0, 16),
      };
    });
    return { items, total };
  }

  async getActivity(id: string) {
    const a = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        leader: { include: { user: true } },
        images: true,
        schedules: true,
        activityRequirementList: true,
      },
    });
    if (!a) throw new NotFoundException();
    return {
      ...a,
      price: toNum(a.price),
      originalPrice: a.originalPrice != null ? toNum(a.originalPrice) : null,
      charityAmount: toNum(a.charityAmount),
      leaderName: a.leader?.user?.nickname ?? '-',
      earlyBirdPrice: (a as any).earlyBirdPrice,
      earlyBirdEndTime: (a as any).earlyBirdEndTime,
      tags: (a as any).tags,
      locationPoi: (a as any).locationPoi,
      descriptionImages: (a as any).descriptionImages,
      location: (a as any).location,
      locationLat: (a as any).locationLat,
      locationLng: (a as any).locationLng,
      // 新增字段
      summary: (a as any).summary,
      costIncludes: (a as any).costIncludes,
      costExcludes: (a as any).costExcludes,
      requirements: (a as any).requirements,
      refundPolicy: (a as any).refundPolicy,
      disclaimer: (a as any).disclaimer,
    };
  }

  async createActivity(dto: {
    leaderId: string;
    title: string;
    description: string;
    coverImage: string;
    category: ActivityCategory;
    difficulty: Difficulty;
    startTime: string;
    endTime: string;
    registerDeadline: string;
    location?: string;
    price: number;
    minParticipants?: number;
    maxParticipants?: number;
    status?: ActivityStatus;
    // 基础字段
    summary?: string; // 活动简介
    // 价格相关
    earlyBirdPrice?: number;
    earlyBirdEndTime?: string;
    originalPrice?: number;
    // 费用相关
    costIncludes?: string;
    costExcludes?: string;
    // 其他
    tags?: string[];
    locationPoi?: {
      name: string;
      lat?: number;
      lng?: number;
      address?: string;
    };
    descriptionImages?: string[];
    // 详情页内容
    requirements?: string;
    refundPolicy?: string;
    disclaimer?: string;
  }) {
    const leader = await this.prisma.leader.findUnique({ where: { id: dto.leaderId } });
    if (!leader || leader.status !== LeaderStatus.ACTIVE) {
      throw new BadRequestException('无效的领队');
    }

    // Validate date fields
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const registerDeadline = new Date(dto.registerDeadline);
    
    if (isNaN(startTime.getTime())) throw new BadRequestException('无效的开始时间');
    if (isNaN(endTime.getTime())) throw new BadRequestException('无效的结束时间');
    if (isNaN(registerDeadline.getTime())) throw new BadRequestException('无效的报名截止时间');
    if (endTime <= startTime) throw new BadRequestException('结束时间必须晚于开始时间');
    if (registerDeadline > startTime) throw new BadRequestException('报名截止时间必须早于开始时间');

    // Validate price
    const price = typeof dto.price === 'number' ? dto.price : parseFloat(String(dto.price));
    if (isNaN(price) || price < 0) throw new BadRequestException('无效的价格');

    // Helper to extract coverImage URL from various formats
    const extractCoverImage = (coverImage: unknown): string => {
      if (!coverImage) return '';
      if (typeof coverImage === 'string') return coverImage;
      // Handle Ant Design Upload object format: { file: { ... }, fileList: [...] }
      if (typeof coverImage === 'object' && coverImage !== null) {
        const img = coverImage as { fileList?: { response?: { url?: string }; url?: string }[] };
        if (img.fileList && Array.isArray(img.fileList)) {
          // Get the last uploaded file's URL
          const lastFile = img.fileList[img.fileList.length - 1];
          if (lastFile) {
            return lastFile.response?.url || lastFile.url || '';
          }
        }
        // Also handle direct { response: { url } } format
        const directImg = coverImage as { response?: { url?: string } };
        if (directImg.response?.url) return directImg.response.url;
      }
      return '';
    };

    const coverImageUrl = extractCoverImage(dto.coverImage);
    if (!coverImageUrl) throw new BadRequestException('请上传封面图片');

    // Build data object with optional new fields in a safe way (to accommodate missing Prisma fields)
    const dataObj: any = {
      title: dto.title,
      summary: dto.summary || '', // 活动简介
      description: dto.description,
      coverImage: coverImageUrl,
      category: dto.category,
      difficulty: dto.difficulty,
      startTime,
      endTime,
      registerDeadline,
      location: dto.location ?? '',
      price: new Prisma.Decimal(price),
      minParticipants: dto.minParticipants ?? 2,
      maxParticipants: dto.maxParticipants ?? 30,
      leaderId: dto.leaderId,
      status: dto.status ?? ActivityStatus.PENDING,
      charityAmount: new Prisma.Decimal(1),
      // 新增字段
      costIncludes: dto.costIncludes || '',
      costExcludes: dto.costExcludes || '',
      requirements: dto.requirements || '',
      refundPolicy: dto.refundPolicy || this.getDefaultRefundPolicy(),
      disclaimer: dto.disclaimer || this.getDefaultDisclaimer(),
    };
    // Optional fields (only attach if defined)
    if (dto.earlyBirdPrice !== undefined) {
      const earlyBirdPrice = typeof dto.earlyBirdPrice === 'number' ? dto.earlyBirdPrice : parseFloat(String(dto.earlyBirdPrice));
      if (isNaN(earlyBirdPrice) || earlyBirdPrice < 0) {
        throw new BadRequestException('无效的早鸟价格');
      }
      dataObj.earlyBirdPrice = new Prisma.Decimal(earlyBirdPrice);
    }
    if (dto.originalPrice !== undefined) {
      const originalPrice = typeof dto.originalPrice === 'number' ? dto.originalPrice : parseFloat(String(dto.originalPrice));
      if (!isNaN(originalPrice) && originalPrice > 0) {
        dataObj.originalPrice = new Prisma.Decimal(originalPrice);
      }
    }
    if (dto.earlyBirdEndTime) {
      const earlyBirdEndTime = new Date(dto.earlyBirdEndTime);
      if (isNaN(earlyBirdEndTime.getTime())) {
        throw new BadRequestException('无效的早鸟截止时间');
      }
      dataObj.earlyBirdEndTime = earlyBirdEndTime;
    }
    if (dto.tags) dataObj.tags = dto.tags as Prisma.InputJsonValue;
    if (dto.locationPoi) dataObj.locationPoi = dto.locationPoi;
    // Handle descriptionImages - could be array of strings or Upload objects
    if (dto.descriptionImages) {
      const extractUrls = (imgs: unknown[]): string[] => {
        return imgs.map((img) => {
          if (!img) return '';
          if (typeof img === 'string') return img;
          const u = img as { response?: { url?: string }; url?: string };
          return u.response?.url || u.url || '';
        }).filter(Boolean);
      };
      dataObj.descriptionImages = extractUrls(dto.descriptionImages as unknown[]) as Prisma.InputJsonValue;
    }
    if (dto.locationPoi?.lat !== undefined) dataObj.locationLat = dto.locationPoi.lat;
    if (dto.locationPoi?.lng !== undefined) dataObj.locationLng = dto.locationPoi.lng;

    return this.prisma.activity.create({
      data: dataObj,
      include: { leader: { include: { user: true } } },
    });
  }

  async updateActivityStatus(id: string, status: ActivityStatus) {
    return this.prisma.activity.update({ where: { id }, data: { status } });
  }

  async updateActivity(id: string, data: Record<string, unknown>) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException();
    
    const updateData: Record<string, unknown> = { ...data };
    // New fields handling
    if (data.earlyBirdPrice !== undefined) updateData.earlyBirdPrice = data.earlyBirdPrice;
    if (data.earlyBirdEndTime) updateData.earlyBirdEndTime = new Date(data.earlyBirdEndTime as string);
    if (data.tags) updateData.tags = data.tags;
    if (data.descriptionImages) updateData.descriptionImages = data.descriptionImages;
    // locationPoi related fields
    if (data.locationPoi && typeof data.locationPoi === 'object') {
      const poi = data.locationPoi as { name: string; lat?: number; lng?: number; address?: string };
      updateData.location = poi.name;
      if (poi.lat !== undefined) updateData.locationLat = poi.lat;
      if (poi.lng !== undefined) updateData.locationLng = poi.lng;
      updateData.locationPoi = poi;
    }
    
    // Handle date fields
    if (data.startTime) updateData.startTime = new Date(data.startTime as string);
    if (data.endTime) updateData.endTime = new Date(data.endTime as string);
    if (data.registerDeadline) updateData.registerDeadline = new Date(data.registerDeadline as string);
    
    // Handle images array if provided
    if (data.images && Array.isArray(data.images)) {
      await this.prisma.activityImage.deleteMany({ where: { activityId: id } });
      const images = data.images as string[];
      for (let i = 0; i < images.length; i++) {
        await this.prisma.activityImage.create({
          data: { activityId: id, url: images[i], sort: i },
        });
      }
      delete updateData.images;
    }
    
    return this.prisma.activity.update({ where: { id }, data: updateData as Prisma.ActivityUpdateInput });
  }

  async deleteActivity(id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('活动不存在');
    
    // 删除活动相关的所有数据
    await this.prisma.activityImage.deleteMany({ where: { activityId: id } });
    await this.prisma.activityLeader.deleteMany({ where: { activityId: id } });
    await this.prisma.order.deleteMany({ where: { activityId: id } });
    await this.prisma.activity.delete({ where: { id } });
    
    return { ok: true, message: '活动已删除' };
  }

  async uploadActivityImage(id: string, filename: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException();
    
    // 生成预签名 URL（后续对接阿里云 OSS 时替换为真实实现）
    const imageUrl = `https://dazai-oss.example.com/activities/${id}/${Date.now()}_${filename}`;
    
    // 同时更新活动的 coverImage
    await this.prisma.activity.update({
      where: { id },
      data: { coverImage: imageUrl },
    });
    
    return {
      uploadUrl: imageUrl,
      filename,
      activityId: id,
    };
  }

  async listOrders(
    skip = 0,
    take = 20,
    opts?: { keyword?: string; status?: OrderStatus; activityId?: string },
  ) {
    const where: Prisma.OrderWhereInput = {};
    if (opts?.status) where.status = opts.status;
    if (opts?.activityId) where.activityId = opts.activityId;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [
        { orderNo: { contains: k } },
        { user: { nickname: { contains: k } } },
        { activity: { title: { contains: k } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { user: true, activity: true, participants: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((o) => ({
        ...o,
        originalAmount: toNum(o.originalAmount),
        couponDiscount: toNum(o.couponDiscount),
        pointsDiscount: toNum(o.pointsDiscount),
        charityAmount: toNum(o.charityAmount),
        finalAmount: toNum(o.finalAmount),
        userName: o.user?.nickname ?? '-',
        activityTitle: o.activity?.title ?? '-',
        payMethod:
          o.status === 'PENDING' ? '-' : '微信支付',
      })),
      total,
    };
  }

  async getOrder(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: { user: true, activity: true, participants: true, payments: true },
    });
    if (!o) throw new NotFoundException();
    return {
      ...o,
      originalAmount: toNum(o.originalAmount),
      couponDiscount: toNum(o.couponDiscount),
      pointsDiscount: toNum(o.pointsDiscount),
      charityAmount: toNum(o.charityAmount),
      finalAmount: toNum(o.finalAmount),
      userName: o.user?.nickname ?? '-',
      activityTitle: o.activity?.title ?? '-',
    };
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id },
      data: {
        status,
        ...(status === OrderStatus.COMPLETED ? { completedAt: new Date() } : {}),
      },
    });
  }

  async deleteOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    
    // 删除订单相关的核销记录
    await this.prisma.verification.deleteMany({ where: { orderId: id } });
    // 删除报名人员信息（使用 OrderParticipant 替代 Participant 与订单的直连关系）
    await this.prisma.orderParticipant.deleteMany({ where: { orderId: id } });
    // 删除订单
    await this.prisma.order.delete({ where: { id } });
    
    return { ok: true, message: '订单已删除' };
  }

  async listLeaderApplications() {
    return this.prisma.leaderApplication.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async approveLeaderApplication(id: string) {
    const app = await this.prisma.leaderApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.leaderApplication.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      const existing = await tx.leader.findUnique({ where: { userId: app.userId } });
      if (!existing) {
        await tx.leader.create({
          data: {
            userId: app.userId,
            specialties: (app.specialties ?? []) as Prisma.InputJsonValue,
            status: LeaderStatus.ACTIVE,
            verifiedAt: new Date(),
          },
        });
      } else {
        await tx.leader.update({
          where: { userId: app.userId },
          data: {
            status: LeaderStatus.ACTIVE,
            verifiedAt: new Date(),
            specialties: (app.specialties ?? []) as Prisma.InputJsonValue,
          },
        });
      }
      await tx.user.update({
        where: { id: app.userId },
        data: { role: UserRole.LEADER },
      });
    });

    return { ok: true };
  }

  async rejectLeaderApplication(id: string, reason?: string) {
    return this.prisma.leaderApplication.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason ?? '不符合要求' },
    });
  }

  async updateLeader(id: string, data: Record<string, unknown>) {
    const leader = await this.prisma.leader.findUnique({ where: { id } });
    if (!leader) throw new NotFoundException();
    return this.prisma.leader.update({ where: { id }, data });
  }

  async updateLeaderStatus(id: string, status: LeaderStatus) {
    const leader = await this.prisma.leader.findUnique({ where: { id } });
    if (!leader) throw new NotFoundException();
    return this.prisma.leader.update({ where: { id }, data: { status } });
  }

  async deleteLeader(id: string) {
    const leader = await this.prisma.leader.findUnique({ where: { id } });
    if (!leader) throw new NotFoundException();

    // 将用户角色降级为普通用户
    await this.prisma.user.update({
      where: { id: leader.userId },
      data: { role: UserRole.USER },
    });

    // 删除领队记录
    return this.prisma.leader.delete({ where: { id } });
  }

  async listLeaders() {
    const list = await this.prisma.leader.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((l) => {
      const spec = l.specialties;
      const specialties = Array.isArray(spec)
        ? (spec as string[])
        : typeof spec === 'string'
          ? []
          : (spec as unknown as string[]) ?? [];
      return { ...l, specialties };
    });
  }

  async listCouponsAdmin() {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const out: Record<string, unknown>[] = [];
    for (const c of coupons) {
      const [usedCount, issuedCount] = await Promise.all([
        this.prisma.userCoupon.count({
          where: { couponId: c.id, status: 'USED' },
        }),
        this.prisma.userCoupon.count({ where: { couponId: c.id } }),
      ]);
      out.push({
        ...c,
        value: toNum(c.value),
        minAmount: c.minAmount != null ? toNum(c.minAmount) : null,
        maxDiscount: c.maxDiscount != null ? toNum(c.maxDiscount) : null,
        usedCount,
        issuedCount,
      });
    }
    return out;
  }

  async createCoupon(dto: {
    name: string;
    description?: string;
    type: CouponType;
    value: number;
    minAmount?: number;
    maxDiscount?: number;
    validDays: number;
    totalCount?: number;
    userLimit?: number;
    applicableCategories?: ActivityCategory[];
    status?: CouponStatus;
  }) {
    return this.prisma.coupon.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minAmount: dto.minAmount,
        maxDiscount: dto.maxDiscount,
        validDays: dto.validDays,
        totalCount: dto.totalCount,
        userLimit: dto.userLimit ?? 1,
        applicableCategories: (dto.applicableCategories ?? []) as Prisma.InputJsonValue,
        status: dto.status ?? CouponStatus.ACTIVE,
      },
    });
  }

  async updateCouponStatus(id: string, status: CouponStatus) {
    return this.prisma.coupon.update({ where: { id }, data: { status } });
  }

  async issueCouponToAll(couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('优惠券不存在');

    const remaining = (coupon.totalCount ?? 0) - (coupon.issuedCount ?? 0);
    if (remaining <= 0) {
      throw new BadRequestException('优惠券库存已用完');
    }

    // 获取所有未删除的用户
    const users = await this.prisma.user.findMany({
      where: { status: { not: UserStatus.DELETED } },
      select: { id: true },
    });

    // 计算优惠券有效期
    const now = new Date();
    const endDate = new Date(now.getTime() + (coupon.validDays ?? 7) * 24 * 60 * 60 * 1000);

    let issued = 0;
    for (const user of users) {
      if (issued >= remaining) break;
      
      // 检查是否已发放（通过查询替代唯一约束检查）
      const existing = await this.prisma.userCoupon.findFirst({
        where: { userId: user.id, couponId },
      });
      if (existing) continue;

      await this.prisma.userCoupon.create({
        data: {
          userId: user.id,
          couponId,
          status: 'UNUSED',
          startTime: now,
          endTime: endDate,
        },
      });
      issued++;
    }

    // 更新发行数量
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { issuedCount: { increment: issued } },
    });

    return {
      issued,
      requested: users.length,
      remaining: remaining - issued,
    };
  }

  async issueCouponToUsers(couponId: string, userIds: string[]) {
    if (!userIds || userIds.length === 0) {
      throw new BadRequestException('请选择要发放的用户');
    }

    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('优惠券不存在');

    const remaining = (coupon.totalCount ?? 0) - (coupon.issuedCount ?? 0);
    if (remaining <= 0) {
      throw new BadRequestException('优惠券库存已用完');
    }

    // 计算优惠券有效期
    const now = new Date();
    const endDate = new Date(now.getTime() + (coupon.validDays ?? 7) * 24 * 60 * 60 * 1000);

    let issued = 0;
    for (const userId of userIds) {
      if (issued >= remaining) break;

      // 检查用户是否存在
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.status === UserStatus.DELETED) continue;

      // 检查是否已发放
      const existing = await this.prisma.userCoupon.findFirst({
        where: { userId, couponId },
      });
      if (existing) continue;

      await this.prisma.userCoupon.create({
        data: {
          userId,
          couponId,
          status: 'UNUSED',
          startTime: now,
          endTime: endDate,
        },
      });
      issued++;
    }

    // 更新发行数量
    if (issued > 0) {
      await this.prisma.coupon.update({
        where: { id: couponId },
        data: { issuedCount: { increment: issued } },
      });
    }

    return {
      issued,
      requested: userIds.length,
      remaining: remaining - issued,
    };
  }

  async pointsSummary() {
    const agg = await this.prisma.pointsAccount.aggregate({
      _sum: { balance: true, totalEarned: true, totalUsed: true },
    });
    return {
      totalBalance: agg._sum.balance ?? 0,
      totalEarned: agg._sum.totalEarned ?? 0,
      totalUsed: agg._sum.totalUsed ?? 0,
    };
  }

  async listPointsTransactions(
    skip = 0,
    take = 50,
    opts?: { type?: PointsType; keyword?: string },
  ) {
    const where: Prisma.PointsTransactionWhereInput = {};
    if (opts?.type) where.type = opts.type;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [
        { title: { contains: k } },
        { account: { user: { nickname: { contains: k } } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.pointsTransaction.findMany({
        where,
        include: { account: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.pointsTransaction.count({ where }),
    ]);
    const items = rows.map((t) => ({
      ...t,
      userName: t.account.user?.nickname ?? '-',
    }));
    return { items, total };
  }

  async adjustUserPoints(dto: { userId: string; amount: number; reason: string }) {
    const { userId, amount, reason } = dto;
    if (!amount || amount === 0) {
      throw new BadRequestException('积分金额不能为0');
    }
    if (!reason.trim()) {
      throw new BadRequestException('请填写调整原因');
    }

    // 查找用户
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 获取或创建积分账户
    let account = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    if (!account) {
      account = await this.prisma.pointsAccount.create({
        data: { userId, balance: 0, totalEarned: 0, totalUsed: 0 },
      });
    }

    // 验证余额是否足够扣减
    if (amount < 0 && account.balance + amount < 0) {
      throw new BadRequestException('用户积分余额不足');
    }

    // 创建积分流水记录
    const isIncrease = amount > 0;
    await this.prisma.pointsTransaction.create({
      data: {
        accountId: account.id,
        userId: userId, // 使用用户ID
        type: isIncrease ? 'MANUAL_ADD' : 'MANUAL_DEDUCT' as any,
        amount,
        balance: account.balance + amount,
        title: reason.trim(),
      },
    });

    // 更新账户余额
    const updatedAccount = await this.prisma.pointsAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: amount },
        ...(isIncrease
          ? { totalEarned: { increment: amount } }
          : { totalUsed: { increment: -amount } }),
      },
    });

    return {
      userId,
      nickname: user.nickname,
      amount,
      newBalance: updatedAccount.balance,
      reason: reason.trim(),
    };
  }

  async listTravelsAdmin(
    skip = 0,
    take = 20,
    opts?: { keyword?: string; status?: ContentStatus },
  ) {
    const where: Prisma.TravelWhereInput = {};
    if (opts?.status) where.status = opts.status;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [
        { title: { contains: k } },
        { user: { nickname: { contains: k } } },
        { activity: { title: { contains: k } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.travel.findMany({
        where,
        include: { user: true, activity: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.travel.count({ where }),
    ]);
    const items = rows.map((t) => ({
      ...t,
      userName: t.user?.nickname ?? '-',
      activityTitle: t.activity?.title ?? '-',
    }));
    return { items, total };
  }

  async getTravelAdmin(id: string) {
    const travel = await this.prisma.travel.findUnique({
      where: { id },
      include: {
        user: true,
        activity: true,
        comments: true,
      },
    });
    if (!travel) throw new NotFoundException();
    return {
      ...travel,
      userName: travel.user?.nickname ?? '-',
      activityTitle: travel.activity?.title ?? '-',
      images: (travel.images as unknown as string[]) ?? [],
      comments: travel.comments.map((c) => ({
        id: c.id,
        userId: c.userId,
        content: c.content,
        createdAt: c.createdAt,
      })),
    };
  }

  async updateTravelStatus(id: string, status: ContentStatus) {
    return this.prisma.travel.update({ where: { id }, data: { status } });
  }

  async updateTravel(id: string, data: Record<string, unknown>) {
    const travel = await this.prisma.travel.findUnique({ where: { id } });
    if (!travel) throw new NotFoundException('游记不存在');
    delete data.id;
    return this.prisma.travel.update({ where: { id }, data: data as any });
  }

  async updateTravelActivity(id: string, activityId: string | null) {
    const travel = await this.prisma.travel.findUnique({ where: { id } });
    if (!travel) throw new NotFoundException('游记不存在');

    if (activityId) {
      // 关联活动
      return this.prisma.travel.update({
        where: { id },
        data: { activityId },
      });
    } else {
      // 解除关联
      return this.prisma.travel.update({
        where: { id },
        data: { activityId: null },
      });
    }
  }

  async deleteTravel(id: string) {
    const travel = await this.prisma.travel.findUnique({ where: { id } });
    if (!travel) throw new NotFoundException('游记不存在');
    
    // Soft delete: mark as DELETED status
    return this.prisma.travel.update({
      where: { id },
      data: { status: ContentStatus.DELETED },
    });
  }

  async createTravelFromCharity(data: { title: string; content: string; coverImage?: string; activityId?: string }) {
    // 查找系统管理员用户作为默认作者
    const adminUser = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });
    
    return this.prisma.travel.create({
      data: {
        title: data.title,
        content: data.content,
        coverImage: data.coverImage || '',
        userId: adminUser?.id || 'system-admin',
        status: ContentStatus.APPROVED,
        activityId: data.activityId || null,
      },
    });
  }

  async listWishesAdmin(
    skip = 0,
    take = 20,
    opts?: { keyword?: string; status?: WishStatus },
  ) {
    const where: Prisma.WishWhereInput = {};
    if (opts?.status) where.status = opts.status;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [{ title: { contains: k } }, { user: { nickname: { contains: k } } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.wish.findMany({
        where,
        include: { user: true, supports: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.wish.count({ where }),
    ]);
    const items = rows.map((w) => ({
      ...w,
      userName: w.user?.nickname ?? '-',
      supportCount: w.supportCount ?? w.supports.length,
      tags: (w.tags as unknown as string[]) ?? [],
      images: (w.images as unknown as string[]) ?? [],
    }));
    return { items, total };
  }

  async updateWishStatus(id: string, status: WishStatus) {
    return this.prisma.wish.update({ where: { id }, data: { status } });
  }

  async getWishAdmin(id: string) {
    const wish = await this.prisma.wish.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!wish) throw new NotFoundException('心愿不存在');
    
    // 获取支持记录
    const supports = await this.prisma.wishSupport.findMany({
      where: { wishId: id },
      orderBy: { createdAt: 'desc' },
    });
    
    // 获取支持者信息
    const userIds = [...new Set(supports.map(s => s.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.nickname]));
    
    return {
      ...wish,
      userName: wish.user?.nickname ?? '-',
      supportCount: wish.supportCount,
      expectTime: wish.expectTime,
      expectPeople: wish.expectPeople,
      tags: (wish.tags as unknown as string[]) ?? [],
      images: (wish.images as unknown as string[]) ?? [],
      supports: supports.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: userMap.get(s.userId) ?? '-',
        createdAt: s.createdAt,
      })),
    };
  }

  async listHelpsAdmin(
    skip = 0,
    take = 20,
    opts?: { keyword?: string; status?: HelpStatus },
  ) {
    const where: Prisma.HelpWhereInput = {};
    if (opts?.status) where.status = opts.status;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [{ title: { contains: k } }, { user: { nickname: { contains: k } } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.help.findMany({
        where,
        include: { user: true, responses: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.help.count({ where }),
    ]);
    const items = rows.map((h) => ({
      ...h,
      userName: h.user?.nickname ?? '-',
      images: (h.images as unknown as string[]) ?? [],
      responseCount: h.responses.length,
    }));
    return { items, total };
  }

  async updateHelpStatus(id: string, status: HelpStatus) {
    return this.prisma.help.update({ where: { id }, data: { status } });
  }

  async getHelpAdmin(id: string) {
    const help = await this.prisma.help.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!help) throw new NotFoundException('互助不存在');
    
    // 获取回应记录
    const responses = await this.prisma.helpResponse.findMany({
      where: { helpId: id },
      orderBy: { createdAt: 'desc' },
    });
    
    // 获取回应者信息
    const userIds = [...new Set(responses.map(r => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.nickname]));
    
    return {
      ...help,
      userName: help.user?.nickname ?? '-',
      images: (help.images as unknown as string[]) ?? [],
      responseCount: responses.length,
      responses: responses.map((r) => ({
        id: r.id,
        userId: r.userId,
        message: r.message,
        userName: userMap.get(r.userId) ?? '-',
        createdAt: r.createdAt,
      })),
    };
  }

  async listMessagesAdmin(
    skip = 0,
    take = 30,
    opts?: { keyword?: string; type?: MessageType; isRead?: boolean },
  ) {
    const where: Prisma.MessageWhereInput = {};
    if (opts?.type) where.type = opts.type;
    if (typeof opts?.isRead === 'boolean') where.isRead = opts.isRead;
    if (opts?.keyword?.trim()) {
      const k = opts.keyword.trim();
      where.OR = [
        { title: { contains: k } },
        { content: { contains: k } },
        { user: { nickname: { contains: k } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.message.count({ where }),
    ]);
    const items = rows.map((m) => ({
      ...m,
      userName: m.user?.nickname ?? '-',
    }));
    return { items, total };
  }

  async createMessageAdmin(dto: {
    title: string;
    content: string;
    type?: MessageType;
    userId?: string;
  }) {
    const type = dto.type ?? MessageType.SYSTEM;
    if (dto.userId) {
      return this.prisma.message.create({
        data: {
          userId: dto.userId,
          type,
          title: dto.title,
          content: dto.content,
        },
      });
    }
    const users = await this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true },
      take: 5000,
    });
    if (users.length === 0) {
      throw new BadRequestException('暂无可发送用户');
    }
    await this.prisma.message.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        title: dto.title,
        content: dto.content,
      })),
    });
    return { ok: true, sent: users.length };
  }

  async charitySummary() {
    const [donAgg, expAgg, donationCount] = await Promise.all([
      this.prisma.charityDonation.aggregate({ _sum: { amount: true } }),
      this.prisma.charityExpense.aggregate({ _sum: { amount: true } }),
      this.prisma.charityDonation.count(),
    ]);
    const totalDonation = toNum(donAgg._sum.amount ?? 0);
    const totalExpense = toNum(expAgg._sum.amount ?? 0);
    return {
      totalDonation,
      totalExpense,
      balance: totalDonation - totalExpense,
      donationCount,
    };
  }

  async listCharityProjectsAdmin() {
    const list = await this.prisma.charityProject.findMany({
      orderBy: { createdAt: 'desc' },
    }) as any[];
    return list.map((p) => ({
      ...p,
      targetAmount: toNum(p.targetAmount),
      raisedAmount: toNum(p.raisedAmount),
    }));
  }

  async createCharityProject(dto: {
    name: string;
    description: string;
    coverImage?: string;
    targetAmount: number;
    startTime: string;
    endTime?: string;
    status?: ProjectStatus;
  }) {
    return this.prisma.charityProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        targetAmount: dto.targetAmount,
        raisedAmount: 0,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        status: dto.status ?? ProjectStatus.ACTIVE,
      },
    });
  }

  async listCharityDonations(skip = 0, take = 50) {
    const rows = await this.prisma.charityDonation.findMany({
      include: { campaign: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((d) => ({
      ...d,
      amount: toNum(d.amount),
      projectName: (d as any).campaign?.name ?? '',
      userName: d.userId ? `用户 ${d.userId.slice(0, 8)}…` : '系统/匿名',
    }));
   }

  async listCharityExpenses(skip = 0, take = 50) {
    const list = await this.prisma.charityExpense.findMany({
      include: { campaign: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return list.map((e) => ({
      ...e,
      amount: toNum(e.amount),
      projectName: (e as any).campaign?.name ?? '',
      proofImages: e.proofImages as unknown as string[],
    }));
  }

  // Coupon management: delete and update
  async deleteCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('优惠券不存在');
    await this.prisma.userCoupon.deleteMany({ where: { couponId: id } });
    return this.prisma.coupon.delete({ where: { id } });
  }

  async updateCoupon(id: string, data: Record<string, unknown>) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('优惠券不存在');
    if (data.value !== undefined) data.value = new Prisma.Decimal(data.value as number);
    if (data.minAmount !== undefined) data.minAmount = data.minAmount ? new Prisma.Decimal(data.minAmount as number) : null;
    if (data.maxDiscount !== undefined) data.maxDiscount = data.maxDiscount ? new Prisma.Decimal(data.maxDiscount as number) : null;
    return this.prisma.coupon.update({ where: { id }, data: data as Prisma.CouponUpdateInput });
  }

  // Points: get user points and search
  async getUserPoints(userId: string) {
    const account = await this.prisma.pointsAccount.findUnique({
      where: { userId },
      include: { user: { select: { id: true, nickname: true, phone: true } } },
    });
    if (!account) {
      return { userId, nickname: null, phone: null, balance: 0, totalEarned: 0, totalUsed: 0 };
    }
    return {
      userId: account.userId,
      nickname: account.user?.nickname,
      phone: account.user?.phone,
      balance: account.balance,
      totalEarned: account.totalEarned,
      totalUsed: account.totalUsed,
    };
  }

  async searchUserPoints(keyword: string) {
    if (!keyword?.trim()) {
      const accounts = await this.prisma.pointsAccount.findMany({
        take: 50,
        orderBy: { balance: 'desc' },
        include: { user: { select: { id: true, nickname: true, phone: true } } },
      });
      return accounts.map(a => ({ userId: a.userId, nickname: a.user?.nickname, phone: a.user?.phone, balance: a.balance }));
    }
    const users = await this.prisma.user.findMany({ where: { OR: [{ nickname: { contains: keyword } }, { id: { contains: keyword } }] }, take: 20 });
    const results: any[] = [];
    for (const user of users) {
      const account = await this.prisma.pointsAccount.findUnique({ where: { userId: user.id } });
      results.push({ userId: user.id, nickname: user.nickname, phone: user.phone, balance: account?.balance ?? 0 });
    }
    return results;
  }

  // Charity Campaign Admin APIs
  async listCharityCampaignsAdmin(skip = 0, take = 20, status?: string) {
    const where: Prisma.CharityCampaignWhereInput = {};
    if (status) where.status = status as any;
    const [rows, total] = await Promise.all([
      this.prisma.charityCampaign.findMany({ where, include: { _count: { select: { donations: true, expenses: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.charityCampaign.count({ where }),
    ]);
    return {
      items: rows.map((c) => ({
        ...c,
        targetAmount: toNum(c.targetAmount),
        raisedAmount: toNum(c.raisedAmount),
        donationCount: (c._count as any).donations,
        expenseCount: (c._count as any).expenses,
      })),
      total,
    };
  }

  async getCharityCampaignAdmin(id: string) {
    const campaign = await this.prisma.charityCampaign.findUnique({
      where: { id },
      include: {
        donations: { take: 50, orderBy: { createdAt: 'desc' } },
        expenses: { take: 50, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!campaign) throw new NotFoundException('公益活动不存在');
    return {
      ...campaign,
      targetAmount: toNum(campaign.targetAmount),
      raisedAmount: toNum(campaign.raisedAmount),
    };
  }

  async createCharityCampaign(dto: { title: string; description: string; coverImage?: string; targetAmount: number; startDate: string; endDate?: string }) {
    return this.prisma.charityCampaign.create({
      data: {
        title: dto.title,
        description: dto.description,
        coverImage: dto.coverImage,
        targetAmount: dto.targetAmount,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status: 'PLANNED',
      },
    });
  }

  async updateCharityCampaign(id: string, data: Record<string, unknown>) {
    const campaign = await this.prisma.charityCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('公益活动不存在');
    if (data.startDate) data.startDate = new Date(data.startDate as string);
    if (data.endDate) data.endDate = data.endDate ? new Date(data.endDate as string) : null;
    if (data.targetAmount) data.targetAmount = Number(data.targetAmount);
    return this.prisma.charityCampaign.update({ where: { id }, data: data as Prisma.CharityCampaignUpdateInput });
  }

  async deleteCharityCampaign(id: string) {
    const campaign = await this.prisma.charityCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('公益活动不存在');
    await this.prisma.charityDonation.deleteMany({ where: { campaignId: id } });
    await this.prisma.charityExpense.deleteMany({ where: { campaignId: id } });
    await this.prisma.volunteerParticipation.deleteMany({ where: { campaignId: id } });
    return this.prisma.charityCampaign.delete({ where: { id } });
  }

  // Price Type Methods
  async getActivityPriceTypes(activityId: string) {
    return this.prisma.activityPriceType.findMany({ where: { activityId }, orderBy: { sort: 'asc' } });
  }

  async createPriceType(activityId: string, dto: { name: string; price: number; description?: string; stock?: number; sort?: number }) {
    return this.prisma.activityPriceType.create({ data: { activityId, name: dto.name, price: dto.price, description: dto.description, stock: dto.stock, sort: dto.sort ?? 0 } });
  }

  async updatePriceType(id: string, dto: { name?: string; price?: number; description?: string; stock?: number; sort?: number }) {
    const data: Prisma.ActivityPriceTypeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.sort !== undefined) data.sort = dto.sort;
    return this.prisma.activityPriceType.update({ where: { id }, data });
  }

  async deletePriceType(id: string) {
    return this.prisma.activityPriceType.delete({ where: { id } });
  }

  async getOrderByVerificationCode(code: string) {
    const verification = await this.prisma.verification.findFirst({ where: { code }, include: { order: { include: { user: true, activity: true, participants: true } } } });
    if (!verification) throw new NotFoundException('核销码不存在');
    const o = verification.order;
    return {
      ...o,
      finalAmount: toNum(o.finalAmount),
      participants: o.participants,
      isVerified: !!verification.verifiedAt,
    };
  }

  async verifyOrder(orderId: string, verifierId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PAID') throw new BadRequestException('订单状态不正确，无法核销');
    const verification = await this.prisma.verification.findUnique({ where: { orderId } });
    if (verification?.verifiedAt) throw new BadRequestException('订单已核销');
    await this.prisma.verification.update({ where: { orderId }, data: { verifiedAt: new Date(), verifiedBy: verifierId } });
    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.VERIFIED, verifiedAt: new Date() } });
  }

  // Partner Applications
  async listPartnerApplications(skip = 0, take = 20, opts?: { status?: string; keyword?: string }) {
    const where: Prisma.PartnerApplicationWhereInput = {};
    if (opts?.status) where.status = opts.status as any;
    if (opts?.keyword?.trim()) {
      where.OR = [
        { name: { contains: opts.keyword } },
        { contact: { contains: opts.keyword } },
        { user: { nickname: { contains: opts.keyword } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.partnerApplication.findMany({ where, include: { user: { select: { id: true, nickname: true, phone: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.partnerApplication.count({ where }),
    ]);
    return { items: rows, total };
  }

  async getPartnerApplication(id: string) {
    const app = await this.prisma.partnerApplication.findUnique({ where: { id }, include: { user: { select: { id: true, nickname: true, phone: true } } } });
    if (!app) throw new NotFoundException('合作申请不存在');
    return app;
  }

  async updatePartnerApplicationStatus(id: string, status: 'APPROVED' | 'REJECTED', adminNote?: string) {
    return this.prisma.partnerApplication.update({ where: { id }, data: { status, adminNote } });
  }

  async deletePartnerApplication(id: string) {
    return this.prisma.partnerApplication.delete({ where: { id } });
  }

  async createCharityExpense(dto: {
    campaignId?: string;
    projectId?: string;
    amount: number;
    purpose: string;
    beneficiary: string;
    proofImages?: string[];
  }) {
    const campaignId = (dto.campaignId ?? dto.projectId) as string;
    return this.prisma.charityExpense.create({
      data: {
        campaignId,
        amount: dto.amount,
        purpose: dto.purpose,
        beneficiary: dto.beneficiary,
        proofImages: (dto.proofImages ?? []) as Prisma.InputJsonValue,
      } as any,
    });
  }

  // ===== 钱包管理 =====
  async listWallets() {
    const wallets = await this.prisma.wallet.findMany({
      include: { user: { select: { id: true, nickname: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return wallets.map((w) => ({
      ...w,
      balance: toNum(w.balance),
      totalRecharge: toNum(w.totalRecharge),
      totalSpend: toNum(w.totalSpend),
    }));
  }

  async listWalletTransactions(skip = 0, take = 50) {
    const list = await this.prisma.walletTransaction.findMany({
      include: { user: { select: { id: true, nickname: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return list.map((t) => ({
      ...t,
      amount: toNum(t.amount),
    }));
  }

  async adjustWallet(dto: { userId: string; amount: number; type: 'add' | 'subtract'; reason: string }) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: dto.userId } });
    if (!wallet) {
      throw new NotFoundException('钱包不存在');
    }
    const currentBalance = toNum(wallet.balance);
    const newBalance = dto.type === 'add' ? currentBalance + dto.amount : currentBalance - dto.amount;
    if (newBalance < 0) {
      throw new BadRequestException('余额不足');
    }
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        totalRecharge: dto.type === 'add' ? { increment: dto.amount } : undefined,
        totalSpend: dto.type === 'subtract' ? { increment: dto.amount } : undefined,
      },
    });
    await this.prisma.walletTransaction.create({
      data: {
        userId: dto.userId,
        walletId: wallet.id,
        type: dto.type === 'add' ? 'ADMIN_ADJUST' : 'ADMIN_DEDUCT',
        amount: dto.type === 'add' ? dto.amount : -dto.amount,
        balance: newBalance,
        status: 'COMPLETED',
        description: dto.reason,
      },
    });
    return { ok: true };
  }

  // ===== 步数管理 =====
  async listSteps(date?: string) {
    const where = date ? { date } : {};
    const steps = await this.prisma.userDailySteps.findMany({
      where,
      include: { user: { select: { id: true, nickname: true, phone: true } } },
      orderBy: { date: 'desc' },
    });
    return steps.map((s) => ({
      ...s,
      steps: s.steps,
      earnedPoints: s.earnedPoints,
    }));
  }

  async getStepsLeaderboard(type: 'daily' | 'monthly' | 'total', limit = 10) {
    const { StepsService } = await import('../steps/steps.service');
    const stepsService = new StepsService(this.prisma);
    return stepsService.getLeaderboard(type, limit);
  }

  // ===== 邀请管理 =====
  async listInviteRelations(skip = 0, take = 50) {
    const list = await this.prisma.inviteRelation.findMany({
      include: {
        inviter: { select: { id: true, nickname: true, phone: true } },
        invitee: { select: { id: true, nickname: true, phone: true } },
      },
      orderBy: { registeredAt: 'desc' },
      skip,
      take,
    });
    return list;
  }

  async listInviteRewards(skip = 0, take = 50) {
    const list = await this.prisma.inviteReward.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return list.map((r) => ({
      ...r,
      amount: toNum(r.amount),
    }));
  }

  async getInviteLeaderboard(limit = 10) {
    const { InviteService } = await import('../invite/invite.service');
    const inviteService = new InviteService(this.prisma);
    return inviteService.getLeaderboard(limit);
  }

  // ===== 图片上传 =====
  async uploadImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    // 检查文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('只支持 JPG、PNG、GIF、WebP 格式的图片');
    }

    // 检查文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('图片大小不能超过 5MB');
    }

    // 生成唯一文件名
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    
    // 保存到本地 public/uploads 目录
    const fs = require('fs');
    const path = require('path');
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, filename), file.buffer);

    // 返回可访问的URL
    const publicUrl = `/uploads/${filename}`;

    return {
      url: publicUrl,
      filename,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  // ===== Extended Admin Helpers (added per task) =====
  async setActivityLeaders(activityId: string, leaderIds: string[]) {
    await this.prisma.activityLeader.deleteMany({ where: { activityId } });
    for (const leaderId of leaderIds) {
      await this.prisma.activityLeader.create({ data: { activityId, leaderId } });
    }
    return { ok: true };
  }

  async getActivityLeaders(activityId: string) {
    const list = await this.prisma.activityLeader.findMany({
      where: { activityId },
      include: { leader: { include: { user: true } } },
    });
    return list.map((l) => {
      const user = l.leader?.user;
      return {
        id: l.leader?.id,
        userId: l.leader?.userId,
        nickname: user?.nickname,
        avatar: user?.avatar,
        level: l.leader?.level,
        status: l.leader?.status,
      };
    });
  }

  async getActivityParticipants(activityId: string) {
    const orders = await this.prisma.order.findMany({
      where: { activityId, status: { in: ['PAID', 'VERIFIED', 'COMPLETED'] } },
      include: {
        user: { select: { id: true, nickname: true, phone: true } },
        participants: true,
      },
    });
    const participants: any[] = [];
    for (const order of orders) {
      for (const p of order.participants) {
        const { orderId: _omit, ...rest } = p as any;
        participants.push({
          orderId: order.id,
          orderNo: order.orderNo,
          userId: order.user?.id,
          userName: order.user?.nickname,
          userPhone: order.user?.phone,
          ...(rest ?? {}),
        });
      }
    }
    return participants;
  }

  async exportActivityParticipants(activityId: string): Promise<string> {
    const participants = await this.getActivityParticipants(activityId);
    const headers = ['订单号', '用户昵称', '用户电话', '姓名', '电话', '身份证', '紧急联系人', '紧急联系电话'];
    const rows = participants.map((p) => [
      p.orderNo,
      p.userName,
      p.userPhone ?? '',
      p.name ?? '',
      p.phone ?? '',
      p.idCard ?? '',
      p.emergencyContact ?? '',
      p.emergencyPhone ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    return csv;
  }

  async adminRefundOrder(orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.REFUNDED, refundReason: reason, refundAmount: order.finalAmount },
    });
  }

  async approveRefund(orderId: string, approvedBy: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
  }

  async rejectRefund(orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID, refundReason: reason } });
  }

  async cancelActivityWithRefund(activityId: string, reason?: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('活动不存在');
    await this.prisma.activity.update({ where: { id: activityId }, data: { status: ActivityStatus.CANCELLED } });
    const orders = await this.prisma.order.findMany({ where: { activityId, status: { in: ['PAID', 'VERIFIED'] } } });
    for (const order of orders) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.REFUNDED, refundReason: `活动取消: ${reason || '管理员取消'}` } });
    }
    return { ok: true, refundedCount: orders.length };
  }

  async listVerificationRecords(skip = 0, take = 50, opts?: { activityId?: string; verified?: boolean }) {
    const where: Prisma.VerificationWhereInput = {};
    if (opts?.activityId) {
      where.order = { activityId: opts.activityId };
    }
    if (typeof opts?.verified === 'boolean') {
      where.verifiedAt = opts.verified ? { not: null } : null;
    }
    const [rows, total] = await Promise.all([
      this.prisma.verification.findMany({
        where,
        include: { order: { include: { user: true, activity: true, participants: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take,
      }),
      this.prisma.verification.count({ where }),
    ]);
    return {
      items: rows.map((v) => ({
        id: v.id,
        code: v.code,
        verifiedAt: v.verifiedAt,
        verifiedBy: v.verifiedBy,
        order: {
          id: v.order.id,
          orderNo: v.order.orderNo,
          userName: v.order.user?.nickname,
          activityTitle: v.order.activity?.title,
          finalAmount: toNum(v.order.finalAmount),
          participants: v.order.participants.map((p) => p.name),
        },
      })),
      total,
    };
  }
}
