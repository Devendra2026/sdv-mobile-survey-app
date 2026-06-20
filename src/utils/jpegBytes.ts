import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const SURVEY_PHOTO_MAX_WIDTH = 1280;
const SURVEY_PHOTO_JPEG_QUALITY = 0.7;

/** Read local file:// JPEG without base64 (avoids large JS string allocations). */
async function readJpegBytesFromUri(uri: string): Promise<Uint8Array> {
  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Resize/compress a camera or gallery URI for survey upload. */
export async function compressSurveyPhotoUri(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
  jpegBytes: Uint8Array;
}> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: SURVEY_PHOTO_MAX_WIDTH }).renderAsync();

  const compressed = await rendered.saveAsync({
    compress: SURVEY_PHOTO_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  const jpegBytes = await readJpegBytesFromUri(compressed.uri);
  return {
    uri: compressed.uri,
    width: compressed.width,
    height: compressed.height,
    jpegBytes,
  };
}
