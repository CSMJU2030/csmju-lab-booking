import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query parameters Core Hub appends to the registered callback URL.
 * Nothing here is trusted until the token itself is verified through JWKS.
 */
export class SsoCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  access_token!: string;

  @IsOptional()
  @IsIn(['Bearer', 'bearer'])
  token_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  expires_in?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;
}
