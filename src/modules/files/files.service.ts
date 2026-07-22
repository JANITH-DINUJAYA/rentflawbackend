import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  /**
   * Uploads an incoming multipart file directly to Cloudinary.
   * Utilizes Node 20's global fetch, Blob, and FormData.
   */
  async uploadToCloudinary(file: MulterFile): Promise<{ public_url: string }> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.error('Cloudinary credentials missing in .env config.');
      throw new BadRequestException(
        'Cloudinary storage credentials are not configured on the server.',
      );
    }

    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const folder = 'rentflaw_receipts';

    // Cloudinary signature generation:
    // Sort parameters alphabetically, join with & and append apiSecret at the end.
    const paramString = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramString + apiSecret)
      .digest('hex');

    // Convert Node Buffer to ArrayBuffer (required by Blob constructor in strict TS)
    const arrayBuffer = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: file.mimetype });

    const formData = new FormData();
    formData.append('file', blob, file.originalname);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('folder', folder);
    formData.append('signature', signature);

    // Determine target resource endpoint (images vs generic files/PDFs)
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    const resourceType = (isImage || isPdf) ? 'image' : 'raw';

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Cloudinary REST API error response: ${errorText}`);
        throw new BadRequestException(`Cloudinary rejected upload: ${errorText}`);
      }

      const result = await response.json();
      return { public_url: result.secure_url };
    } catch (error) {
      this.logger.error('Failed to perform Cloudinary upload', error);
      throw new BadRequestException('File upload storage failed. Please try again.');
    }
  }

  /**
   * Fallback S3 generator for legacy references if needed.
   */
  async generateUploadUrl(filename: string, contentType: string): Promise<{ upload_url: string; public_url: string }> {
    const key = `uploads/${Date.now()}-${filename}`;
    const public_url = `${process.env.R2_PUBLIC_URL || 'https://pub-url.dev'}/${key}`;
    return { upload_url: public_url, public_url };
  }
}
