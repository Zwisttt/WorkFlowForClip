import { BrowserWindow, ipcMain, shell } from 'electron';
import { Logger } from '../core/Logger';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import { browserManager } from './embedded-browser/browser-manager';
import type { Platform } from './types';

const logger = new Logger('MultiPanelService');

type BrowserMode = 'embedded' | 'external_chrome' | 'external_fingerprint';

interface PanelSession {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode: BrowserMode;
  createdAt: Date;
}

interface ExternalBrowserSession {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode: BrowserMode;
  createdAt: Date;
}

class MultiPanelService {
  private static instance: MultiPanelService;
  private sessions: Map<string, PanelSession> = new Map();
  private externalSessions: Map<string, ExternalBrowserSession> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private activePanelId: string | null = null;
  private maxPanels = 10;
  private ipcHandlersRegistered = false;

  private constructor() {}

  static getInstance(): MultiPanelService {
    if (!MultiPanelService.instance) {
      MultiPanelService.instance = new MultiPanelService();
    }
    return MultiPanelService.instance;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    browserManager.setMainWindow(window);
    this.registerIPCHandlers();

    window.on('resize', () => {
      this.layoutActivePanel();
    });
  }

  private registerIPCHandlers(): void {
    if (this.ipcHandlersRegistered) return;

    ipcMain.on('panel-address:navigate', (_, data: { panelId: string; url?: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session || !data.url) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.loadURL(data.url);
    });

    ipcMain.on('panel-address:back', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.goBack();
    });

