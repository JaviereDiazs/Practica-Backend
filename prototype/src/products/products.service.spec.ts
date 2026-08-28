import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Product } from './product.entity.js';
import { ProductsService } from './products.service.js';

const sampleProduct: Product = { id: '1', name: 'Laptop', description: null, price: 1200, createdAt: new Date('2026-01-01') };

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: {
    find: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repository = {
      find: vi.fn(),
      findOneBy: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: getRepositoryToken(Product), useValue: repository }],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns whatever the repository returns', async () => {
    repository.find.mockResolvedValue([sampleProduct]);

    await expect(service.findAll()).resolves.toEqual([sampleProduct]);
  });

  it('findOne throws NotFoundException when the repository returns null', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create defaults a missing description to null', async () => {
    repository.create.mockReturnValue(sampleProduct);
    repository.save.mockResolvedValue(sampleProduct);

    await service.create({ name: 'Laptop', price: 1200 });

    expect(repository.create).toHaveBeenCalledWith({ name: 'Laptop', price: 1200, description: null });
  });

  it('remove throws NotFoundException when nothing was deleted', async () => {
    repository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
