import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemService } from '../../modules/system/system.service';
import { GlobalRole } from '@prisma/client';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly systemService: SystemService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isMaintenance = this.systemService.getMaintenanceMode();
    if (!isMaintenance) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const url = request.url;

    // 1. Always allow authentication and system maintenance endpoints
    const isAllowedEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/refresh') ||
      url.includes('/system/maintenance') ||
      url.includes('/system/logs');

    if (isAllowedEndpoint) {
      return true;
    }

    // 2. Extract JWT token to check if user has SAAS_ADMIN role
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf-8'),
          );
          if (payload && payload.role === GlobalRole.SAAS_ADMIN) {
            return true;
          }
        } catch (err) {
          // JSON parsing or base64 decoding failure, fall through
        }
      }
    }

    // Fallback to checking request.user if it was populated earlier
    const user = request.user;
    if (user && user.global_role === GlobalRole.SAAS_ADMIN) {
      return true;
    }

    throw new ServiceUnavailableException(
      'The platform is currently undergoing scheduled maintenance. Please try again later.',
    );
  }
}
