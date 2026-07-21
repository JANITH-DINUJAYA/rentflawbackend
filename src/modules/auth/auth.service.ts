import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { GlobalRole } from '@prisma/client';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { NotificationsService } from '../notifications/notifications.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Check for existing email — must be globally unique
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Generate unique tenant_code for TENANT role users
    // Used by landlords to search and invite tenants
    let tenant_code: string | null = null;
    if (dto.global_role === GlobalRole.TENANT) {
      tenant_code = await this.generateUniqueTenantCode();
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        nic_or_passport: dto.nic_or_passport,
        global_role: dto.global_role,
        tenant_code,
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        global_role: true,
        tenant_code: true,
        created_at: true,
      },
    });

    // Auto-create Landlord profile if registering as LANDLORD
    if (dto.global_role === GlobalRole.LANDLORD) {
      await this.prisma.landlord.create({
        data: {
          user_id: user.id,
          company_name: dto.company_name || null,
        },
      });
    }

    return { message: 'Account created successfully', user };
  }

  // ─────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        password_hash: true,
        first_name: true,
        last_name: true,
        global_role: true,
        is_active: true,
        tenant_code: true,
        credit_amount: true,
        landlord_profile: {
          select: {
            id: true,
            company_name: true,
            subscription_status: true,
          },
        },
        staff_profile: {
          select: {
            id: true,
            landlord_id: true,
            role: {
              select: {
                id: true,
                name: true,
                permissions: { select: { action: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      // Use identical error message to prevent user enumeration attacks
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.global_role);

    // Destructure out the password_hash before returning
    const { password_hash: _pw, ...userProfile } = user;

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: userProfile,
    };
  }

  // ─────────────────────────────────────────────
  // REFRESH TOKENS
  // ─────────────────────────────────────────────

  async refreshTokens(userId: string, email: string, role: GlobalRole) {
    return this.generateTokens(userId, email, role);
  }

  // ─────────────────────────────────────────────
  // ME (Get current user profile)
  // ─────────────────────────────────────────────

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        global_role: true,
        tenant_code: true,
        credit_amount: true,
        is_active: true,
        created_at: true,
        landlord_profile: {
          select: {
            id: true,
            company_name: true,
            subscription_status: true,
          },
        },
        staff_profile: {
          select: {
            id: true,
            landlord_id: true,
            role: {
              select: {
                id: true,
                name: true,
                permissions: { select: { action: true } },
              },
            },
          },
        },
      },
    });
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    role: GlobalRole,
  ) {
        const payload = { sub: userId, email, role };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      }),
    ]);

    return { access_token, refresh_token };
  }

  /**
   * Generates a unique 8-character alphanumeric tenant code.
   * Retries if a collision is found (extremely rare).
   */
  private async generateUniqueTenantCode(): Promise<string> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const exists = await this.prisma.user.findUnique({
        where: { tenant_code: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('Failed to generate unique tenant code');
  }

  // ─────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, first_name: true, last_name: true, email: true, is_active: true },
    });

    // Always return the same message to prevent email enumeration attacks
    const safeMessage = {
      message: 'If that email is registered, a temporary password has been sent.',
    };

    if (!user || !user.is_active) return safeMessage;

    // Generate a readable 12-char temp password: e.g. Rf!Ab3Cd7Ef9
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = 'Rf!';
    for (let i = 0; i < 9; i++) {
      tempPassword += chars[Math.floor(Math.random() * chars.length)];
    }

    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash },
    });

    // Fire-and-forget email — do not await to keep response fast
    this.notifications
      .sendPasswordResetEmail(user.email, `${user.first_name} ${user.last_name}`, tempPassword)
      .catch(() => { /* swallow email errors */ });

    return safeMessage;
  }
}
