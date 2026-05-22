<template>
  <div
    class="material-card"
    :class="{ 'material-card--selected': selected }"
    @click="handleClick"
  >
    <div class="material-card__preview">
      <img
        v-if="material.type === 'image'"
        :src="thumbnailUrl"
        :alt="material.title"
        class="material-card__image"
        @error="handleImageError"
      />
      <div v-else class="material-card__video">
        <img
          v-if="material.thumbnailPath"
          :src="thumbnailUrl"
          :alt="material.title"
          class="material-card__video-thumb"
          @error="handleImageError"
        />
        <div v-else class="material-card__video-placeholder">
          <el-icon><VideoPlay /></el-icon>
        </div>
        <div class="material-card__video-duration">
          {{ formatDuration(material.duration) }}
        </div>
      </div>

      <div class="material-card__checkbox">
        <el-checkbox :model-value="selected" @change="handleSelect" @click.stop />
      </div>

      <div class="material-card__type-badge">
        <el-icon v-if="material.type === 'image'"><Picture /></el-icon>
        <el-icon v-else><VideoCamera /></el-icon>
      </div>
    </div>

    <div class="material-card__info">
      <div class="material-card__title" :title="material.title">
        {{ material.title }}
      </div>
      <div class="material-card__meta">
        <span>{{ formatFileSize(material.fileSize) }}</span>
        <span v-if="material.width && material.height">
          {{ material.width }}×{{ material.height }}
        </span>
      </div>
    </div>

    <div class="material-card__actions" @click.stop>
      <el-button text size="small" @click="handlePreview">
        <el-icon><View /></el-icon>
      </el-button>
      <el-button text size="small" @click="handleDelete">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';
import { VideoPlay, Picture, VideoCamera, View, Delete } from '@element-plus/icons-vue';
import type { Material } from '../../stores/materials';

const props = defineProps<{
  material: Material;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [id: string, selected: boolean];
  preview: [material: Material];
  delete: [id: string];
}>();

const thumbnailUrl = computed(() => {
  if (props.material.thumbnailPath) {
    return `file://${props.material.thumbnailPath}`;
  }
  if (props.material.type === 'image') {
    return `file://${props.material.filePath}`;
  }
  return '';
});

function handleClick() {
  emit('select', props.material.id, !props.selected);
}

function handleSelect(selected: boolean) {
  emit('select', props.material.id, selected);
}

function handlePreview() {
  emit('preview', props.material);
}

function handleDelete() {
  ElMessageBox.confirm(
    `确定删除素材「${props.material.title}」吗？`,
    '删除素材',
    { type: 'warning' }
  ).then(() => {
    emit('delete', props.material.id);
  }).catch(() => {});
}

function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  target.style.display = 'none';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.material-card {
  width: 180px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.material-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.material-card--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.material-card__preview {
  position: relative;
  width: 100%;
  height: 120px;
  background: var(--el-fill-color-light);
}

.material-card__image,
.material-card__video-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-card__video {
  width: 100%;
  height: 100%;
  position: relative;
}

.material-card__video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--el-text-color-placeholder);
}

.material-card__video-duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.material-card__checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
}

.material-card__type-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px;
  border-radius: 4px;
  font-size: 12px;
}

.material-card__info {
  padding: 8px 12px;
}

.material-card__title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.material-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 4px 8px 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.material-card:hover .material-card__actions {
  opacity: 1;
}
</style>
