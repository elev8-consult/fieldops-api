export interface JwtUser {
  id: string;
  email: string | null;
  role: string;
  brandId: string | null;
}
