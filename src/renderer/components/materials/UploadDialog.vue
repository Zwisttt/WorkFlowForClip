<template>
  <el-dialog
    v-model="visible"
    title="上传素材"
    width="560px"
    @close="handleClose"
  >
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :on-change="handleFileChange"
      :on-remove="handleFileRemove"
      :before-upload="beforeUpload"
      accept="image/*,video/*"
      drag
      multiple
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">
        拖拽文件到此处，或<em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 JPG、PNG、GIF、WebP、MP4、MOV 格式，单文件不超过 500MB
        </div>
      </template>
    </el-upload>

    <el-form :model="form" label-width="80px" class="upload-form">
      <el-form-item label="目标分组">
        <el-select v-model="form.groupId" placeholder="不分组" clearable>
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="素材标题">
        <el-input v-model="form.title" placeholder="留空则使用文件名" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选描述" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="uploading" :disabled="fileList.length === 0" @click="handleUpload">
        上传 ({{ fileList.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import type { UploadFile } from 'element-plus';
import type { MaterialGroup } from '../../stores/materials';

const props = defineProps<{
  groups: MaterialGroup[];
  currentGroupId?: string | null;
}>();

const emit = defineEmits<{
  upload: [payload: { filePath: string; groupId?: string; title?: string; description?: string }];
}>();

const visible = defineModel<boolean>({ default: false });

const uploadRef = ref();
const uploading = ref(false);
const fileList = ref<UploadFile[]>([]);

const form = reactive({
  groupId: '' as string,
  title: '',
  description: '',
});

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
];

watch(visible, (newVal) => {
  if (newVal && props.currentGroupId) {
    form.groupId = props.currentGroupId;
  }
});

function beforeUpload(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    ElMessage.error(`文件 ${file.name} 超过 500MB 限制`);
    return false;
  }
  return true;
}

function handleFileChange(file: UploadFile) {
  fileList.value.push(file);
}

function handleFileRemove(file: UploadFile) {
  fileList.value = fileList.value.filter(f => f.uid !== file.uid);
}

async function handleUpload() {
  if (fileList.value.length === 0) {
    ElMessage.warning('请选择要上传的文件');
    return;
  }

  uploading.value = true;

  for (const file of fileList.value) {
    const filePath = (file.raw as any)?.path;
    if (!filePath) continue;

    emit('upload', {
      filePath,
      groupId: form.groupId || undefined,
      title: form.title || undefined,
      description: form.description || undefined,
    });
  }

  uploading.value = false;
  visible.value = false;
  resetForm();
}

function handleClose() {
  visible.value = false;
  resetForm();
}

function resetForm() {
  fileList.value = [];
  form.groupId = '';
  form.title = '';
  form.description = '';
}
</script>

<style scoped>
.upload-form {
  margin-top: 16px;
}

.el-upload__tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
