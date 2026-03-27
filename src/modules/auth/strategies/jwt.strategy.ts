import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export type JwtPayload = {
  sub: string;
  role?: string;
  type?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') || 'your-jwt-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type === 'admin') {
      return { userId: payload.sub, role: 'ADMIN', type: 'admin' };
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    return {
      userId: user.id,
      role: user.role,
      type: 'user',
      openid: user.openid,
    };
  }
}
