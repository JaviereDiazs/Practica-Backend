import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { Product } from './product.entity.js';

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private readonly products: Repository<Product>) {}

  findAll(): Promise<Product[]> {
    return this.products.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw this.notFound(id);
    return product;
  }

  create(dto: CreateProductDto): Promise<Product> {
    const product = this.products.create({ ...dto, description: dto.description ?? null });
    return this.products.save(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const result = await this.products.update({ id }, dto);
    if (result.affected === 0) throw this.notFound(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.products.delete({ id });
    if (result.affected === 0) throw this.notFound(id);
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${id} not found` });
  }
}
