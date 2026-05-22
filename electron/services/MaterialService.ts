import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import type {
  Material,
  MaterialRow,
  MaterialGroup,
  MaterialGroupRow,
  MaterialType,
  MaterialStatus,
  IMaterialService,
  UploadPayload,
  ListQuery,
  ListResult,
  BatchDeleteResult,
  FileValidation,
  MaterialUploadedPayload,
  MaterialDeletedPayload,
  GroupCreatedPayload,
} from './types/material';
import { MaterialEvent, FILE_VALIDATION } from './types/material';

const logger = new Logger('MaterialService');

const MATERIALS_DIR = path.join(process.cwd(), 'data', 'materials');
const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');
const DEFAULT_PAGE_SIZE = 20;

export class MaterialService implements IMaterialService {
  private static instance: MaterialService;
  private initialized = false;

  private constructor() {}

  static getInstance(): MaterialService {
    if (!MaterialService.instance) {
      MaterialService.instance = new MaterialService();
    }
    return MaterialService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.ensureSchema();
    this.ensureDirectories();

    this.initialized = true;
    logger.info('素材管理服务初始化完成');
  }

  dispose(): void {
    this.initialized = false;
    logger.info('素材管理服务已释放');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(MATERIALS_DIR)) {
      fs.mkdirSync(MATERIALS_DIR, { recursive: true });
    }
    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }
  }

  private ensureSchema(): void {
    const db = this.requireDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS material_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('image', 'video', 'article')),
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        thumbnail_path TEXT,
        platform TEXT,
        group_id TEXT,
        metadata TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'deleted')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES material_groups(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
      CREATE INDEX IF NOT EXISTS idx_materials_group ON materials(group_id);
      CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
      CREATE INDEX IF NOT EXISTS idx_materials_created ON materials(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_materials_group_type ON materials(group_id, type);
    `);
  }

  private requireDatabase(): ReturnType<typeof getDatabase> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }
    return getDatabase();
  }

  // ─── 素材查询 ──────────────────────────────────────────

  async listMaterials(query: ListQuery = {}): Promise<ListResult> {
    const db = this.requireDatabase();
    const { groupId, type, status = 'active', page = 1, pageSize = DEFAULT_PAGE_SIZE } = query;

    const conditions: string[] = ["status = ?"];
    const params: unknown[] = [status];

    if (groupId) {
      conditions.push('group_id = ?');
      params.push(groupId);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    const where = conditions.join(' AND ');

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM materials WHERE ${where}`).get(...params) as { count: number };
    const total = totalRow.count;

    const offset = (page - 1) * pageSize;
    const rows = db.prepare(
      `SELECT * FROM materials WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as MaterialRow[];

    return {
      items: rows.map((r) => this.rowToMaterial(r)),
      total,
      page,
      pageSize,
    };
  }

  async getMaterial(id: string): Promise<Material | null> {
    const db = this.requireDatabase();
    const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRow | undefined;
    if (!row) return null;
    return this.rowToMaterial(row);
  }

  // ─── 素材上传 ──────────────────────────────────────────

  async uploadMaterial(payload: UploadPayload): Promise<Material> {
    const { filePath, groupId, title, description } = payload;

    this.validateFilePath(filePath);

    const validation = this.validateFile(filePath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const ext = path.extname(filePath).toLowerCase();
    const materialType = validation.type!;
    const filename = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    const destPath = path.join(MATERIALS_DIR, filename);

    fs.copyFileSync(filePath, destPath);

    const thumbnailPath = await this.generateThumbnail(destPath, materialType);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const materialTitle = title || path.basename(filePath, ext);

    const db = this.requireDatabase();
    db.prepare(
      `INSERT INTO materials (id, type, title, description, file_path, thumbnail_path, group_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(id, materialType, materialTitle, description || null, destPath, thumbnailPath, groupId || null, now, now);

    const material = await this.getMaterial(id);

    const eventPayload: MaterialUploadedPayload = { materialId: id, type: materialType };
    EventBus.getInstance().emit(MaterialEvent.MATERIAL_UPLOADED, eventPayload);

    logger.info(`素材上传成功: id=${id}, type=${materialType}`);
    return material!;
  }

  // ─── 素材删除 ──────────────────────────────────────────

  async deleteMaterial(id: string): Promise<void> {
    const material = await this.getMaterial(id);
    if (!material) throw new Error(`素材不存在: ${id}`);

    this.deleteMaterialFiles(material);

    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE materials SET status = ?, updated_at = ? WHERE id = ?').run('deleted', now, id);

    const eventPayload: MaterialDeletedPayload = { materialId: id };
    EventBus.getInstance().emit(MaterialEvent.MATERIAL_DELETED, eventPayload);

    logger.info(`素材删除成功: id=${id}`);
  }

  async deleteMaterials(ids: string[]): Promise<BatchDeleteResult> {
    const success: string[] = [];
    const failed: string[] = [];

    const db = this.requireDatabase();
    const transaction = db.transaction(() => {
      for (const id of ids) {
        try {
          const material = this.getMaterialSync(id);
          if (!material) {
            failed.push(id);
            continue;
          }
          this.deleteMaterialFiles(material);
          const now = new Date().toISOString();
          db.prepare('UPDATE materials SET status = ?, updated_at = ? WHERE id = ?').run('deleted', now, id);
          success.push(id);
        } catch (err) {
          logger.error(`删除素材失败: id=${id}`, err);
          failed.push(id);
        }
      }
    });

    transaction();

    logger.info(`批量删除完成: success=${success.length}, failed=${failed.length}`);
    return { success, failed };
  }

  // ─── 分组操作 ──────────────────────────────────────────

  async listGroups(): Promise<MaterialGroup[]> {
    const db = this.requireDatabase();
    const rows = db.prepare('SELECT * FROM material_groups ORDER BY created_at ASC').all() as MaterialGroupRow[];
    return rows.map((r) => this.rowToGroup(r));
  }

  async createGroup(name: string, color?: string): Promise<MaterialGroup> {
    const db = this.requireDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO material_groups (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
      id, name, color || null, now
    );

    const group = await this.listGroups().then((groups) => groups.find((g) => g.id === id));

    const eventPayload: GroupCreatedPayload = { groupId: id, name };
    EventBus.getInstance().emit(MaterialEvent.GROUP_CREATED, eventPayload);

    logger.info(`素材分组创建成功: id=${id}, name=${name}`);
    return group!;
  }

  async deleteGroup(id: string): Promise<void> {
    const db = this.requireDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE materials SET group_id = NULL, updated_at = ? WHERE group_id = ?').run(now, id);
    db.prepare('DELETE FROM material_groups WHERE id = ?').run(id);

    EventBus.getInstance().emit(MaterialEvent.GROUP_DELETED, { groupId: id });
    logger.info(`素材分组删除成功: id=${id}`);
  }

  // ─── 下载 ──────────────────────────────────────────────

  async downloadMaterials(ids: string[], targetDir: string): Promise<void> {
    if (!fs.existsSync(targetDir)) {
      throw new Error('目标目录不存在');
    }

    for (const id of ids) {
      const material = await this.getMaterial(id);
      if (!material) {
        logger.warn(`下载跳过: 素材不存在 id=${id}`);
        continue;
      }

      const filename = path.basename(material.filePath);
      const destPath = path.join(targetDir, filename);

      if (!this.validateFilePath(material.filePath)) {
        throw new Error(`文件路径安全验证失败: ${material.filePath}`);
      }

      fs.copyFileSync(material.filePath, destPath);
    }

    logger.info(`素材下载完成: count=${ids.length}, dir=${targetDir}`);
  }

  // ─── 文件验证 ──────────────────────────────────────────

  validateFile(filePath: string): FileValidation {
    const ext = path.extname(filePath).toLowerCase();

    for (const [type, config] of Object.entries(FILE_VALIDATION)) {
      if ((config.extensions as readonly string[]).includes(ext)) {
        const stats = fs.statSync(filePath);
        if (stats.size > config.maxSize) {
          return {
            valid: false,
            error: `文件大小超过限制（最大 ${this.formatSize(config.maxSize)}）`,
            type: type as MaterialType,
          };
        }
        return { valid: true, type: type as MaterialType };
      }
    }

    return { valid: false, error: '不支持的文件格式' };
  }

  validateFilePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const materialsDir = path.resolve(MATERIALS_DIR);
    const dataDir = path.resolve(process.cwd(), 'data');
    return resolved.startsWith(materialsDir) || resolved.startsWith(dataDir);
  }

  // ─── 私有工具 ──────────────────────────────────────────

  private getMaterialSync(id: string): Material | null {
    const db = this.requireDatabase();
    const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRow | undefined;
    if (!row) return null;
    return this.rowToMaterial(row);
  }

  private deleteMaterialFiles(material: Material): void {
    try {
      if (material.filePath && fs.existsSync(material.filePath)) {
        fs.unlinkSync(material.filePath);
      }
      if (material.thumbnailPath && fs.existsSync(material.thumbnailPath)) {
        fs.unlinkSync(material.thumbnailPath);
      }
    } catch (err) {
      logger.error(`删除素材文件失败: id=${material.id}`, err);
    }
  }

  private async generateThumbnail(filePath: string, type: MaterialType): Promise<string | null> {
    if (type === 'article') return null;

    try {
      const filename = `${path.basename(filePath, path.extname(filePath))}_thumb.jpg`;
      const thumbnailPath = path.join(THUMBNAILS_DIR, filename);

      if (type === 'image') {
        const sharp = await import('sharp');
        await sharp.default(filePath)
          .resize(300, 200, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);
        return thumbnailPath;
      }

      if (type === 'video') {
        return null;
      }

      return null;
    } catch (err) {
      logger.error(`缩略图生成失败: ${filePath}`, err);
      return null;
    }
  }

  private sanitizeFilename(filename: string): string {
    return path.basename(filename).replace(/\.\./g, '');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  private rowToMaterial(row: MaterialRow): Material {
    return {
      id: row.id,
      type: row.type as MaterialType,
      title: row.title,
      description: row.description || undefined,
      filePath: row.file_path,
      thumbnailPath: row.thumbnail_path || undefined,
      platform: row.platform || undefined,
      groupId: row.group_id || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      status: row.status as MaterialStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToGroup(row: MaterialGroupRow): MaterialGroup {
    return {
      id: row.id,
      name: row.name,
      color: row.color || undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

export const materialService = MaterialService.getInstance();
