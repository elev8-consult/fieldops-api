import { IsString, Matches, MinLength } from 'class-validator';

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug: string;
}
