import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,         // Prevent XSS access to refresh token
  secure: true,           // Must be true when sameSite is 'none'
  sameSite: 'none' as const, // Allow cross-origin (Vercel frontend → Railway backend)
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/auth',     // Scoped to auth endpoints only
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user account' })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    return result;
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    // Set refresh token in HttpOnly cookie — never exposed to JavaScript
    res.cookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS);

    // Return access token in response body — short-lived (15min)
    return {
      access_token: result.access_token,
      user: result.user,
    };
  }

  @ApiOperation({ summary: 'Refresh access token using cookie' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  async refresh(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshTokens(
      user.id,
      user.email,
      user.global_role,
    );

    res.cookie('refresh_token', tokens.refresh_token, REFRESH_COOKIE_OPTIONS);

    return { access_token: tokens.access_token };
  }

  @ApiOperation({ summary: 'Logout and clear refresh token cookie' })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', { path: '/api/auth' });
    return { message: 'Logged out successfully' };
  }

  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }
}