    ipcMain.on('panel-address:forward', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.goForward();
    });

    ipcMain.on('panel-address:refresh', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.reload();
    });

    ipcMain.on('panel-address:open-devtools', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (!session) return;
      const view = browserManager.getView(session.accountId);
      view?.webContents.openDevTools({ mode: 'detach' });
    });

    this.ipcHandlersRegistered = true;
  }

  async openPanel(accountId: string): Promise<PanelSession | null> {
    if (!this.mainWindow) {
      logger.error('主窗口未设置');
      return null;
    }

    const totalPanels = this.sessions.size + this.externalSessions.size;
    if (totalPanels >= this.maxPanels) {
      logger.warn('已达到最大面板数量限制');
      return null;
    }

    const existingEmbedded = Array.from(this.sessions.values()).find(s => s.accountId === accountId);
    if (existingEmbedded) {
      this.focusPanel(existingEmbedded.id);
      return existingEmbedded;
    }

    const existingExternal = Array.from(this.externalSessions.values()).find(s => s.accountId === accountId);
    if (existingExternal) {
      return this.createVirtualPanelSession(existingExternal);
    }

    const account = this.getAccount(accountId);
    if (!account) {
      logger.error(`账号不存在: ${accountId}`);
      return null;
    }

    const browserMode = account.browser_mode || 'embedded';

    if (browserMode !== 'embedded') {
      return this.openExternalBrowser(accountId, browserMode, account);
    }

    const id = `panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const creatorUrl = this.getCreatorCenterUrl(account.platform);
      await browserManager.createEmbeddedTab(accountId, account.platform as Platform, creatorUrl);

      const session: PanelSession = {
        id,
        accountId,
        platform: account.platform,
        nickname: account.nickname || account.platform,
        browser_mode: browserMode,
        createdAt: new Date(),
      };

      this.sessions.set(id, session);

      browserManager.attachToMainWindow(accountId);

      this.activePanelId = id;
      this.layoutActivePanel();

      this.mainWindow.webContents.send('panel-browser:url-change', id, creatorUrl);

      logger.info(`打开面板: ${account.nickname} (${account.platform})`);
      return session;
    } catch (error) {
      logger.error(`打开面板失败: ${accountId}`, error);
      return null;
    }
  }

  private async openExternalBrowser(
    accountId: string,
    browserMode: BrowserMode,
    account: { platform: string; nickname: string }
  ): Promise<PanelSession | null> {
    const id = `external_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const creatorUrl = this.getCreatorCenterUrl(account.platform);

    try {
      await shell.openExternal(creatorUrl);

      const externalSession: ExternalBrowserSession = {
        id,
        accountId,
        platform: account.platform,
        nickname: account.nickname || account.platform,
        browser_mode: browserMode,
        createdAt: new Date(),
      };

      this.externalSessions.set(id, externalSession);
      logger.info(`打开外部浏览器: ${account.nickname} (${account.platform})`);

      return this.createVirtualPanelSession(externalSession);
    } catch (error) {
      logger.error(`打开外部浏览器失败: ${accountId}`, error);
      return null;
    }
  }

  private createVirtualPanelSession(external: ExternalBrowserSession): PanelSession {
    return {
      id: external.id,
      accountId: external.accountId,
      platform: external.platform,
      nickname: external.nickname,
      browser_mode: external.browser_mode,
      createdAt: external.createdAt,
    };
  }

  closePanel(panelId: string): void {
    const session = this.sessions.get(panelId);
    if (session) {
      browserManager.closeTab(session.accountId);
      this.sessions.delete(panelId);

      if (this.activePanelId === panelId) {
        this.activePanelId = null;
        const remaining = Array.from(this.sessions.values());
        if (remaining.length > 0) {
          this.focusPanel(remaining[0].id);
        }
      }

      logger.info(`关闭面板: ${panelId}`);
      return;
    }

    if (this.externalSessions.has(panelId)) {
      this.externalSessions.delete(panelId);
      logger.info(`关闭外部浏览器会话: ${panelId}`);
    }
  }

  focusPanel(panelId: string): void {
    const prevSession = this.activePanelId ? this.sessions.get(this.activePanelId) : null;
    if (prevSession) {
      browserManager.detachFromMainWindow(prevSession.accountId);
    }

    const session = this.sessions.get(panelId);
    if (!session) return;

    browserManager.attachToMainWindow(session.accountId);
    this.activePanelId = panelId;
    this.layoutActivePanel();
  }

  getActivePanels(): PanelSession[] {
    return Array.from(this.sessions.values());
  }

  private layoutActivePanel(): void {
    if (!this.mainWindow || !this.activePanelId) return;

    const session = this.sessions.get(this.activePanelId);
    if (!session) return;

    const [contentWidth, contentHeight] = this.mainWindow.getContentSize();
    const sidebarWidth = 280;
    const headerHeight = 60;
    const addressBarHeight = 40;

    const bounds = {
      x: sidebarWidth,
      y: headerHeight + addressBarHeight,
      width: contentWidth - sidebarWidth,
      height: contentHeight - headerHeight - addressBarHeight,
    };

    browserManager.layoutEmbedded(session.accountId, bounds);
  }

  private getAccount(accountId: string): { platform: string; nickname: string; browser_mode: BrowserMode } | null {
    if (!isDatabaseAvailable()) return null;
    const db = getDatabase();

    const row = db.prepare(`
      SELECT a.platform, a.nickname, a.browser_mode
      FROM accounts a
      WHERE a.id = ?
    `).get(accountId) as { platform: string; nickname: string | null; browser_mode: string | null } | undefined;

    return row ? {
      platform: row.platform,
      nickname: row.nickname || '',
      browser_mode: (row.browser_mode as BrowserMode) || 'embedded'
    } : null;
  }

  private getCreatorCenterUrl(platform: string): string {
    const urls: Record<string, string> = {
      douyin: 'https://creator.douyin.com/',
      xiaohongshu: 'https://creator.xiaohongshu.com/',
      kuaishou: 'https://cp.kuaishou.com/',
      weixin_video: 'https://channels.weixin.qq.com/',
      bilibili: 'https://member.bilibili.com/platform/home',
    };
    return urls[platform] || 'about:blank';
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      browserManager.closeTab(session.accountId);
    }
    this.sessions.clear();
    this.externalSessions.clear();
    browserManager.dispose();
    logger.info('MultiPanelService 已释放');
  }
}

export const multiPanelService = MultiPanelService.getInstance();
