import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // `decimal` comes back from pg as a string (arbitrary precision can't
  // safely fit a JS number) — this transformer undoes that at the ORM
  // boundary so callers always see a real `number`.
  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: { to: (value: number) => value, from: (value: string) => Number(value) },
  })
  price!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
