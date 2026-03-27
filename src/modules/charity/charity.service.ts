import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNum } from '../../common/utils/decimal';

@Injectable()
export class CharityService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects() {
    const list = await this.prisma.charityProject.findMany({
      where: { status: ProjectStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((p) => ({
      ...p,
      targetAmount: toNum(p.targetAmount),
      raisedAmount: toNum(p.raisedAmount),
    }));
  }

  async getProject(id: string) {
    const p = await this.prisma.charityProject.findUnique({
      where: { id },
      include: {
        donations: { take: 20, orderBy: { createdAt: 'desc' } },
        expenses: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!p) return null;
    return {
      ...p,
      targetAmount: toNum(p.targetAmount),
      raisedAmount: toNum(p.raisedAmount),
      donations: p.donations.map((d) => ({ ...d, amount: toNum(d.amount) })),
      expenses: p.expenses.map((e) => ({ ...e, amount: toNum(e.amount) })),
    };
  }

  /** 用户自愿捐赠（写入流水并累加项目已筹金额） */
  async donate(userId: string, projectId: string, dto: { amount: number; type?: string }) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000) {
      throw new BadRequestException('捐赠金额无效');
    }
    const dec = new Prisma.Decimal(amount.toFixed(2));
    const project = await this.prisma.charityProject.findUnique({ where: { id: projectId } });
    if (!project || project.status !== ProjectStatus.ACTIVE) {
      throw new NotFoundException('公益项目不存在或已结束');
    }
    await this.prisma.$transaction([
      this.prisma.charityDonation.create({
        data: {
          projectId,
          userId,
          amount: dec,
          type: dto.type === 'AUTO' ? 'AUTO' : 'VOLUNTARY',
        },
      }),
      this.prisma.charityProject.update({
        where: { id: projectId },
        data: { raisedAmount: { increment: dec } },
      }),
    ]);
    const updated = await this.prisma.charityProject.findUnique({ where: { id: projectId } });
    return { ok: true, raisedAmount: toNum(updated?.raisedAmount ?? 0) };
  }
}
