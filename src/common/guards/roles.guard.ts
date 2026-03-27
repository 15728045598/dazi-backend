import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (required.includes('ADMIN')) {
      return user.type === 'admin' || user.role === 'ADMIN';
    }
    return required.some((r) => r === user.role);
  }
}
