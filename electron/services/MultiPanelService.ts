import { BrowserWindow, BrowserView, ipcMain, shell } from 'electron';
import * as path from 'path';
import { Logger } from '../core/Logger';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import { browserPool } from '../core/BrowserPool';

const logger = new Logger('MultiPanelService');

type BrowserMode = 'embedded' | 'external_chrome' | 'external_fingerprint';

interface PanelSession {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode: BrowserMode;
  view: BrowserView | null;
  addressBarView: BrowserView | null;
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
    this.registerIPCHandlers();
  }

  private registerIPCHandlers(): void {
    if (this.ipcHandlersRegistered) return;

    ipcMain.on('panel-address:navigate', (_, data: { panelId: string; url?: string }) => {
      const session = this.sessions.get(data.panelId);
      if (data.url && session?.view) {
        session.view.webContents.loadURL(data.url);
      }
    });

    ipcMain.on('panel-address:back', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      session?.view?.webContents.goBack();
    });

    ipcMain.on('panel-address:forward', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      session?.view?.webContents.goForward();
    });

    ipcMain.on('panel-address:refresh', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      session?.view?.webContents.reload();
    });

    ipcMain.on('panel-address:open-devtools', (_, data: { panelId: string }) => {
      const session = this.sessions.get(data.panelId);
      if (session?.view) {
        session.view.webContents.openDevTools({ mode: 'detach' });
      }
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
      await browserPool.acquireContext(accountId);

      const addressBarView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '..', 'browser-ui', 'panel-address-bar-preload.js'),
        },
      });

      const addressBarPath = path.join(__dirname, '..', 'browser-ui', 'panel-address-bar.html');
      await addressBarView.webContents.loadFile(addressBarPath);

      const view = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const session: PanelSession = {
        id,
        accountId,
        platform: account.platform,
        nickname: account.nickname || account.platform,
        browser_mode: browserMode,
        view,
        addressBarView,
        createdAt: new Date(),
      };

      this.sessions.set(id, session);
      this.layoutPanels();

      const creatorUrl = this.getCreatorCenterUrl(account.platform);
      view.webContents.loadURL(creatorUrl);

      addressBarView.webContents.send('panel-address:url-change', id, creatorUrl);

      view.webContents.on('did-navigate', (_, url) => {
        session.addressBarView?.webContents.send('panel-address:url-change', id, url);
      });

      view.webContents.on('did-navigate-in-page', (_, url) => {
        session.addressBarView?.webContents.send('panel-address:url-change', id, url);
      });

      view.webContents.on('did-start-loading', () => {
        session.addressBarView?.webContents.send('panel-address:loading-state', id, true);
      });

      view.webContents.on('did-stop-loading', () => {
        session.addressBarView?.webContents.send('panel-address:loading-state', id, false);
      });

      view.webContents.on('did-finish-load', () => {
        session.addressBarView?.webContents.send('panel-address:navigation-state', id,
          session.view?.webContents.canGoBack() || false,
          session.view?.webContents.canGoForward() || false
        );
      });

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
      view: null,
      addressBarView: null,
      createdAt: external.createdAt,
    };
  }

  closePanel(panelId: string): void {
    const session = this.sessions.get(panelId);
    if (session) {
      if (session.addressBarView) {
        this.mainWindow?.removeBrowserView(session.addressBarView);
        session.addressBarView.webContents.close();
      }

      if (session.view) {
        this.mainWindow?.removeBrowserView(session.view);
        session.view.webContents.close();
      }

      this.sessions.delete(panelId);
      this.layoutPanels();
      logger.info(`关闭面板: ${panelId}`);
      return;
    }

    if (this.externalSessions.has(panelId)) {
      this.externalSessions.delete(panelId);
      logger.info(`关闭外部浏览器会话: ${panelId}`);
    }
  }

  focusPanel(panelId: string): void {
    const session = this.sessions.get(panelId);
    if (!session || !session.view) return;

    this.mainWindow?.setTopBrowserView(session.view);
    session.view.webContents.focus();
  }

  getActivePanels(): PanelSession[] {
    return Array.from(this.sessions.values());
  }

  private layoutPanels(): void {
    if (!this.mainWindow) return;

    const { width, height } = this.mainWindow.getBounds();
    const sidebarWidth = 280;
    const headerHeight = 60;
    const addressBarHeight = 48;

    const panels = Array.from(this.sessions.values());
    const panelWidth = (width - sidebarWidth) / Math.max(panels.length, 1);
    const contentHeight = height - headerHeight - addressBarHeight;

    panels.forEach((session, index) => {
      const x = sidebarWidth + index * panelWidth;

      if (session.addressBarView) {
        session.addressBarView.setBounds({
          x,
          y: headerHeight,
          width: panelWidth,
          height: addressBarHeight,
        });
      }

      if (session.view) {
        session.view.setBounds({
          x,
          y: headerHeight + addressBarHeight,
          width: panelWidth,
          height: contentHeight,
        });
      }
    });
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
      wechat: 'https://channels.weixin.qq.com/',
    };
    return urls[platform] || 'about:blank';
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      if (session.addressBarView) {
        this.mainWindow?.removeBrowserView(session.addressBarView);
        session.addressBarView.webContents.close();
      }
      if (session.view) {
        this.mainWindow?.removeBrowserView(session.view);
        session.view.webContents.close();
      }
    }
    this.sessions.clear();
    this.externalSessions.clear();
    logger.info('MultiPanelService 已释放');
  }
}

export const multiPanelService = MultiPanelService.getInstance();
