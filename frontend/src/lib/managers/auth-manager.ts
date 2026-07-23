export interface UserData {
  userId: string;
  email: string;
  handle: string;
  sourceId: string;
}

export interface AuthResponse {
  authenticated: boolean;
  user?: UserData;
  expiresAt?: number;
}

export class AuthManager {
  private static REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  static async login(email: string, password: string): Promise<UserData> {
    console.log('[AUTH MANAGER] login(): Login attempt for email:', email);

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies in request
      body: JSON.stringify({ email, password })
    });

    console.log('[AUTH MANAGER] login(): Response status:', response.status);
    if (!response.ok) {
      console.error('[AUTH MANAGER] login(): Login failed');
      throw new Error('Login failed');
    }

    const data = await response.json();
    console.log('[AUTH MANAGER] login(): Login successful');

    return data.user;
  }

  static async checkAuth(): Promise<AuthResponse> {
    console.log('[AUTH MANAGER] checkAuth(): Checking authentication');

    try {
      const response = await fetch('/api/me', {
        credentials: 'include' // Include cookies in request
      });

      if (!response.ok) {
        console.log('[AUTH MANAGER] checkAuth(): Not authenticated');
        return { authenticated: false };
      }

      const data = await response.json();
      console.log('[AUTH MANAGER] checkAuth(): Authenticated');
      return data;

    } catch (error) {
      console.error('[AUTH MANAGER] checkAuth(): Error:', error);
      return { authenticated: false };
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    const auth = await this.checkAuth();
    return auth.authenticated;
  }

  static async getUserData(): Promise<UserData | null> {
    const auth = await this.checkAuth();
    return auth.user || null;
  }

  static async shouldRefreshToken(): Promise<boolean> {
    console.log('[AUTH MANAGER] shouldRefreshToken(): Checking if refresh needed');

    const auth = await this.checkAuth();
    if (!auth.authenticated || !auth.expiresAt) {
      return false;
    }

    const expiresIn = auth.expiresAt - Date.now();
    const shouldRefresh = expiresIn < this.REFRESH_THRESHOLD;
    console.log('[AUTH MANAGER] shouldRefreshToken():', shouldRefresh);

    return shouldRefresh;
  }

  static async refreshToken(): Promise<void> {
    console.log('[AUTH MANAGER] refreshToken(): Refreshing token');

    const response = await fetch('/api/refresh', {
      method: 'POST',
      credentials: 'include' // Include cookies in request
    });

    if (!response.ok) {
      console.error('[AUTH MANAGER] refreshToken(): Refresh failed');
      throw new Error('Token refresh failed');
    }

    console.log('[AUTH MANAGER] refreshToken(): Token refreshed');
  }

  static async logout(): Promise<void> {
    console.log('[AUTH MANAGER] logout(): Logging out');

    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include' // Include cookies in request
    });

    console.log('[AUTH MANAGER] logout(): Redirecting to home');
    window.location.href = '/';
  }
}
