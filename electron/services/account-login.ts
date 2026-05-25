import type { BrowserContext, Page } from 'patchright';
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
import { browserManager } from './embedded-browser/browser-manager';
import { session as electronSession } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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
  private options: AccountLoginServiceOptions;

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
    this.log('handleEmbeddedLogin start (WebContentsView)', { platform, accountId });

    const config = PLATFORM_COOKIE_CONFIGS[platform];

    const contentView = await browserManager.createTab(accountId, platform, config.loginUrl);

    this.options.sendIPC('account:login-status', {
      status: 'detecting',
      accountId,
      platform,
    });

    this.log('waitForEmbeddedLogin start', { platform, accountId });

    const loginSuccess = await this.waitForCookies(accountId, platform, config);

    this.log('waitForEmbeddedLogin result', { loginSuccess });

    if (!loginSuccess) {
      await browserManager.closeTab(accountId);
      throw new Error('登录超时');
    }

    this.log('reading cookies after login success');

    const partition = `persist:${accountId}`;
    const ses = electronSession.fromPartition(partition);
    const cookies = await ses.cookies.get({ domain: config.domains[0] });

    const allCookies: Electron.Cookie[] = [];
    for (const domain of config.domains) {
      const domainCookies = await ses.cookies.get({ domain });
      allCookies.push(...domainCookies);
    }

    this.log('cookies read', { count: allCookies.length, cookieNames: allCookies.map(c => c.name) });

    const storagePath = await this.sessionManager.saveFromElectronCookies(allCookies, accountId, platform);
    this.log('sessionSaved', { storagePath });

    const profile = await this.extractProfileFromWebContents(platform, contentView.webContents, accountId);
    this.log('profileExtracted', { profile: profile ? { nickname: profile.nickname, hasAvatar: !!profile.avatarUrl } : null });

    await browserManager.closeTab(accountId);

    return { storagePath, profile };
  }

  private async waitForCookies(
    accountId: string,
    platform: Platform,
    config: PlatformCookieConfig,
    timeout = 300000
  ): Promise<boolean> {
    const partition = `persist:${accountId}`;
    const startTime = Date.now();
    const checkInterval = 3000;

    while (Date.now() - startTime < timeout) {
      try {
        const ses = electronSession.fromPartition(partition);
        for (const domain of config.domains) {
          const cookies = await ses.cookies.get({ domain });
          const cookieNames = cookies.map(c => c.name);
          const hasAllRequired = config.requiredCookies.every(name => cookieNames.includes(name));
          if (hasAllRequired) {
            return true;
          }
        }
      } catch {
        // Ignore cookie check errors
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  private async extractProfileFromWebContents(platform: Platform, webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    if (platform === 'bilibili') {
      return this.extractBilibiliProfile(webContents, accountId);
    }

    const selectors = PROFILE_SELECTORS[platform];
    if (!selectors) return undefined;

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await webContents.executeJavaScript(`
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

      if (result && (result.nickname || result.avatarUrl)) {
        let avatarPath = '';
        if (result.avatarUrl && result.avatarUrl.startsWith('http')) {
          try {
            avatarPath = await this.downloadAvatar(result.avatarUrl, platform, accountId);
          } catch (err) {
            this.log('downloadAvatar error', { error: String(err), platform });
          }
        }
        return {
          nickname: result.nickname || '',
          avatarUrl: avatarPath || result.avatarUrl || '',
          homepageUrl: result.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractProfile error', { error: String(err) });
    }

    return undefined;
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

  private async waitForEmbeddedLogin(page: Page, context: BrowserContext, platform: Platform, accountId: string): Promise<boolean> {
    this.currentDetector = new LoginDetector(
      2000,
      300000,
      (data) => this.options.sendIPC('account:network-slow', data)
    );

    const loginSuccess = await this.currentDetector.waitForLogin(context, platform, 300000);
    return loginSuccess;
  }

  cancelLogin(): void {
    if (this.currentDetector) {
      this.currentDetector.cancel();
    }
  }

  private async extractProfileFromBrowser(platform: Platform, page: Page): Promise<UserProfile | undefined> {
    if (!page) {
      this.log('extractProfile skipped', { reason: 'no page' });
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

      const result = await page.evaluate<{ nickname: string; avatarUrl: string; homepageUrl: string }>(`
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

    this.currentDetector = null;
  }

  private async extractBilibiliProfile(webContents: Electron.WebContents, accountId: string): Promise<UserProfile | undefined> {
    try {
      const cookies = await webContents.session.cookies.get({ domain: '.bilibili.com' });
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      const body = await new Promise<string>((resolve, reject) => {
        const https = require('https');
        const req = https.get(
          'https://api.bilibili.com/x/web-interface/nav',
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.bilibili.com',
              ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
            },
          },
          (res: any) => {
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => resolve(data));
          }
        );
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      const json = JSON.parse(body);
      if (json.code === 0 && json.data && json.data.isLogin) {
        const { uname, face, mid } = json.data;
        if (uname || face) {
          let avatarUrl = '';

          if (face && face.startsWith('http')) {
            try {
              avatarUrl = await this.downloadAvatar(face, 'bilibili', accountId);
            } catch (err) {
              this.log('extractBilibiliProfile downloadAvatar error', { error: String(err) });
              avatarUrl = face;
            }
          }

          return {
            nickname: uname || '',
            avatarUrl: avatarUrl || face || '',
            homepageUrl: 'https://member.bilibili.com/platform/home',
          };
        }
      }
      this.log('extractBilibiliProfile API returned', { code: json.code, isLogin: json.data?.isLogin, uname: json.data?.uname });
    } catch (err) {
      this.log('extractBilibiliProfile API error', { error: String(err) });
    }

    const selectors = PROFILE_SELECTORS['bilibili'];
    if (!selectors) return undefined;

    try {
      const nicknameSelectors = selectors.nickname.map(s => `'${s}'`).join(', ');
      const avatarSelectors = selectors.avatar.map(s => `'${s}'`).join(', ');
      const homepageSelectors = (selectors.homepage || []).map(s => `'${s}'`).join(', ');

      const result = await webContents.executeJavaScript(`
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

      if (result && (result.nickname || result.avatarUrl)) {
        return {
          nickname: result.nickname || '',
          avatarUrl: result.avatarUrl || '',
          homepageUrl: result.homepageUrl || undefined,
        };
      }
    } catch (err) {
      this.log('extractBilibiliProfile fallback error', { error: String(err) });
    }

    return undefined;
  }

  private getAvatarPath(platform: string, accountId: string): string {
    const dir = path.join(process.cwd(), 'storage', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${platform}_${accountId}.jpg`);
  }

  private downloadAvatar(url: string, platform: string, accountId: string): Promise<string> {
    const filePath = this.getAvatarPath(platform, accountId);
    return new Promise((resolve, reject) => {
      const https = require('https');
      const file = fs.createWriteStream(filePath);
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 15000,
      }, (res: any) => {
        if (res.statusCode && res.statusCode >= 400) {
          file.close();
          fs.unlinkSync(filePath);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(`local-file://${filePath}`);
        });
        file.on('error', (err: Error) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      }).on('error', (err: Error) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  }

  private generateAccountId(platform: Platform): string {
    return `${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
