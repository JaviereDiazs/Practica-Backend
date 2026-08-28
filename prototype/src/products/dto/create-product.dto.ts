import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Laptop' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Business laptop, 16GB RAM' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  price!: number;
}
