import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: { [K in keyof ProductsService]: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findOne delegates to the service with the route param', async () => {
    service.findOne.mockResolvedValue({ id: '1' });

    await controller.findOne('1');

    expect(service.findOne).toHaveBeenCalledWith('1');
  });

  it('create delegates to the service with the request body', async () => {
    const dto = { name: 'Laptop', price: 1200 };
    service.create.mockResolvedValue({ id: '1', ...dto });

    await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
  });
});
