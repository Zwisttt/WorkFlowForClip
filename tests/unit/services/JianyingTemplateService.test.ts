import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JianyingTemplateService } from '../../../electron/services/JianyingTemplateService';

const temporaryRoots: string[] = [];

function createFixture(imageCount: 1 | 2): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-jianying-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, 'materials', 'video'), { recursive: true });
  fs.mkdirSync(path.join(root, 'materials', 'audio'), { recursive: true });

  const images = Array.from({ length: imageCount }, (_, index) => ({
    id: `image-${index + 1}`,
    type: 'photo',
    path: `fixture_##/materials/video/original-${index + 1}.png`,
    material_name: `original-${index + 1}.png`,
  }));
  for (let index = 0; index < imageCount; index += 1) {
    fs.writeFileSync(path.join(root, 'materials', 'video', `original-${index + 1}.png`), 'image');
  }
  fs.writeFileSync(path.join(root, 'materials', 'audio', 'original.mp3'), 'audio');

  fs.writeFileSync(path.join(root, 'draft_info.json'), JSON.stringify({
    tracks: [
      { type: 'text', segments: [{ material_id: 'text-1' }] },
      { type: 'video', segments: images.map((image) => ({ material_id: image.id })) },
      { type: 'audio', segments: [{ material_id: 'audio-1' }] },
    ],
    materials: {
      texts: [{
        id: 'text-1',
        content: JSON.stringify({ text: '模板文字', styles: [{ range: [0, 4] }] }),
      }],
      videos: images,
      audios: [{
        id: 'audio-1',
        path: 'fixture_##/materials/audio/original.mp3',
        material_name: 'original.mp3',
      }],
    },
  }));
  fs.writeFileSync(path.join(root, 'draft_meta_info.json'), JSON.stringify({
    draft_name: '旧名字',
  }));
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('JianyingTemplateService', () => {
  it.each([1, 2] as const)('解析并生成 %i 图模板', (imageCount) => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(imageCount);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    temporaryRoots.push(outputRoot);
    const newBackground = path.join(outputRoot, 'new-background.png');
    const newChart = path.join(outputRoot, 'new-chart.png');
    const newAudio = path.join(outputRoot, 'new-audio.mp3');
    fs.writeFileSync(newBackground, 'new-image');
    fs.writeFileSync(newChart, 'new-chart');
    fs.writeFileSync(newAudio, 'new-audio');

    const template = service.inspect(templateRoot, `测试模板-${imageCount}`);
    expect(template.imageSlotKeys).toHaveLength(imageCount);
    expect(template.slots.map((slot) => slot.label)).toEqual(
      imageCount === 2
        ? ['脚本', '底图', '星盘图片', 'BGM素材']
        : ['脚本', '底图', 'BGM素材'],
    );

    const destination = service.generate(template, outputRoot, '作品 A', {
      script: '新的自动化脚本',
      backgroundPath: newBackground,
      chartPath: imageCount === 2 ? newChart : undefined,
      bgmPath: newAudio,
    });
    const draft = JSON.parse(fs.readFileSync(path.join(destination, 'draft_info.json'), 'utf8'));
    const text = JSON.parse(draft.materials.texts[0].content);

    expect(text.text).toBe('新的自动化脚本');
    expect(text.styles[0].range).toEqual([0, 7]);
    expect(draft.materials.videos[0].material_name).toBe('new-background.png');
    if (imageCount === 2) {
      expect(draft.materials.videos[1].material_name).toBe('new-chart.png');
    }
    expect(draft.materials.audios[0].material_name).toBe('new-audio.mp3');
    expect(JSON.parse(fs.readFileSync(path.join(destination, 'draft_meta_info.json'), 'utf8')).draft_name)
      .toBe('作品 A');
  });

  it('拒绝超过首期边界的模板结构', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const draftPath = path.join(templateRoot, 'draft_info.json');
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    draft.materials.texts.push({
      id: 'text-2',
      content: JSON.stringify({ text: '第二段文字' }),
    });
    draft.tracks[0].segments.push({ material_id: 'text-2' });
    fs.writeFileSync(draftPath, JSON.stringify(draft));

    expect(() => service.inspect(templateRoot)).toThrow('当前仅支持 1 个文字槽');
  });
});
