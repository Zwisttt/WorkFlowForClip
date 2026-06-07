export const XHS_URLS = {
  creatorHome: 'https://creator.xiaohongshu.com/',
  publish: 'https://creator.xiaohongshu.com/publish/publish',
  contentManage: 'https://creator.xiaohongshu.com/content/manage',
  loginPage: 'https://creator.xiaohongshu.com/login',
  statsOverview: 'https://creator.xiaohongshu.com/datacenter/overview',
  statsContent: 'https://creator.xiaohongshu.com/datacenter/content',
} as const;

export const LOGIN_SELECTORS = {
  scanLoginTab: 'get_by_text("扫码登录", exact=true).first',
  qrCodeImage: '.login-box-container img, [class*="qrcode"] img',
  qrCodeContainer: '[class*="login-box"], .login-box-container',
  phoneLoginText: 'get_by_text("手机登录")',
  scanLoginText: 'get_by_text("扫码登录")',
  qrExpiredText: 'get_by_text("二维码已失效")',
  qrRefreshBtn: '.qrcode-refresh, button:has-text("点击刷新")',
  avatarIndicator: '.user-avatar, .avatar, [class*="avatar"]',
  usernameText: '.user-name, .nickname, [class*="username"]',
  /** 登录框容器 — 竞品用 div[class*='login-box'] 检测登录状态 */
  loginBox: 'div[class*="login-box"]',
  /** 切换到扫码面板的图片按钮 — 竞品用 img.css-wemwzq */
  loginSwitchImg: 'img.css-wemwzq',
} as const;

export const UPLOAD_SELECTORS = {
  videoUploadBtn: 'get_by_text("上传视频", exact=false).first',
  videoFileInput: 'input[type="file"][accept*="video"], input[type="file"]',
  imageFileInput: 'input[type="file"][accept*="image"]',
  uploadProgress: '.upload-progress, [class*="progress"]',
  uploadSuccessText: 'get_by_text("上传成功", exact=false)',
  uploadFailedText: 'get_by_text("上传失败", exact=false)',

  titleInput: 'input[placeholder*="标题"], input[placeholder*="填写标题"], #title-textarea',
  titleInputFallback: '.title-input input, [class*="title"] input',

  descEditor: '.ql-editor, [contenteditable="true"], .desc-input, [class*="description"]',
  descEditorFallback: '.c_input_box, .input-box textarea',

  topicInput: 'input[placeholder*="话题"], input[placeholder*="搜索话题"], [class*="topic"] input',
  topicSuggestion: '.topic-item, [class*="topic"] li, [class*="suggest"] li',
  topicTag: '.topic-tag, [class*="tag"] span',

  mentionInput: 'input[placeholder*="@"], input[placeholder*="提及"]',
  mentionSuggestion: '.mention-item, [class*="user-list"] li',

  coverSelectBtn: 'get_by_text("设置封面", exact=false), button:has-text("封面")',
  coverModal: '.cover-modal, [class*="cover-modal"], [class*="cover-dialog"]',
  coverUploadInput: 'input[type="file"][accept*="image"]',
  coverConfirmBtn: 'button:has-text("确定"), button:has-text("完成")',
  coverAutoSelect: '.cover-auto, [class*="auto-cover"]',

  publishButton: 'button:has-text("发布"), button:has-text("发表")',
  publishButtonPrimary: 'button.publishBtn, [class*="publish-btn"], [class*="submit-btn"]',

  publishSuccessToast: 'get_by_text("发布成功", exact=false)',
  publishFailedToast: 'get_by_text("发布失败", exact=false)',
  publishDraftToast: 'get_by_text("已保存草稿", exact=false)',

  scheduleOption: '[class*="schedule"], [class*="timer"]',
} as const;

export const STATS_SELECTORS = {
  totalPlayCount: '[class*="play-count"], [class*="playCount"]',
  totalLikeCount: '[class*="like-count"], [class*="likeCount"]',
  totalCommentCount: '[class*="comment-count"], [class*="commentCount"]',
  totalShareCount: '[class*="share-count"], [class*="shareCount"]',
  totalCollectCount: '[class*="collect-count"], [class*="collectCount"]',
  totalFanCount: '[class*="fan-count"], [class*="fanCount"]',
  statCard: '.stat-card, [class*="data-card"], [class*="stat-item"]',
  dateRangePicker: '.date-range, [class*="date-picker"]',
  dateRangeOptions: '.date-option, [class*="date"] li',
} as const;

export const PUBLISH_URL_PATTERNS = {
  publishPage: '/publish/publish',
  contentManage: '/content/manage',
  dataCenter: '/datacenter/',
} as const;
