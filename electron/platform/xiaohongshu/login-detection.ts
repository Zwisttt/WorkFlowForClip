export interface XhsLoginDetectionResult {
  loggedIn: boolean;
  reason: string;
  currentUrl?: string;
  errCode?: number | string;
}

export interface XhsProfileResult {
  nickname: string;
  avatarUrl: string;
  homepageUrl: string;
  userId?: string;
  cookieHeader?: string;
}

export interface WebContentsLoginProbe {
  executeJavaScript: (code: string) => Promise<unknown>;
}

export interface PageLoginProbe {
  url: () => string;
  evaluate: <T = unknown>(code: string) => Promise<T>;
}

const XHS_HOST = 'creator.xiaohongshu.com';

export const XHS_REQUIRED_COOKIES = ['web_session', 'a1'] as const;

export interface XhsCookieLike {
  name: string;
  value: string;
  expires?: number;
  expirationDate?: number;
}

const LOGIN_MARKER_SELECTORS = [
  'text="扫码登录"',
  'text="手机登录"',
  'text="短信登录"',
  '[class*="login-tab"]',
  '[class*="login-qrcode"]',
  '[class*="qrcode"]',
  'img[src*="qrcode"]',
  '[class*="login-box"]',
  '[class*="login-page"]',
  'input[placeholder*="手机号"]',
  'input[placeholder*="验证码"]',
];

const LOGIN_MARKER_TEXTS = [
  '扫码登录',
  '手机登录',
  '短信登录',
  '请使用小红书扫码',
  '二维码已过期',
  '二维码已失效',
  '，请在手机上确认登录',
  '已扫码',
  '发送验证码',
  '忘记密码',
  '登 录',
];

const SUCCESS_MARKER_SELECTORS = [
  'a[href*="/publish/publish"]',
  'a[href*="/content/manage"]',
  'a[href*="/datacenter"]',
  '[class*="avatar"] img',
  '[class*="user-avatar"]',
  '[class*="nickname"]',
];

const SUCCESS_MARKER_TEXTS = [
  '发布作品',
  '内容管理',
  '数据中心',
  '保存草稿',
  '发布记录',
  '创作中心',
];

export function isXhsUrl(currentUrl: string): boolean {
  try {
    return new URL(currentUrl).hostname === XHS_HOST ||
      new URL(currentUrl).hostname.endsWith('.xiaohongshu.com');
  } catch {
    return false;
  }
}

export function isXhsInternalUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return url.hostname === XHS_HOST ||
      url.hostname.endsWith('.xiaohongshu.com');
  } catch {
    return false;
  }
}

