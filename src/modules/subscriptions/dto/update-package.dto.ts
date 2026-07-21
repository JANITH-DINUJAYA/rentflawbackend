import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePackageDto {
  @ApiProperty({ example: 'Gold Imperial Plan', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 99.99, required: false })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiProperty({ example: 50, required: false })
  @IsNumber()
  @IsOptional()
  max_properties?: number;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  max_tenants?: number;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  max_staff?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
