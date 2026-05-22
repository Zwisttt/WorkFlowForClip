import type { BrowserContext, Page } from 'patchright';
import { BrowserWindow, BrowserView, session, ipcMain } from 'electron';
import * as path from 'path';
import type { 
  Platform, 
  BrowserConfig, 
  LoginResult, 
  LoginStartPayload,
  PlatformCookieConfig 
} from './types';
import { PLATFORM_COOKIE_CONFIGS } from './types';
import { createBrowserLauncher } from './browser-launcher';
import { LoginDetector } from './login-detector';
import { SessionManager } from './session-manager';
import { LoginLockManager, handleDuplicateLogin } from './login-lock';
import { BrowserDisconnectHandler } from './browser-disconnect';
import type { IBrowserLauncher } from './types';

export interface UserProfile {
  nickname: string;
  avatarUrl: string;
  homepageUrl?: string;
}

const PROFILE_SELECTORS: Record<string, { nickname: string[]; avatar: string[]; homepage: string[] }> = {
  kuaishou: {
    nickname: [
      '.user-name', '.nickname', '.user-nickname',
      '[class*="user"] [class*="name"]', '[class*="nick"]',
      '.header-user-name', '.user-info-name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.header-user-avatar img', '[class*="user-img"] img',
    ],
    homepage: [
      'a[href*="kuaishou.com/profile/"]',
      'a[href*="kuaishou.com/user/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  xiaohongshu: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '[class*="creator-name"]',
      '.sidebar-user-name', '.user-info .name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '[class*="user-avatar"] img', '.sidebar-avatar img',
    ],
    homepage: [
      'a[href*="xiaohongshu.com/user/profile/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  douyin: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.creator-name', '[class*="user-name"]',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '[class*="user-img"] img', '.creator-avatar img',
    ],
    homepage: [
      'a[href*="douyin.com/user/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
  weixin_video: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.account-name', '[class*="nickname"]',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.account-avatar img', '[class*="user-img"] img',
    ],
    homepage: [],
  },
  bilibili: {
    nickname: [
      '.user-name', '.nickname', '[class*="userName"]',
      '[class*="nick"]', '.header-avatar-name',
    ],
    avatar: [
      '.user-avatar img', '.avatar img', '[class*="avatar"] img',
      '.header-avatar img', '[class*="user-img"] img',
    ],
    homepage: [
      'a[href*="space.bilibili.com/"]',
      'a[class*="user-link"]',
      'a[class*="avatar"]',
    ],
  },
};

export interface AccountLoginServiceOptions {
  sendIPC: (channel: string, data: unknown) => void;
  onLog?: (message: string, data?: Record<string, unknown>) => void;
  getExistingAccounts?: (platform: Platform) => Promise<Array<{ id: string; nickname?: string }>>;
  updateAccountStatus?: (accountId: string, status: string, storagePath?: string) => Promise<void>;
  createAccount?: (accountId: string, platform: Platform, storagePath: string, profile: UserProfile | undefined, browserMode: string) => Promise<string>;
}

export class AccountLoginService {
  private sessionManager: SessionManager;
  private lockManager: LoginLockManager;
  private currentLauncher: IBrowserLauncher | null = null;
  private currentDetector: LoginDetector | null = null;
  private disconnectHandler: BrowserDisconnectHandler | null = null;
  private embeddedWindow: BrowserWindow | null = null;
  private addressBarView: BrowserView | null = null;
  private contentView: BrowserView | null = null;
  private options: AccountLoginServiceOptions;
  private ipcHandlersRegistered = false;

  constructor(options: AccountLoginServiceOptions) {
    this.options = options;
    this.sessionManager = new SessionManager();
    this.lockManager = LoginLockManager.getInstance();
    
    this.lockManager.setCallbacks(
      (data) => this.options.sendIPC('account:login-blocked', data),
      (data) => this.options.sendIPC('account:login-queued', data)
    );
  }

