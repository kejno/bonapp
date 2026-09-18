import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('readiness', () => {
    it('returns an incomplete checklist while readiness modules are unavailable', () => {
      expect(appController.getReadiness()).toEqual({
        menuReady: false,
        tablesReady: false,
        paymentsReady: false,
      });
    });
  });

  describe('shift', () => {
    it('confirms that a shift was opened', () => {
      expect(appController.openShift()).toEqual({ opened: true });
    });
  });
});