function getValueByPath(record: unknown, path: string[]): unknown {
  let current = record;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readErrCode(source: unknown): unknown {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  return record.errCode ?? record.errcode ?? record.err_code;
}

export function hasRequiredXhsCookies(cookies: XhsCookieLike[]): boolean {
  const nowSeconds = Date.now() / 1000;
  return XHS_REQUIRED_COOKIES.every((requiredName) =>
    cookies.some((cookie) => {
      const expires = cookie.expirationDate ?? cookie.expires;
      const notExpired = typeof expires !== 'number' || expires <= 0 || expires > nowSeconds;
      return cookie.name === requiredName && cookie.value.trim().length > 0 && notExpired;
    })
  );
}

function readString(source: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function profileScore(source: Record<string, unknown>): number {
  const nickname = readString(source, [
    'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
  ]);
  const avatarUrl = readString(source, [
    'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
  ]);
  return (nickname ? 1 : 0) + (avatarUrl ? 2 : 0);
}

function findXhsProfileObject(source: unknown, depth = 0, visited = new Set<unknown>()): Record<string, unknown> | null {
  if (!source || typeof source !== 'object' || visited.has(source) || depth > 6) {
    return null;
  }

  visited.add(source);
  const record = source as Record<string, unknown>;
  let best: Record<string, unknown> | null = profileScore(record) > 0 ? record : null;
  let bestScore = best ? profileScore(best) : 0;

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = findXhsProfileObject(item, depth + 1, visited);
        const score = candidate ? profileScore(candidate) : 0;
        if (candidate && score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      continue;
    }

    const candidate = findXhsProfileObject(value, depth + 1, visited);
    const score = candidate ? profileScore(candidate) : 0;
    if (candidate && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function buildXhsLoginProbeScript(): string {
  return `
(async function () {
  var loginMarkerSelectors = ${JSON.stringify(LOGIN_MARKER_SELECTORS)};
  var loginMarkerTexts = ${JSON.stringify(LOGIN_MARKER_TEXTS)};
  var successMarkerSelectors = ${JSON.stringify(SUCCESS_MARKER_SELECTORS)};
  var successMarkerTexts = ${JSON.stringify(SUCCESS_MARKER_TEXTS)};

  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasVisibleSelector(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var nodes = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < nodes.length; j++) {
          if (isVisible(nodes[j])) return true;
        }
      } catch (error) {}
    }
    return false;
  }

  function hasText(phrases) {
    var bodyText = document.body && document.body.innerText ? document.body.innerText : '';
    for (var i = 0; i < phrases.length; i++) {
      if (bodyText.indexOf(phrases[i]) >= 0) return true;
    }
    return false;
  }

  if (hasVisibleSelector(loginMarkerSelectors) || hasText(loginMarkerTexts)) {
    return { loggedIn: false, reason: 'login_marker' };
  }

  var hasPageMarker = hasVisibleSelector(successMarkerSelectors) || hasText(successMarkerTexts);

  if (window.location.hostname.indexOf('xiaohongshu.com') < 0) {
    return { loggedIn: false, reason: 'not_xhs' };
  }

  // Check for success markers on page
  if (hasPageMarker) {
    return { loggedIn: true, reason: 'page_marker', currentUrl: window.location.href };
  }

  // Check if we're on an internal page (publish, content manage, etc.)
  var internalPaths = ['/publish/', '/content/', '/datacenter/', '/creator/'];
  var isInternal = internalPaths.some(function(path) {
    return window.location.pathname.indexOf(path) >= 0;
  });

  if (isInternal) {
    // On internal page but no success marker - check for user avatar
    var avatarNodes = document.querySelectorAll('[class*="avatar"] img, [class*="user-avatar"]');
    for (var i = 0; i < avatarNodes.length; i++) {
      if (isVisible(avatarNodes[i])) {
        return { loggedIn: true, reason: 'internal_page_avatar', currentUrl: window.location.href };
      }
    }
    return { loggedIn: true, reason: 'internal_page', currentUrl: window.location.href };
  }

  return { loggedIn: false, reason: 'no_marker', currentUrl: window.location.href };
})()
`;
}

export function buildXhsProfileProbeScript(): string {
  return `
(async function () {
  if (window.location.hostname.indexOf('xiaohongshu.com') < 0) {
    return null;
  }

  function collectRoots() {
    var roots = [];
    function push(root) {
      if (root && roots.indexOf(root) < 0) roots.push(root);
    }
    function scan(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      Array.prototype.forEach.call(root.querySelectorAll('wujie-app'), function (host) {
        if (host && host.shadowRoot) push(host.shadowRoot);
      });
      Array.prototype.forEach.call(root.querySelectorAll('iframe'), function (iframe) {
        try {
          if (iframe.contentDocument) push(iframe.contentDocument);
        } catch (error) {}
      });
    }
    push(document);
    for (var i = 0; i < roots.length; i++) scan(roots[i]);
    return roots;
  }

  function queryAll(selector) {
    var nodes = [];
    collectRoots().forEach(function (root) {
      try {
        nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
      } catch (error) {}
    });
    return nodes.filter(function (node, index) { return nodes.indexOf(node) === index; });
  }

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var trimmed = url.trim().replace(/^url\\((['"]?)(.*?)\\1\\)$/i, '$2');
    if (!trimmed || trimmed.indexOf('data:') === 0 || trimmed.indexOf('blob:') === 0) return '';
    if (trimmed.indexOf('//') === 0) return 'https:' + trimmed;
    try {
      return new URL(trimmed, location.href).toString();
    } catch (error) {
      return trimmed;
    }
  }

  function isAvatarUrl(url) {
    return /xiaohongshu|qlogo|qpic|image|avatar|headimg/i.test(url || '');
  }

  function extractDomAvatar() {
    var candidates = [];
    queryAll('img, image').forEach(function (el) {
      var src = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('xlink:href') || '';
      if (!src && el.getAttribute('srcset')) {
        src = String(el.getAttribute('srcset')).split(',')[0].trim().split(/\\s+/)[0];
      }
      src = normalizeUrl(src);
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login/i.test(src)) candidates.push(src);
    });
    queryAll('[style], [class*="avatar"], [class*="head"], [class*="user"], [class*="account"]').forEach(function (el) {
      var bg = '';
      try {
        bg = (el.ownerDocument.defaultView || window).getComputedStyle(el).backgroundImage || '';
      } catch (error) {}
      var match = bg.match(/url\\((['"]?)(.*?)\\1\\)/i);
      var src = normalizeUrl(match && match[2] ? match[2] : '');
      if (src && isAvatarUrl(src) && !/qrcode|qr_code|login/i.test(src)) candidates.push(src);
    });
    return candidates[0] || '';
  }

  function extractDomNickname() {
    var selectors = [
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="username"]',
      '[class*="account-name"]',
      '[class*="display-name"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = queryAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        var text = (nodes[j].innerText || nodes[j].textContent || '').trim();
        if (text && text.length <= 40 && !/首页|内容管理|数据中心|设置|通知|发布|作品/.test(text)) return text;
      }
    }
    return '';
  }

  var nickname = extractDomNickname();
  var avatarUrl = extractDomAvatar();

  if (!nickname && !avatarUrl) {
    return null;
  }

  return {
    nickname: nickname,
    avatarUrl: avatarUrl,
    homepageUrl: window.location.origin || 'https://creator.xiaohongshu.com',
    userId: ''
  };
})()
`;
}

export function normalizeXhsLoginDetection(
  result: unknown,
  currentUrl: string,
  fallbackReason = 'probe_error'
): XhsLoginDetectionResult {
  if (!result || typeof result !== 'object') {
    return { loggedIn: false, reason: fallbackReason, currentUrl };
  }

  const record = result as Record<string, unknown>;
  const errCode = record.errCode ?? record.errcode ?? record.err_code;

  return {
    loggedIn: record.loggedIn === true,
    reason: typeof record.reason === 'string' ? record.reason : fallbackReason,
    currentUrl,
    errCode: typeof errCode === 'number' || typeof errCode === 'string' ? errCode : undefined,
  };
}

export function normalizeXhsProfile(result: unknown): XhsProfileResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const record = result as Record<string, unknown>;
  const nickname = readString(record, [
    'nickname', 'nickName', 'name', 'userName', 'username', 'displayName',
  ]);
  const avatarUrl = readString(record, [
    'avatarUrl', 'headImgUrl', 'avatar', 'headImg', 'head_img_url', 'logo',
  ]);
  const homepageUrl = typeof record.homepageUrl === 'string' && record.homepageUrl.trim()
    ? record.homepageUrl.trim()
    : `https://${XHS_HOST}`;
  const userId = readString(record, ['userId', 'uniqId', 'userId']) ||
    (typeof record.userId === 'string' && record.userId.trim()
      ? record.userId.trim()
      : undefined);

  if (!nickname && !avatarUrl) {
    return null;
  }

  return { nickname, avatarUrl, homepageUrl, userId };
}

export async function detectXhsLoginInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<XhsLoginDetectionResult> {
  if (!isXhsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_xhs', currentUrl };
  }

  try {
    const result = await webContents.executeJavaScript(buildXhsLoginProbeScript());
    return normalizeXhsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}

export async function detectXhsProfileInWebContents(
  webContents: WebContentsLoginProbe,
  currentUrl: string
): Promise<XhsProfileResult | null> {
  if (!isXhsUrl(currentUrl)) {
    return null;
  }

  try {
    const result = await webContents.executeJavaScript(buildXhsProfileProbeScript());
    return normalizeXhsProfile(result);
  } catch {
    return null;
  }
}

export async function detectXhsProfileInPage(
  page: PageLoginProbe
): Promise<XhsProfileResult | null> {
  if (!isXhsUrl(page.url())) {
    return null;
  }

  try {
    const result = await page.evaluate(buildXhsProfileProbeScript());
    return normalizeXhsProfile(result);
  } catch {
    return null;
  }
}

export async function detectXhsLoginInPage(
  page: PageLoginProbe
): Promise<XhsLoginDetectionResult> {
  const currentUrl = page.url();
  if (!isXhsUrl(currentUrl)) {
    return { loggedIn: false, reason: 'not_xhs', currentUrl };
  }

  try {
    const result = await page.evaluate(buildXhsLoginProbeScript());
    return normalizeXhsLoginDetection(result, currentUrl);
  } catch {
    return { loggedIn: false, reason: 'probe_error', currentUrl };
  }
}