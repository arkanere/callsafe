import { goto } from '$app/navigation';

export interface LoginResponse {
  token: string;
  user: {
    email: string;
    handle: string;
    sourceId: string;
  };
  expiresAt: number;
}

export class AuthManager {
  private static JWT_KEY = 'callsafe_jwt';
  private static REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  static async login(email: string, password: string): Promise<LoginResponse> {
    console.log('[AUTH MANAGER] login(): Login attempt for email:', email);
    
    console.log('[AUTH MANAGER] login(): Sending login request to /api/login');
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    console.log('[AUTH MANAGER] login(): Login response status:', response.status);
    if (!response.ok) {
      console.error('[AUTH MANAGER] login(): Login failed with status:', response.status);
      throw new Error('Login failed');
    }

    const data = await response.json();
    console.log('[AUTH MANAGER] login(): Login response data:', { ...data, token: '[REDACTED]' });

    console.log('[AUTH MANAGER] login(): Storing JWT token in localStorage');
    // Store JWT
    localStorage.setItem(this.JWT_KEY, data.token);

    console.log('[AUTH MANAGER] login(): Decoding JWT token');
    // Decode token to get expiration
    const payload = this.decodeJWT(data.token);
    console.log('[AUTH MANAGER] login(): JWT payload:', payload);

    const loginResponse = {
      token: data.token,
      user: {
        email: payload.email,
        handle: payload.handle,
        sourceId: payload.sourceId
      },
      expiresAt: payload.exp * 1000
    };
    console.log('[AUTH MANAGER] login(): Login successful, returning:', { ...loginResponse, token: '[REDACTED]' });
    return loginResponse;
  }

  static getToken(): string | null {
    const token = localStorage.getItem(this.JWT_KEY);
    console.log('[AUTH MANAGER] getToken(): Getting token from localStorage:', token ? 'token present' : 'no token');
    return token;
  }

  static isTokenValid(): boolean {
    console.log('[AUTH MANAGER] isTokenValid(): Checking token validity');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] isTokenValid(): No token found, returning false');
      return false;
    }

    try {
      const payload = this.decodeJWT(token);
      const isValid = Date.now() < payload.exp * 1000;
      const expiresAt = new Date(payload.exp * 1000);
      console.log('[AUTH MANAGER] isTokenValid(): Token validity check:', { isValid, expiresAt });
      return isValid;
    } catch (error) {
      console.error('[AUTH MANAGER] isTokenValid(): Error decoding token:', error);
      return false;
    }
  }

  static shouldRefreshToken(): boolean {
    console.log('[AUTH MANAGER] shouldRefreshToken(): Checking if token should be refreshed');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] shouldRefreshToken(): No token found, refresh not needed');
      return false;
    }

    try {
      const payload = this.decodeJWT(token);
      const expiresIn = payload.exp * 1000 - Date.now();
      const shouldRefresh = expiresIn < this.REFRESH_THRESHOLD;
      console.log('[AUTH MANAGER] shouldRefreshToken(): Token refresh check:', { expiresIn, shouldRefresh, threshold: this.REFRESH_THRESHOLD });
      return shouldRefresh;
    } catch (error) {
      console.error('[AUTH MANAGER] shouldRefreshToken(): Error checking refresh need:', error);
      return false;
    }
  }

  static async refreshToken(): Promise<string> {
    console.log('[AUTH MANAGER] refreshToken(): Refreshing token');
    
    const currentToken = this.getToken();
    console.log('[AUTH MANAGER] refreshToken(): Sending refresh request with current token');
    
    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    });
    
    console.log('[AUTH MANAGER] refreshToken(): Refresh response status:', response.status);
    if (!response.ok) {
      console.error('[AUTH MANAGER] refreshToken(): Token refresh failed with status:', response.status);
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    console.log('[AUTH MANAGER] refreshToken(): Refresh response received');
    
    console.log('[AUTH MANAGER] refreshToken(): Storing new token in localStorage');
    localStorage.setItem(this.JWT_KEY, data.token);
    
    console.log('[AUTH MANAGER] refreshToken(): Token refresh completed successfully');
    return data.token;
  }

  static logout(): void {
    console.log('[AUTH MANAGER] logout(): Logout initiated');
    console.log('[AUTH MANAGER] logout(): Removing token from localStorage');
    localStorage.removeItem(this.JWT_KEY);
    console.log('[AUTH MANAGER] logout(): Redirecting to home page');
    goto('/');
  }

  static getUserFromToken(): any {
    console.log('[AUTH MANAGER] getUserFromToken(): Getting user data from token');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] getUserFromToken(): No token found, returning null');
      return null;
    }

    try {
      const userData = this.decodeJWT(token);
      console.log('[AUTH MANAGER] getUserFromToken(): User data decoded from token:', userData);
      return userData;
    } catch (error) {
      console.error('[AUTH MANAGER] getUserFromToken(): Error decoding user data from token:', error);
      return null;
    }
  }

  private static decodeJWT(token: string): any {
    console.log('[AUTH MANAGER] decodeJWT(): Decoding JWT token');
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      console.log('[AUTH MANAGER] decodeJWT(): JWT decoded successfully');
      return decoded;
    } catch (error) {
      console.error('[AUTH MANAGER] decodeJWT(): JWT decode error:', error);
      throw error;
    }
  }
}