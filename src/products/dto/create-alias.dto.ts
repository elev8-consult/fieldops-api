import { IsString, MinLength } from 'class-validator';

export class CreateAliasDto {
  @IsString()
  @MinLength(1)
  alias: string;
}
