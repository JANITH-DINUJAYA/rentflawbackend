export interface JwtPayload {
  /** User UUID */
  sub: string;
  /** User email */
  email: string;
  /** Global platform role */
  role: string;
  /** Token issued-at timestamp */
  iat?: number;
  /** Token expiry timestamp */
  exp?: number;
}
