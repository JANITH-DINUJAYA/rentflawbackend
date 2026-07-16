import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters' })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @ApiProperty({ example: '+94712345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: '123456789V' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nic_or_passport: string;

  @ApiProperty({ enum: GlobalRole, example: GlobalRole.TENANT })
  @IsEnum(GlobalRole, {
    message: 'global_role must be one of: SAAS_ADMIN, LANDLORD, TENANT, STAFF',
  })
  global_role: GlobalRole;

  @ApiPropertyOptional({ example: 'Doe Properties Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company_name?: string;
}
