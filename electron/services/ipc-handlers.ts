import { ipcMain, BrowserWindow } from 'electron';
import { AccountLoginService, type UserProfile } from './account-login';
import type { LoginStartPayload, Platform, BrowserConfig } from './types';
import { getDatabase } from '../data/Database';

let loginService: AccountLoginService | null = null;

function getLoginService(): AccountLoginService {
  if (!loginService) {
    loginService = new AccountLoginService({
      sendIPC: (channel: string, data: unknown) => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send(channel, data);
        });
      },
      onLog: (message: string, data?: Record<string, unknown>) => {
        console.log(`[AccountLogin] ${message}`, data || '');
      },
      createAccount: async (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string): Promise<string> => {
        const db = getDatabase();
        const now = new Date().toISOString();
        const nickname = profile?.nickname || `账号-${accountId.slice(0, 8)}`;
        const avatarUrl = profile?.avatarUrl || null;
        const homepageUrl = profile?.homepageUrl || null;

        if (profile?.nickname) {
          const dup = db.prepare('SELECT id FROM accounts WHERE platform = ? AND nickname = ? AND cookie_valid = 1 LIMIT 1').get(platform, profile.nickname) as { id: string } | undefined;
          if (dup) {
            console.log(`[AccountLogin] duplicate account: platform=${platform}, nickname=${profile.nickname}, existingId=${dup.id}`);
            return dup.id;
          }
        }

        console.log(`[AccountLogin] createAccount: accountId=${accountId}, platform=${platform}, nickname=${nickname}, browserMode=${browserMode}, homepageUrl=${homepageUrl}`);
        db.prepare(
          `INSERT INTO accounts (id, platform, nickname, avatar_url, cookie_path, cookie_valid, status, group_id, browser_mode, homepage_url, last_login, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?)`
        ).run(
          accountId, platform, nickname, avatarUrl, storagePath,
          null, browserMode, homepageUrl, now, now, now
        );
        console.log(`[AccountLogin] createAccount success: accountId=${accountId}`);
        return accountId;
      },
    });
  }
  return loginService;
}

export function registerAccountLoginHandlers(): void {
  ipcMain.handle('accounts:startLogin', async (_event, payload: LoginStartPayload) => {
    try {
      const service = getLoginService();
      const result = await service.startLogin(payload);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });

  ipcMain.handle('accounts:cancelLogin', async () => {
    try {
      const service = getLoginService();
      service.cancelLogin();
      return { success: true };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  });
}

export function createAccountLoginService(
  options: {
    getExistingAccounts?: (platform: Platform) => Promise<Array<{ id: string; nickname?: string }>>;
    updateAccountStatus?: (accountId: string, status: string, storagePath?: string) => Promise<void>;
    createAccount?: (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string) => Promise<string>;
  }
): AccountLoginService {
  loginService = new AccountLoginService({
    sendIPC: (channel: string, data: unknown) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        win.webContents.send(channel, data);
      });
    },
    onLog: (message: string, data?: Record<string, unknown>) => {
      console.log(`[AccountLogin] ${message}`, data || '');
    },
    ...options,
  });
  return loginService;
}
