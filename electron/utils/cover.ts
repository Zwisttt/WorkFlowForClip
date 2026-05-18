import sharp from 'sharp';

export interface CoverDimensions {
  width: number;
  height: number;
}

export async function cropCover(
  inputPath: string,
  outputPath: string,
  ratio: string
): Promise<void> {
  const [w, h] = ratio.split(':').map(Number);
  const metadata = await sharp(inputPath).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Cannot read image dimensions');

  const targetRatio = w / h;
  const currentRatio = metadata.width / metadata.height;

  let extractWidth: number;
  let extractHeight: number;
  let left: number;
  let top: number;

  if (currentRatio > targetRatio) {
    extractHeight = metadata.height;
    extractWidth = Math.round(metadata.height * targetRatio);
    left = Math.round((metadata.width - extractWidth) / 2);
    top = 0;
  } else {
    extractWidth = metadata.width;
    extractHeight = Math.round(metadata.width / targetRatio);
    left = 0;
    top = Math.round((metadata.height - extractHeight) / 2);
  }

  await sharp(inputPath)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .toFile(outputPath);
}