  async startLogin(payload: LoginStartPayload): Promise<LoginResult> {
    const { platform, browserConfig, existingAccountId } = payload;
    
    this.log('startLogin', { platform, browserType: browserConfig.type, existingAccountId });
    
    if (this.lockManager.hasActiveLogin()) {
      this.log('startLogin blocked', { reason: 'already_logging_in' });
      this.lockManager.notifyBlocked(platform);
      return {
        success: false,
        status: 'failed',
        error: '已有登录进行中',
      };
    }

    const releaseLock = await this.lockManager.acquire(platform);
    
    try {
      const decision = await handleDuplicateLogin(
        platform,
        existingAccountId,
        this.options.getExistingAccounts 
          ? await this.options.getExistingAccounts(platform) 
          : undefined
      );

      this.log('duplicateLoginDecision', { action: decision.action, targetAccountId: decision.targetAccountId });

      if (decision.action === 'cancel') {
        return { success: false, status: 'cancelled' };
      }

      const accountId = decision.targetAccountId || this.generateAccountId(platform);
      this.log('accountIdGenerated', { accountId });

      this.options.sendIPC('account:login-status', { 
        status: 'logging_in', 
        accountId, 
        platform 
      });

      let storagePath: string;
      let profile: UserProfile | undefined;

      if (browserConfig.type === 'embedded') {
        const result = await this.handleEmbeddedLogin(platform, accountId);
        storagePath = result.storagePath;
        profile = result.profile;
      } else {
        storagePath = await this.handleExternalLogin(platform, accountId, browserConfig);
      }

      this.log('loginFlowCompleted', { accountId, storagePath, profile: profile ? { nickname: profile.nickname, hasAvatar: !!profile.avatarUrl } : null, hasUpdateAccountStatus: !!this.options.updateAccountStatus, hasCreateAccount: !!this.options.createAccount });

      if (this.options.updateAccountStatus) {
        await this.options.updateAccountStatus(accountId, 'online', storagePath);
        this.log('accountStatusUpdated', { accountId });
      } else if (this.options.createAccount) {
        await this.options.createAccount(accountId, platform, storagePath, profile, browserConfig.type);
        this.log('accountCreated', { accountId, platform });
      } else {
        this.log('WARNING: no account persistence callback', { accountId });
      }

      await this.cleanup();

      this.options.sendIPC('account:login-success', {
        accountId,
        platform,
        storagePath,
      });

      this.log('loginSuccess', { accountId, platform });

      return {
        success: true,
        status: 'online',
        accountId,
        platform,
        storagePath,
      };

    } catch (error) {
      this.log('loginError', { error: String(error), platform });
      await this.cleanup();
      
      this.options.sendIPC('account:login-failed', {
        error: String(error),
        reason: '登录过程出错',
        platform,
      });

      return {
        success: false,
        status: 'failed',
        platform,
        error: String(error),
      };
    } finally {
      releaseLock();
    }
  }

