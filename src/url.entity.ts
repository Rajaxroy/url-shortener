import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity()
@Unique(['code'])
export class Url {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  originalUrl: string;

  @Column()
  shortUrl: string;
}
