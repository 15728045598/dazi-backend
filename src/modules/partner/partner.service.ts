import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建合作申请
  async createApplication(userId: string, dto: {
    partnerType: string;
    name: string;
    contact: string;
    email?: string;
    company?: string;
    position?: string;
    resources: string;
    expectCooperation?: string;
  }) {
    // 验证合作类型
    const validTypes = ['RESOURCE', 'CONTENT', 'BUSINESS', 'OTHER'];
    if (!validTypes.includes(dto.partnerType)) {
      throw new BadRequestException('合作类型无效');
    }

    // 验证必填字段
    if (!dto.name?.trim()) {
      throw new BadRequestException('请填写姓名/名称');
    }
    if (!dto.contact?.trim()) {
      throw new BadRequestException('请填写联系方式');
    }
    if (!dto.resources?.trim()) {
      throw new BadRequestException('请填写资源/能力介绍');
    }

    // 检查用户是否已有待审核的申请
    const existing = await this.prisma.partnerApplication.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existing) {
      throw new BadRequestException('您已有待审核的申请，请等待审核完成');
    }

    return this.prisma.partnerApplication.create({
      data: {
        userId,
        partnerType: dto.partnerType,
        name: dto.name.trim(),
        contact: dto.contact.trim(),
        email: dto.email?.trim() || null,
        company: dto.company?.trim() || null,
        position: dto.position?.trim() || null,
        resources: dto.resources.trim(),
        expectCooperation: dto.expectCooperation?.trim() || null,
        status: 'PENDING',
      },
    });
  }

  // 获取用户自己的申请记录
  async getMyApplications(userId: string) {
    return this.prisma.partnerApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
