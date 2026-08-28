import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

// All fields optional, same validators as CreateProductDto — for PATCH.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
