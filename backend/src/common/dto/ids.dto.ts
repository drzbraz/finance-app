import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class IdsDto {
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  ids!: string[];
}
