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

    // Allowed endpoints during maintenance:
    // Auth login/refresh, and system maintenance status/toggles.
    const isAllowedEndpoint =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/refresh') ||
      url.includes('/api/system/maintenance') ||
      url.includes('/api/system/logs');

    if (isAllowedEndpoint) {
      return true;
    }

    // If logged in as SAAS_ADMIN, allow everything
    const user = request.user;
    if (user && user.global_role === GlobalRole.SAAS_ADMIN) {
      return true;
    }

    throw new ServiceUnavailableException(
      'The platform is currently undergoing scheduled maintenance. Please try again later.',
    );
  }
}
