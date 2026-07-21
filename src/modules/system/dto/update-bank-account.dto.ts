import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBankAccountDto {
  @ApiProperty({ example: 'Commercial Bank of Ceylon', required: false })
  @IsString()
  @IsOptional()
  bank_name?: string;

  @ApiProperty({ example: 'RentFlaw Tech Pvt Ltd', required: false })
  @IsString()
  @IsOptional()
  account_name?: string;

  @ApiProperty({ example: '100029384756', required: false })
  @IsString()
  @IsOptional()
  account_number?: string;

  @ApiProperty({ example: 'City Branch', required: false })
  @IsString()
  @IsOptional()
  branch_name?: string;

  @ApiProperty({ example: 'COMBCEKL', required: false })
  @IsString()
  @IsOptional()
  swift_code?: string;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
