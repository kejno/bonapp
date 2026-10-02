import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  DocumentBuilder,
  OpenAPIObject,
  OperationObject,
  SwaggerModule,
} from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('BNP-563 Swagger request and response schemas (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const config = new DocumentBuilder()
      .setTitle('Bonapp API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document, {
      jsonDocumentUrl: 'api/v1/docs-json',
    });
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('serves OpenAPI JSON with request and successful response models', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/docs-json')
      .expect(200);
    const document = response.body as unknown as OpenAPIObject;
    const paths = Object.values(document.paths);

    expect(paths.length).toBeGreaterThan(0);
    expect(
      Object.keys(document.components?.schemas ?? {}).length,
    ).toBeGreaterThan(0);

    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
    const operations: OperationObject[] = paths.flatMap((path) =>
      methods.flatMap((method) => (path?.[method] ? [path[method]] : [])),
    );
    const operationsWithRequestModels = operations.filter((operation) => {
      const body = operation.requestBody;
      return (
        body !== undefined &&
        !('$ref' in body) &&
        Object.values(body.content ?? {}).some((content) => content.schema)
      );
    });
    const operationsWithResponseModels = operations.filter((operation) =>
      Object.entries(operation.responses ?? {}).some(([status, result]) => {
        if (!/^2\d\d$/.test(status) || !result || '$ref' in result) {
          return false;
        }
        return Object.values(result.content ?? {}).some(
          (content) => content.schema,
        );
      }),
    );

    expect(operationsWithRequestModels.length).toBeGreaterThan(0);
    expect(operationsWithResponseModels.length).toBeGreaterThan(0);
  });

  it('serves the Swagger UI for the generated OpenAPI document', async () => {
    await request(app.getHttpServer() as Server).get('/api/v1/docs').expect(200);
  });
});
