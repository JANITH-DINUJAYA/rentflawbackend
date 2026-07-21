import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Commercial Bank of Ceylon' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiProperty({ example: 'RentFlaw Tech Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  account_name: string;

  @ApiProperty({ example: '100029384756' })
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @ApiProperty({ example: 'City Branch', required: false })
  @IsString()
  @IsOptional()
  branch_name?: string;

  @ApiProperty({ example: 'COMBCEKL', required: false })
  @IsString()
  @IsOptional()
  swift_code?: string;
}
