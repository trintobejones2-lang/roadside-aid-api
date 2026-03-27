import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../types/request-user';

type AuthedRequest = Request & { user?: RequestUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const canRequestHelp = req.user?.canRequestHelp;
    const canVolunteer = req.user?.canVolunteer;

    console.log('ROLES GUARD requiredRoles:', requiredRoles);
    console.log('ROLES GUARD canRequestHelp:', canRequestHelp);
    console.log('ROLES GUARD canVolunteer:', canVolunteer);

    if (requiredRoles.length === 0) return true;

    if (requiredRoles.includes('driver') && canRequestHelp) {
      return true;
    }

    if (requiredRoles.includes('volunteer') && canVolunteer) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