  private log(message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}] [AccountLogin] ${message}`, data ? JSON.stringify(data) : '');
    this.options.onLog?.(message, data);
  }

  private async handleEmbeddedLogin(platform: Platform, accountId: string): Promise<{ storagePath: string; profile?: UserProfile }> {
    this.log('handleEmbeddedLogin start', { platform, accountId });
    const result = await this.launchEmbeddedBrowser(platform, accountId);
    this.embeddedWindow = result.window;

    this.options.sendIPC('account:login-status', { 
      status: 'detecting', 
      accountId, 
      platform 
    });

    this.log('waitForEmbeddedLogin start', { platform, accountId });
    const loginSuccess = await this.waitForEmbeddedLogin(result.window, platform, accountId);
    this.log('waitForEmbeddedLogin result', { loginSuccess });

    if (!loginSuccess) {
      throw new Error('登录超时');
    }

    this.log('reading cookies after login success');
    const cookies = await result.cookies();
    this.log('cookies read', { count: cookies.length, cookieNames: cookies.map(c => c.name) });
    const storagePath = await this.sessionManager.saveFromCookies(cookies, accountId, platform);
    this.log('sessionSaved', { storagePath });

    const profile = await this.extractProfileFromBrowser(platform);
    this.log('profileExtracted', { profile: profile ? { nickname: profile.nickname, hasAvatar: !!profile.avatarUrl } : null });

    return { storagePath, profile };
  }

  private async handleExternalLogin(platform: Platform, accountId: string, browserConfig: BrowserConfig): Promise<string> {
    this.currentLauncher = createBrowserLauncher(browserConfig);

    const context = await this.currentLauncher.launch(browserConfig, accountId);
    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    this.disconnectHandler = new BrowserDisconnectHandler({
      accountId,
      onDisconnect: () => {
        this.options.sendIPC('account:login-cancelled', {
          accountId,
          reason: 'browser_disconnected',
        });
      },
      onLog: this.options.onLog,
    });

    const browser = this.currentLauncher.getBrowser();
    if (browser) {
      this.disconnectHandler.attach(browser);
    }

    const config = PLATFORM_COOKIE_CONFIGS[platform];
    await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

    this.options.sendIPC('account:login-status', { 
      status: 'detecting', 
      accountId, 
      platform 
    });

    this.currentDetector = new LoginDetector(
      2000,
      300000,
      (data) => this.options.sendIPC('account:network-slow', data)
    );

    const loginSuccess = await this.currentDetector.waitForLogin(context, platform, 300000);

    if (!loginSuccess) {
      throw new Error('登录超时');
    }

    return await this.sessionManager.save(context, accountId, platform);
  }

  private async waitForEmbeddedLogin(window: BrowserWindow, platform: Platform, accountId: string): Promise<boolean> {
    const config = PLATFORM_COOKIE_CONFIGS[platform];
    const timeout = 300000;
    const startTime = Date.now();
    const pollInterval = 2000;
    const ses = session.fromPartition(`persist:${accountId}`);
    
    this.log('waitForEmbeddedLogin config', { 
      platform, 
      requiredCookies: config.requiredCookies, 
      loginUrl: config.loginUrl,
      timeout,
      partition: `persist:${accountId}`
    });

    return new Promise((resolve) => {
      const checkLogin = async () => {
        if (window.isDestroyed()) {
          this.log('waitForEmbeddedLogin: window destroyed');
          resolve(false);
          return;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          this.log('waitForEmbeddedLogin: timeout', { elapsed });
          resolve(false);
          return;
        }

        try {
          const cookies = await ses.cookies.get({});
          const matchedCookies = cookies.filter(c => 
            config.requiredCookies.includes(c.name) && c.value && c.value.length > 0
          );
          const hasLoginCookie = matchedCookies.length > 0;
          
          if (elapsed % 10000 < pollInterval) {
            this.log('waitForEmbeddedLogin polling', { 
              elapsed: Math.round(elapsed / 1000) + 's',
              totalCookies: cookies.length,
              matchedCookies: matchedCookies.map(c => c.name),
              requiredCookies: config.requiredCookies,
              hasLoginCookie,
              cookieNames: cookies.map(c => c.name).join(', ')
            });
          }

          if (hasLoginCookie) {
            this.log('waitForEmbeddedLogin: login detected', { 
              matchedCookies: matchedCookies.map(c => ({ name: c.name, valueLength: c.value.length })),
              elapsed: Math.round(elapsed / 1000) + 's'
            });
            resolve(true);
            return;
          }
        } catch (err) {
          this.log('waitForEmbeddedLogin: cookie check error', { error: String(err) });
        }

        setTimeout(checkLogin, pollInterval);
      };

      checkLogin();
    });
  }

  cancelLogin(): void {
    if (this.currentDetector) {
      this.currentDetector.cancel();
    }
  }

  private registerBrowserAddressHandlers(): void {
    if (this.ipcHandlersRegistered) return;

    ipcMain.on('browser-address:navigate', (_, data: { url?: string }) => {
      if (data.url && this.contentView) {
        this.contentView.webContents.loadURL(data.url);
      }
    });

    ipcMain.on('browser-address:back', () => {
      this.contentView?.webContents.goBack();
    });

    ipcMain.on('browser-address:forward', () => {
      this.contentView?.webContents.goForward();
    });

    ipcMain.on('browser-address:refresh', () => {
      this.contentView?.webContents.reload();
    });

    ipcMain.on('browser-address:open-devtools', () => {
      if (this.contentView) {
        this.contentView.webContents.openDevTools({ mode: 'detach' });
      }
    });

    this.ipcHandlersRegistered = true;
  }

  private async launchEmbeddedBrowser(
    platform: Platform,
    accountId: string
  ): Promise<{ context: BrowserContext | null; window: BrowserWindow; page: Page | null; cookies: () => Promise<{ name: string; value: string; domain: string; path: string }[]> }> {
    const config = PLATFORM_COOKIE_CONFIGS[platform];
    const partition = `persist:${accountId}`;
    const ses = session.fromPartition(partition);

    this.registerBrowserAddressHandlers();

    const window = new BrowserWindow({
      width: 1200,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: `登录 - ${platform}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition,
      },
      autoHideMenuBar: true,
    });

    window.on('closed', () => {
      this.log('embeddedWindow closed', { accountId, reason: 'user_closed_window' });
      this.options.sendIPC('account:login-cancelled', {
        accountId,
        reason: 'window_closed',
      });
    });

    const addressBarPath = path.join(__dirname, '..', 'browser-ui', 'address-bar.html');

    this.addressBarView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'browser-ui', 'address-bar-preload.js'),
      },
    });
    await this.addressBarView.webContents.loadFile(addressBarPath);

    this.contentView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition,
      },
    });

    this.contentView.webContents.on('did-navigate', (_, url) => {
      this.addressBarView?.webContents.send('browser-address:url-change', url);
    });

    this.contentView.webContents.on('did-navigate-in-page', (_, url) => {
      this.addressBarView?.webContents.send('browser-address:url-change', url);
    });

    this.contentView.webContents.on('did-start-loading', () => {
      this.addressBarView?.webContents.send('browser-address:loading-state', true);
    });

    this.contentView.webContents.on('did-stop-loading', () => {
      this.addressBarView?.webContents.send('browser-address:loading-state', false);
    });

    this.contentView.webContents.on('did-finish-load', () => {
      this.addressBarView?.webContents.send('browser-address:navigation-state', 
        this.contentView?.webContents.canGoBack() || false,
        this.contentView?.webContents.canGoForward() || false
      );
    });

    await this.contentView.webContents.loadURL(config.loginUrl);

    window.addBrowserView(this.addressBarView);
    window.addBrowserView(this.contentView);

    this.addressBarView.setBounds({ x: 0, y: 0, width: window.getBounds().width, height: 48 });
    this.contentView.setBounds({ x: 0, y: 48, width: window.getBounds().width, height: window.getBounds().height - 48 });

    this.addressBarView.webContents.send('browser-address:url-change', config.loginUrl);

    window.on('resize', () => {
      const bounds = window.getBounds();
      this.addressBarView?.setBounds({ x: 0, y: 0, width: bounds.width, height: 48 });
      this.contentView?.setBounds({ x: 0, y: 48, width: bounds.width, height: bounds.height - 48 });
    });

    const getCookies = async () => {
      const cookies = await ses.cookies.get({});
      return cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '',
        path: c.path || '/',
      }));
    };

    return { context: null, window, page: null, cookies: getCookies };
  }

  private async extractProfileFromBrowser(platform: Platform): Promise<UserProfile | undefined> {
    if (!this.contentView || this.embeddedWindow?.isDestroyed()) {
      this.log('extractProfile skipped', { reason: 'no contentView or window destroyed' });
      return undefined;
    }

    const selectors = PROFILE_SELECTORS[platform];
    if (!selectors) {
      this.log('extractProfile skipped', { reason: 'no selectors for platform', platform });
      return undefined;
    }

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await this.contentView.webContents.executeJavaScript(`
        (function() {
          var nicknameSelectors = [${nicknameSelectors}];
          var avatarSelectors = [${avatarSelectors}];
          var homepageSelectors = [${homepageSelectors}];
          var nickname = '';
          var avatarUrl = '';
          var homepageUrl = '';

          for (var i = 0; i < nicknameSelectors.length; i++) {
            var el = document.querySelector(nicknameSelectors[i]);
            if (el && el.textContent && el.textContent.trim()) {
              nickname = el.textContent.trim();
              break;
            }
          }

          for (var i = 0; i < avatarSelectors.length; i++) {
            var el = document.querySelector(avatarSelectors[i]);
            if (el && (el.src || el.getAttribute('src'))) {
              avatarUrl = el.src || el.getAttribute('src');
              if (avatarUrl && !avatarUrl.startsWith('data:') && avatarUrl.length > 10) break;
              if (avatarUrl && avatarUrl.startsWith('data:') && avatarUrl.length > 200) break;
              avatarUrl = '';
            }
          }

          for (var i = 0; i < homepageSelectors.length; i++) {
            var el = document.querySelector(homepageSelectors[i]);
            if (el && el.href && el.href.startsWith('http')) {
              homepageUrl = el.href;
              break;
            }
          }

          return { nickname: nickname, avatarUrl: avatarUrl, homepageUrl: homepageUrl };
        })()
      `);

      this.log('extractProfile raw result', result);

      if (result && (result.nickname || result.avatarUrl)) {
        return {
          nickname: result.nickname || '',
          avatarUrl: result.avatarUrl || '',
          homepageUrl: result.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractProfile error', { error: String(err) });
    }

    return undefined;
  }

  private async cleanup(): Promise<void> {
    if (this.disconnectHandler) {
      await this.disconnectHandler.gracefulClose();
      this.disconnectHandler = null;
    }

    if (this.currentLauncher) {
      await this.currentLauncher.close();
      this.currentLauncher = null;
    }

    if (this.embeddedWindow) {
      if (this.addressBarView) {
        this.embeddedWindow.removeBrowserView(this.addressBarView);
        this.addressBarView = null;
      }
      if (this.contentView) {
        this.embeddedWindow.removeBrowserView(this.contentView);
        this.contentView = null;
      }
      this.embeddedWindow.close();
      this.embeddedWindow = null;
    }

    this.currentDetector = null;
  }

  private generateAccountId(platform: Platform): string {
    return `${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
