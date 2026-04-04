import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ParticipantService {
  constructor(private prisma: PrismaService) {}

  async getParticipants(userId: string) {
    return this.prisma.participant.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createParticipant(userId: string, data: {
    name: string;
    phone: string;
    idCard?: string;
    gender?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
  }) {
    return this.prisma.participant.create({
      data: { userId, ...data },
    });
  }

  async updateParticipant(id: string, data: {
    name?: string;
    phone?: string;
    idCard?: string;
    gender?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
  }) {
    const exists = await this.prisma.participant.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('报名人不存在');
    return this.prisma.participant.update({
      where: { id },
      data,
    });
  }

  async deleteParticipant(id: string) {
    const exists = await this.prisma.participant.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('报名人不存在');
    return this.prisma.participant.delete({ where: { id } });
  }
}
