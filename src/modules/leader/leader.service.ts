import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Experience, LeaderStatus, LeaderApplicationStatus, Prisma } from '@prisma/client';
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

  async getMyApplications(userId: string) {
    return this.prisma.leaderApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getParticipant(userId: string) {
    const leader = await this.prisma.leader.findUnique({
      where: { userId },
    });
    if (!leader) return null;
    // 返回领队信息用于预填表单
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, phone: true },
    });
    return {
      ...leader,
      userNickname: user?.nickname,
      userPhone: user?.phone,
    };
  }

  async apply(
    userId: string,
    dto: {
      realName: string;
      gender?: string;
      age?: number;
      phone: string;
      idCard?: string;
      experience: Experience;
      experienceYears?: string;
      specialties: string[];
      customSpecialties?: string;
      certificates?: string[];
      leadershipStyle: string[];
      customStyle?: string;
      availableTime: string[];
      bio?: string;
      experienceDesc?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
    },
  ) {
    const existing = await this.prisma.leader.findUnique({ where: { userId } });
    if (existing && existing.status === LeaderStatus.ACTIVE) {
      throw new BadRequestException('已是认证领队');
    }
    
    const pendingApplication = await this.prisma.leaderApplication.findFirst({
      where: { 
        userId,
        status: LeaderApplicationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    if (pendingApplication) {
      throw new BadRequestException('已有待审核的申请，请勿重复提交');
    }
    
    return this.prisma.leaderApplication.create({
      data: {
        userId,
        realName: dto.realName,
        gender: dto.gender,
        age: dto.age,
        phone: dto.phone,
        idCard: dto.idCard,
        experience: dto.experience,
        experienceYears: dto.experienceYears,
        specialties: dto.specialties as unknown as Prisma.JsonArray,
        customSpecialties: dto.customSpecialties,
        certificates: (dto.certificates || []) as unknown as Prisma.JsonArray,
        leadershipStyle: dto.leadershipStyle as unknown as Prisma.JsonArray,
        customStyle: dto.customStyle,
        availableTime: dto.availableTime as unknown as Prisma.JsonArray,
        bio: dto.bio,
        experienceDesc: dto.experienceDesc,
        emergencyContact: dto.emergencyContact,
        emergencyPhone: dto.emergencyPhone,
        status: LeaderApplicationStatus.PENDING,
      },
    });
  }

  async getAllApplications(page = 1, limit = 20, status?: LeaderApplicationStatus) {
    const where = status ? { status } : {};
    
    const [items, total] = await Promise.all([
      this.prisma.leaderApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, phone: true },
          },
        },
      }),
      this.prisma.leaderApplication.count({ where }),
    ]);
    
    return { items, total, page, limit };
  }

  async getApplicationById(id: string) {
    const application = await this.prisma.leaderApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true, phone: true },
        },
      },
    });
    
    if (!application) {
      throw new NotFoundException('申请不存在');
    }
    
    return application;
  }

  async reviewApplication(
    id: string,
    adminId: string,
    dto: {
      status: LeaderApplicationStatus;
      rejectReason?: string;
      adminNote?: string;
    },
  ) {
    const application = await this.prisma.leaderApplication.findUnique({
      where: { id },
    });
    
    if (!application) {
      throw new NotFoundException('申请不存在');
    }
    
    if (application.status !== LeaderApplicationStatus.PENDING) {
      throw new BadRequestException('该申请已审核，不能重复审核');
    }
    
    const updated = await this.prisma.leaderApplication.update({
      where: { id },
      data: {
        status: dto.status,
        rejectReason: dto.status === LeaderApplicationStatus.REJECTED ? dto.rejectReason : null,
        adminNote: dto.adminNote,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
    
    if (dto.status === LeaderApplicationStatus.APPROVED) {
      const specialties = typeof application.specialties === 'string' 
        ? JSON.parse(application.specialties) 
        : application.specialties;
      
      await this.prisma.leader.upsert({
        where: { userId: application.userId },
        update: {
          status: LeaderStatus.ACTIVE,
          verifiedAt: new Date(),
        },
        create: {
          userId: application.userId,
          status: LeaderStatus.ACTIVE,
          verifiedAt: new Date(),
          specialties: specialties as unknown as Prisma.JsonArray,
        },
      });
      
      await this.prisma.user.update({
        where: { id: application.userId },
        data: { role: 'LEADER' },
      });
    }
    
    return updated;
  }
}
