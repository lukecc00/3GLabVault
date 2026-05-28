import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private client: any;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.initializeClient();
    await this.ensureBucketExists();
  }

  private initializeClient() {
    const endPoint = this.configService.getOrThrow('MINIO_ENDPOINT');
    const port = this.configService.getOrThrow('MINIO_PORT');
    const useSSL = this.configService.getOrThrow('MINIO_USE_SSL') === 'true';
    const accessKey = this.configService.getOrThrow('MINIO_ACCESS_KEY');
    const secretKey = this.configService.getOrThrow('MINIO_SECRET_KEY');
    this.bucket = this.configService.getOrThrow('MINIO_BUCKET');

    this.client = new (Client as any)({
      endPoint,
      port: Number(port),
      useSSL,
      accessKey,
      secretKey,
    });
  }

  private async ensureBucketExists() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async putObject(
    objectName: string,
    stream: Buffer | NodeJS.ReadableStream,
    metaData?: any,
  ) {
    return this.client.putObject(this.bucket, objectName, stream, metaData);
  }

  async getObject(objectName: string) {
    return this.client.getObject(this.bucket, objectName);
  }

  async statObject(objectName: string) {
    return this.client.statObject(this.bucket, objectName);
  }

  async removeObject(objectName: string) {
    return this.client.removeObject(this.bucket, objectName);
  }
}
